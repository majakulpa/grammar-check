import { editFor, send, type Issue, type Settings } from '../shared/protocol';
import { SuggestionCard, matchCase } from './card';
import { HighlightRenderer } from './render/highlights';
import { OverlayRenderer } from './render/overlay';
import { SUPPORTS_HIGHLIGHTS } from './source/types';
import { isCheckable, sourceFor, type SourceElement } from './source';
import { findRepetitions } from './repetition';
import { sentenceAround } from './sentences';

/** Long enough that typing a word does not trigger a check per keystroke. */
const DEBOUNCE_MS = 400;
/** Below this, there is not enough context for the checks to be useful. */
const MIN_LENGTH = 12;
/** Guards against pathological inputs — a code editor, a pasted log file. */
const MAX_LENGTH = 100_000;

let settings: Settings | undefined;
let source: SourceElement | undefined;
let issues: Issue[] = [];
let debounce: ReturnType<typeof setTimeout> | undefined;

/** Issues the user dismissed this session, keyed by text so they stay dismissed. */
const ignored = new Set<string>();
const ignoreKey = (issue: Issue) => `${issue.kind}\u0000${issue.original}\u0000${issue.message}`;

const highlights = SUPPORTS_HIGHLIGHTS ? new HighlightRenderer() : undefined;
let overlay: OverlayRenderer | undefined;

const card = new SuggestionCard({
	onAccept(issue, suggestion) {
		const edit = editFor(issue, suggestion);
		applyToField(edit.start, edit.end, edit.text);
	},
	onIgnore(issue) {
		ignored.add(ignoreKey(issue));
		card.hide();
		issues = issues.filter((i) => ignoreKey(i) !== ignoreKey(issue));
		paint();
	},
	onAddToDictionary(word) {
		card.hide();
		void addToDictionary(word);
	},
	onReplaceWord(issue, word) {
		applyToField(issue.start, issue.end, matchCase(issue.original, word));
	},
	sentenceFor(issue) {
		return source ? sentenceAround(source.getText(), issue.start) : null;
	},
	onRewrite(start, end, text) {
		applyToField(start, end, text);
	},
});

function applyToField(start: number, end: number, replacement: string): void {
	card.hide();
	source?.applyEdit(start, end, replacement);
	scheduleCheck();
}

async function addToDictionary(word: string): Promise<void> {
	const current = settings ?? (await loadSettings());
	const dictionary = [...new Set([...current.dictionary, word])];
	await chrome.storage.local.set({ settings: { ...current, dictionary } });
	settings = { ...current, dictionary };
	scheduleCheck();
}

async function loadSettings(): Promise<Settings> {
	const response = await send({ type: 'getSettings' });
	if (response.type !== 'settings') throw new Error('Could not load settings');
	settings = response.settings;
	card.setApiKeyAvailable(Boolean(response.settings.anthropicApiKey));
	return response.settings;
}

function isActive(): boolean {
	if (!settings?.enabled) return false;
	return !settings.disabledHosts.includes(location.hostname);
}

function paint(): void {
	if (!source) return;

	const rendered = highlights?.render(source, issues) ?? false;
	if (rendered) {
		overlay?.clear();
		return;
	}

	// Either the browser has no Highlight API, or this source could not produce
	// ranges (a form control on Chromium older than 152).
	highlights?.clear();
	overlay ??= new OverlayRenderer();
	overlay.render(source, issues);
}

function clearAll(): void {
	issues = [];
	highlights?.clear();
	overlay?.clear();
	card.hide();
}

async function check(): Promise<void> {
	if (!source || !isActive()) return;

	const text = source.getText();
	if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) {
		clearAll();
		return;
	}

	const response = await send({ type: 'lint', text });
	if (response.type === 'error') {
		console.warn('[grammar-check]', response.message);
		return;
	}
	if (response.type !== 'lint') return;

	// The field may have changed while the linter was working.
	if (source.getText() !== text) return;

	issues = [...response.issues, ...findRepetitions(text)]
		.filter((issue) => !ignored.has(ignoreKey(issue)))
		.sort((a, b) => a.start - b.start);

	paint();
}

function scheduleCheck(): void {
	clearTimeout(debounce);
	debounce = setTimeout(() => void check(), DEBOUNCE_MS);
}

function issueAtCaret(): Issue | undefined {
	const offset = source?.caretOffset();
	if (offset === null || offset === undefined) return undefined;
	// `<=` on `end` so clicking just past the last character still counts.
	return issues.find((issue) => offset >= issue.start && offset <= issue.end);
}

function syncCard(): void {
	const issue = issueAtCaret();
	if (!issue) {
		card.hide();
		return;
	}
	if (card.currentIssue === issue) return;

	const anchor = source?.caretRect();
	if (anchor) card.show(issue, anchor);
}

function focusField(element: HTMLElement): void {
	const next = sourceFor(element);
	if (!next) return;
	if (source?.element === next.element) return;

	clearAll();
	source = next;
	scheduleCheck();
}

document.addEventListener(
	'focusin',
	(event) => {
		const target = event.target;
		if (target instanceof HTMLElement && isCheckable(target)) focusField(target);
	},
	true,
);

document.addEventListener(
	'input',
	(event) => {
		if (event.target === source?.element) {
			card.hide();
			scheduleCheck();
		}
	},
	true,
);

// The caret moves for reasons other than typing, and each one may expose or
// hide an issue. `selectionchange` covers arrow keys, clicks and programmatic
// moves in one listener.
document.addEventListener('selectionchange', () => {
	if (source) syncCard();
});

document.addEventListener(
	'click',
	(event) => {
		if (card.contains(event.target)) return;
		if (event.target === source?.element) {
			// Let the caret settle before reading it.
			setTimeout(syncCard, 0);
			return;
		}
		card.hide();
	},
	true,
);

document.addEventListener('keydown', (event) => {
	if (event.key === 'Escape' && card.currentIssue) {
		card.hide();
		event.stopPropagation();
	}
});

chrome.storage.local.onChanged.addListener((changes) => {
	if (!changes.settings) return;
	settings = changes.settings.newValue as Settings;
	card.setApiKeyAvailable(Boolean(settings.anthropicApiKey));
	if (!isActive()) clearAll();
	else scheduleCheck();
});

void loadSettings().then(() => {
	const active = document.activeElement;
	if (active instanceof HTMLElement && isCheckable(active)) focusField(active);
});
