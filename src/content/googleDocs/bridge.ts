/**
 * Runs inside the Google Docs page, in its own JavaScript world.
 *
 * Everything Docs knows about its text lives on objects the page owns, so this
 * file is the only part of the extension that can reach them. It answers
 * requests from the content script over DOM events and keeps the API surface
 * it exposes as small as possible: read the text, measure a span, move the
 * caret, replace a range.
 *
 * All of it rests on `_docs_annotate_getAnnotatedText`, which is undocumented.
 * Every call is defensive, and a failure degrades to "Docs is unsupported"
 * rather than breaking the page.
 */
import {
	BRIDGE_CHANGED,
	BRIDGE_READY,
	BRIDGE_REQUEST,
	BRIDGE_RESPONSE,
	type BridgeRequest,
	type BridgeResponse,
	type Rect,
} from './protocol';

interface AnnotatedText {
	getText(): string;
	getSelection?(): Array<{ start: number; end: number }> | undefined;
	setSelection?(start: number, end: number): void;
}

declare global {
	interface Window {
		_docs_annotate_canvas_by_ext?: string;
		_docs_annotate_getAnnotatedText?: (token: string) => Promise<AnnotatedText> | AnnotatedText;
	}
}

const EDITOR_SELECTOR = '.kix-appview-editor';
const CARET_SELECTOR = '.kix-cursor-caret';
/** Where Docs listens for keyboard and clipboard input. */
const INPUT_SELECTOR = '.docs-texteventtarget-iframe';

let annotated: AnnotatedText | undefined;

async function getAnnotated(): Promise<AnnotatedText | undefined> {
	const token = window._docs_annotate_canvas_by_ext;
	const get = window._docs_annotate_getAnnotatedText;
	if (!token || typeof get !== 'function') return undefined;

	try {
		annotated = await get(token);
		return annotated;
	} catch {
		return undefined;
	}
}

/**
 * Docs uses `\v` for a line break inside a paragraph and `\u0003` to end one.
 * Mapping both to `\n` keeps offsets one-to-one, which is what the rest of the
 * extension assumes.
 */
function normalise(text: string): string {
	return text.replace(/[\v\u0003]/g, '\n');
}

function readSelection(source: AnnotatedText): { start: number; end: number } {
	const range = source.getSelection?.()?.[0];
	return { start: range?.start ?? 0, end: range?.end ?? 0 };
}

/** The input element Docs actually listens to, inside its hidden iframe. */
function inputTarget(): HTMLElement | null {
	const frame = document.querySelector<HTMLIFrameElement>(INPUT_SELECTOR);
	const body = frame?.contentDocument?.body;
	return (body?.querySelector('[contenteditable]') as HTMLElement | null) ?? body ?? null;
}

/**
 * Measures where a span of text sits on screen.
 *
 * There is no range API over a canvas, so the caret is the ruler: put it at
 * each end of the span, read where Docs drew it, and build a box from that. A
 * span that wraps across lines comes back as two boxes, one per line.
 */
function caretRect(): DOMRect | null {
	const caret = document.querySelector<HTMLElement>(CARET_SELECTOR);
	const rect = caret?.getBoundingClientRect();
	return rect && rect.height > 0 ? rect : null;
}

async function measure(source: AnnotatedText, start: number, end: number): Promise<Rect[]> {
	if (!source.setSelection || end <= start) return [];

	const original = readSelection(source);

	source.setSelection(start, start);
	const from = caretRect();
	source.setSelection(end, end);
	const to = caretRect();

	source.setSelection(original.start, original.end);
	if (!from || !to) return [];

	// Same line: one box between the two carets.
	if (Math.abs(from.top - to.top) < from.height / 2) {
		return [{ x: from.left, y: from.top, width: Math.max(1, to.left - from.left), height: from.height }];
	}

	// Wrapped: the first line runs to the editor's right edge, the last starts
	// at its left. Anything in between is left unmarked rather than guessed at.
	const editor = document.querySelector(EDITOR_SELECTOR)?.getBoundingClientRect();
	if (!editor) return [];

	return [
		{ x: from.left, y: from.top, width: Math.max(1, editor.right - from.left - 72), height: from.height },
		{ x: to.left - 72, y: to.top, width: 72, height: to.height },
	].filter((rect) => rect.width > 0);
}

/**
 * Replaces a range by selecting it and pasting over it.
 *
 * Docs owns its undo stack and document model; a paste is the one input it
 * accepts from outside that it treats as a normal, undoable edit. Writing to
 * the DOM directly would be ignored at best.
 */
function replace(source: AnnotatedText, start: number, end: number, text: string): boolean {
	const target = inputTarget();
	if (!target || !source.setSelection) return false;

	source.setSelection(start, end);

	const data = new DataTransfer();
	data.setData('text/plain', text);

	return target.dispatchEvent(
		new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
	);
}

async function handle(request: BridgeRequest): Promise<BridgeResponse> {
	const source = annotated ?? (await getAnnotated());
	if (!source) return { id: request.id, ok: false, error: 'Google Docs did not expose its text.' };

	switch (request.type) {
		case 'read': {
			const selection = readSelection(source);
			return {
				id: request.id,
				ok: true,
				state: {
					text: normalise(source.getText()),
					selectionStart: selection.start,
					selectionEnd: selection.end,
				},
			};
		}
		case 'caret': {
			const selection = readSelection(source);
			const rects = await measure(source, selection.start, selection.start + 1);
			return { id: request.id, ok: true, rects };
		}
		case 'rects':
			return { id: request.id, ok: true, rects: await measure(source, request.start, request.end) };
		case 'replace': {
			// The user may have typed since the issue was reported, so only
			// replace text that still says what we think it says.
			const current = normalise(source.getText()).slice(request.start, request.end);
			if (current !== request.expected) {
				return { id: request.id, ok: false, error: 'The text changed; nothing was replaced.' };
			}
			return { id: request.id, ok: true, done: replace(source, request.start, request.end, request.text) };
		}
	}
}

document.addEventListener(BRIDGE_REQUEST, (event) => {
	const request = (event as CustomEvent<BridgeRequest>).detail;
	void handle(request)
		.catch((error: unknown) => ({
			id: request.id,
			ok: false as const,
			error: error instanceof Error ? error.message : String(error),
		}))
		.then((response) => {
			document.dispatchEvent(new CustomEvent(BRIDGE_RESPONSE, { detail: response }));
		});
});

// Docs reflows constantly; tell the content script so it can re-measure.
const editor = document.querySelector(EDITOR_SELECTOR);
if (editor) {
	let queued = false;
	const notify = () => {
		if (queued) return;
		queued = true;
		requestAnimationFrame(() => {
			queued = false;
			document.dispatchEvent(new CustomEvent(BRIDGE_CHANGED));
		});
	};
	new MutationObserver(notify).observe(editor, { childList: true, subtree: true, characterData: true });
	editor.addEventListener('scroll', notify, { passive: true });
}

void getAnnotated().then((source) => {
	if (source) document.dispatchEvent(new CustomEvent(BRIDGE_READY));
});

export {};
