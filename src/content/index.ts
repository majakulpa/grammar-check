import { DEFAULT_SETTINGS, editFor, send, type Issue, type Settings } from '../shared/protocol';
import { SuggestionCard } from './card';
import { HighlightRenderer } from './render/highlights';
import { OverlayRenderer } from './render/overlay';
import { SUPPORTS_HIGHLIGHTS } from './source/types';
import { isCheckable, sourceFor, type SourceElement } from './source';
import {
	GoogleDocsSource,
	findGoogleDocsEditor,
	onGoogleDocsChanged,
} from './googleDocs/source';
import { holdWorkerAwake, releaseWorker } from './keepAlive';
import { enrichReadability } from './readability';
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
		// The card already matched the original's capitalisation.
		applyToField(issue.start, issue.end, word);
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
	settings = { ...current, dictionary };
	await chrome.storage.local.set({ settings });
	scheduleCheck();
}

/**
 * Shared across concurrent callers so a burst of focus events makes one
 * request, and cleared on failure so the next call retries rather than
 * leaving the tab permanently inert.
 */
let pending: Promise<Settings> | undefined;

function loadSettings(): Promise<Settings> {
	pending ??= send({ type: 'getSettings' })
		.then((response) => {
			if (response.type !== 'settings') throw new Error('Could not load settings');
			settings = response.settings;
			card.setApiKeyAvailable(Boolean(response.settings.anthropicApiKey));
			return response.settings;
		})
		.catch((error: unknown) => {
			pending = undefined;
			throw error;
		});
	return pending;
}

function isActive(current: Settings): boolean {
	if (!current.enabled) return false;
	return !current.disabledHosts.includes(location.hostname);
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
	if (!source) return;

	// A field can be focused before the first settings round-trip finishes.
	// Awaiting here is what stops that race from silently disabling the tab.
	const current = settings ?? (await loadSettings().catch(() => undefined));
	if (!current || !isActive(current)) return;

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

	issues = [...response.issues.map(enrichReadability), ...findRepetitions(text)]
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
	holdWorkerAwake();
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
	'focusout',
	(event) => {
		if (event.target !== source?.element) return;
		// Let the worker shut down once the user has left the field, but not so
		// eagerly that clicking into the suggestion card costs a cold start.
		setTimeout(() => {
			if (document.activeElement !== source?.element) releaseWorker();
		}, 5_000);
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

	// `newValue` is absent when settings are removed or storage is cleared, so
	// fall back to the defaults rather than dropping `undefined` into state the
	// rest of this file assumes is populated.
	settings = {
		...DEFAULT_SETTINGS,
		...(changes.settings.newValue as Partial<Settings> | undefined),
	};
	card.setApiKeyAvailable(Boolean(settings.anthropicApiKey));
	if (isActive(settings)) scheduleCheck();
	else clearAll();
});

/**
 * Google Docs never gives us a text field, so it cannot arrive through
 * `focusin` like every other surface. The editor is adopted as the source and
 * polled instead: Docs reports no input events we can rely on, and the bridge
 * that reads it runs as its own content script in the page's world.
 */
function startGoogleDocs(): void {
	const editor = findGoogleDocsEditor();
	if (!editor) return;

	const docs = new GoogleDocsSource(editor);
	source = docs;
	holdWorkerAwake();

	const sync = async () => {
		if (await docs.refresh()) scheduleCheck();
	};

	onGoogleDocsChanged(() => void sync());
	// Typing changes nothing in the DOM we can observe, so this is the floor.
	setInterval(() => void sync(), 1500);
	void sync();
}

void loadSettings().then(() => {
	const active = document.activeElement;
	if (active instanceof HTMLElement && isCheckable(active)) focusField(active);
});

// A field focused during page load would otherwise wait for the next keystroke.
document.addEventListener('DOMContentLoaded', () => {
	const active = document.activeElement;
	if (active instanceof HTMLElement && isCheckable(active)) focusField(active);
});

// Docs builds its editor well after load, so wait for it to appear.
if (location.hostname === 'docs.google.com') {
	const waitForEditor = setInterval(() => {
		if (!findGoogleDocsEditor()) return;
		clearInterval(waitForEditor);
		startGoogleDocs();
	}, 500);
	setTimeout(() => clearInterval(waitForEditor), 60_000);
}
