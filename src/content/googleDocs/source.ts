import type { SourceElement } from '../source/types';
import {
	BRIDGE_CHANGED,
	BRIDGE_REQUEST,
	BRIDGE_RESPONSE,
	type BridgeCall,
	type BridgeResponse,
	type Rect,
} from './protocol';

const EDITOR_SELECTOR = '.kix-appview-editor';
const REQUEST_TIMEOUT_MS = 2000;

let nextId = 1;

/** One round trip to the bridge, which lives in the page's own world. */
function ask(call: BridgeCall): Promise<BridgeResponse> {
	const id = nextId++;

	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			document.removeEventListener(BRIDGE_RESPONSE, onResponse);
			resolve({ id, ok: false, error: 'The Google Docs bridge did not answer.' });
		}, REQUEST_TIMEOUT_MS);

		function onResponse(event: Event) {
			const response = (event as CustomEvent<BridgeResponse>).detail;
			if (response.id !== id) return;

			clearTimeout(timer);
			document.removeEventListener(BRIDGE_RESPONSE, onResponse);
			resolve(response);
		}

		document.addEventListener(BRIDGE_RESPONSE, onResponse);
		document.dispatchEvent(new CustomEvent(BRIDGE_REQUEST, { detail: { ...call, id } }));
	});
}

/**
 * Google Docs as a `SourceElement`.
 *
 * Everything the interface asks for is synchronous, but Docs can only be read
 * across an event round trip. The gap is bridged by keeping the last known
 * state in memory and refreshing it in the background: `getText` and
 * `caretOffset` answer from that snapshot, which is at most one frame stale —
 * and the controller re-checks on every edit anyway.
 */
export class GoogleDocsSource implements SourceElement {
	readonly element: HTMLElement;

	private text = '';
	private selectionStart = 0;
	private rects = new Map<string, Rect[]>();

	constructor(editor: HTMLElement) {
		this.element = editor;
	}

	/** Pulls the current text and caret across from the page's world. */
	async refresh(): Promise<boolean> {
		const response = await ask({ type: 'read' });
		if (!response.ok || !('state' in response)) return false;

		const changed = response.state.text !== this.text;
		this.text = response.state.text;
		this.selectionStart = response.state.selectionStart;
		if (changed) this.rects.clear();
		return changed;
	}

	getText(): string {
		return this.text;
	}

	/** Docs has no DOM ranges, so the CSS Highlight path cannot be used. */
	highlightRange(): null {
		return null;
	}

	rectsForSpan(start: number, end: number): DOMRect[] {
		const cached = this.rects.get(`${start}:${end}`);
		if (cached) return cached.map((r) => new DOMRect(r.x, r.y, r.width, r.height));

		// Measuring moves the caret, so it cannot happen during a paint. Kick it
		// off and let the next paint use the result.
		void ask({ type: 'rects', start, end }).then((response) => {
			if (response.ok && 'rects' in response) this.rects.set(`${start}:${end}`, response.rects);
		});
		return [];
	}

	caretOffset(): number | null {
		return this.selectionStart;
	}

	caretRect(): DOMRect | null {
		const [rect] = this.rectsForSpan(this.selectionStart, this.selectionStart + 1);
		return rect ?? this.element.getBoundingClientRect();
	}

	applyEdit(start: number, end: number, replacement: string): void {
		void ask({
			type: 'replace',
			start,
			end,
			text: replacement,
			expected: this.text.slice(start, end),
		});
	}
}

/** The Docs editor, if this page is a document and the bridge has loaded. */
export function findGoogleDocsEditor(): HTMLElement | null {
	if (location.hostname !== 'docs.google.com') return null;
	return document.querySelector<HTMLElement>(EDITOR_SELECTOR);
}

export function onGoogleDocsChanged(listener: () => void): void {
	document.addEventListener(BRIDGE_CHANGED, listener);
}
