import { Dialect, LocalLinter, SuggestionKind, type Lint, type Linter } from 'harper.js';
import { binary } from 'harper.js/binary';
import { LRUCache } from 'lru-cache';
import type { Issue, Rule, Settings, Suggestion } from '../shared/protocol';
import { getSettings } from './settings';

/**
 * `LocalLinter`, not `WorkerLinter`: an MV3 service worker cannot spawn a
 * dedicated `Worker`, so the WASM runs on the worker's own thread. That thread
 * is not any page's main thread, so blocking it does not jank the UI.
 *
 * The binary is loaded as a real `.wasm` asset rather than the inlined build:
 * the dictionary makes it 16MB, and base64-inlining that into the worker bundle
 * would add a third again in size plus a JS parse on every cold start. Fetching
 * it from the extension's own origin lets Chrome cache the compiled module.
 */
let linter: Linter | undefined;
let linterDialect: Dialect | undefined;

const DIALECTS: Record<string, Dialect> = {
	American: Dialect.American,
	British: Dialect.British,
	Australian: Dialect.Australian,
	Canadian: Dialect.Canadian,
};

/** Keyed by `${dialect}\u0000${text}`. Re-linting an untouched paragraph is free. */
const cache = new LRUCache<string, Issue[]>({ max: 500 });

async function getLinter(dialect: Dialect): Promise<Linter> {
	if (linter && linterDialect === dialect) return linter;

	const active = new LocalLinter({ binary, dialect });
	await active.setup();

	// Rule overrides live on the linter instance, so they have to be re-applied
	// to each new one rather than set once at install time.
	const { rules } = await getSettings();
	if (Object.keys(rules).length > 0) {
		await active.setLintConfig({ ...(await active.getLintConfig()), ...rules });
	}

	linter = active;
	linterDialect = dialect;
	return active;
}

/** Every check Harper offers, with the user's overrides applied. */
export async function listRules(): Promise<Rule[]> {
	const settings = await getSettings();
	const active = await getLinter(DIALECTS[settings.dialect] ?? Dialect.American);

	const [descriptions, config] = await Promise.all([
		active.getLintDescriptions(),
		active.getLintConfig(),
	]);

	return Object.entries(descriptions)
		.map(([name, description]) => ({
			name,
			// Harper writes these in Markdown; the options page shows plain text.
			description: description.replace(/[`*_]/g, ''),
			// `null` means "Harper's default", which for a listed rule is on.
			enabled: config[name] ?? true,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** Warm the WASM up so the first real keystroke is not the one that pays for it. */
export async function warmUp(): Promise<void> {
	const settings = await getSettings();
	await getLinter(DIALECTS[settings.dialect] ?? Dialect.American);
}

function toSuggestionKind(kind: SuggestionKind): Suggestion['kind'] {
	switch (kind) {
		case SuggestionKind.Remove:
			return 'remove';
		case SuggestionKind.InsertAfter:
			return 'insertAfter';
		default:
			return 'replace';
	}
}

/**
 * Harper's `Lint` objects are WASM-backed handles: they cannot cross a message
 * port and they must be freed. Flatten each one into a plain, structured-clonable
 * `Issue` here, at the boundary.
 */
function unpack(lint: Lint): Issue {
	const span = lint.span();
	const start = span.start;
	const end = span.end;
	span.free();

	const suggestions: Suggestion[] = lint.suggestions().map((sug) => {
		const unpacked: Suggestion = {
			kind: toSuggestionKind(sug.kind()),
			text: sug.get_replacement_text(),
		};
		sug.free();
		return unpacked;
	});

	return {
		start,
		end,
		kind: lint.lint_kind(),
		kindLabel: lint.lint_kind_pretty(),
		message: lint.message(),
		suggestions,
		original: lint.get_problem_text(),
	};
}

export async function lint(text: string): Promise<Issue[]> {
	const settings = await getSettings();
	const dialect = DIALECTS[settings.dialect] ?? Dialect.American;

	const key = `${settings.dialect}\u0000${text}`;
	const cached = cache.get(key);
	if (cached) return cached;

	const active = await getLinter(dialect);
	// Fields hold prose, not Markdown; Harper's default would eat `*` and `#`.
	const lints = await active.lint(text, { language: 'plaintext' });

	const dictionary = new Set(settings.dictionary.map((w) => w.toLowerCase()));
	const issues = lints
		.map((l) => {
			const issue = unpack(l);
			l.free();
			return issue;
		})
		.filter((issue) => !(issue.kind === 'Spelling' && dictionary.has(issue.original.toLowerCase())));

	cache.set(key, issues);
	return issues;
}

/**
 * Called when settings change. Cached issues always go, since they were
 * produced under the old settings. The linter itself only has to be rebuilt
 * when something baked into the instance changed — adding a word to the
 * dictionary is filtered at the boundary and does not need a new one.
 */
export function invalidate(previous: Settings, next: Settings): void {
	cache.clear();

	const rebuild =
		previous.dialect !== next.dialect ||
		JSON.stringify(previous.rules) !== JSON.stringify(next.rules);

	if (rebuild) {
		linter = undefined;
		linterDialect = undefined;
	}
}
