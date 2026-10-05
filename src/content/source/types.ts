/**
 * One interface over the three kinds of editable surface we support, so the
 * renderer and the controller never branch on element type.
 *
 * All offsets are indices into `getText()` — the field's plain text. Mapping
 * those onto whatever the browser actually lays out is each adapter's job.
 */
export interface SourceElement {
	readonly element: HTMLElement;

	/** The plain text the linter sees. */
	getText(): string;

	/**
	 * A range suitable for `CSS.highlights`, or `null` when this surface cannot
	 * produce one (old Chromium without `createValueRange`). Callers fall back
	 * to `rectsForSpan`.
	 */
	highlightRange(start: number, end: number): AbstractRange | null;

	/** Viewport-relative rects covering the span, for the overlay fallback. */
	rectsForSpan(start: number, end: number): DOMRect[];

	/** Where the caret is, as an offset into `getText()`, or `null` if unfocused. */
	caretOffset(): number | null;

	/** Viewport rect of the caret, used to anchor the suggestion card. */
	caretRect(): DOMRect | null;

	/**
	 * Replace `[start, end)` with `replacement`.
	 *
	 * Must look like typing: React and Vue track input values themselves and
	 * will revert a plain `element.value = …` on their next render.
	 */
	applyEdit(start: number, end: number, replacement: string): void;
}

/** `true` when the browser can highlight inside `<textarea>`/`<input>` values. */
export const SUPPORTS_VALUE_RANGE =
	typeof HTMLTextAreaElement !== 'undefined' &&
	'createValueRange' in HTMLTextAreaElement.prototype;

/** `true` when the CSS Custom Highlight API is available at all. */
export const SUPPORTS_HIGHLIGHTS = typeof CSS !== 'undefined' && 'highlights' in CSS;

declare global {
	interface HTMLTextAreaElement {
		/** Chromium 152+. Returns an `OpaqueRange` over the element's value. */
		createValueRange?(start: number, end: number): AbstractRange;
	}
	interface HTMLInputElement {
		createValueRange?(start: number, end: number): AbstractRange;
	}
}
