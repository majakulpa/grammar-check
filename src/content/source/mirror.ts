/**
 * Measuring text geometry inside a `<textarea>`/`<input>` has no direct API, so
 * we build an off-screen div that lays the same text out under the same styles
 * and measure there instead.
 *
 * This is only used where we cannot avoid it — caret and span rects — never on
 * the per-keystroke path.
 */

/** Properties that change where a glyph lands. Anything else is irrelevant. */
const COPIED_PROPERTIES = [
	'boxSizing',
	'width',
	'height',
	'borderTopWidth',
	'borderRightWidth',
	'borderBottomWidth',
	'borderLeftWidth',
	'paddingTop',
	'paddingRight',
	'paddingBottom',
	'paddingLeft',
	'fontStyle',
	'fontVariant',
	'fontWeight',
	'fontStretch',
	'fontSize',
	'fontSizeAdjust',
	'lineHeight',
	'fontFamily',
	'textAlign',
	'textTransform',
	'textIndent',
	'textDecoration',
	'letterSpacing',
	'wordSpacing',
	'tabSize',
	'direction',
	'whiteSpace',
	'wordBreak',
	'overflowWrap',
] as const;

let mirror: HTMLDivElement | undefined;

function getMirror(): HTMLDivElement {
	if (mirror?.isConnected) return mirror;

	mirror = document.createElement('div');
	mirror.setAttribute('data-grammar-check-mirror', '');
	mirror.style.position = 'absolute';
	mirror.style.top = '0';
	mirror.style.left = '0';
	mirror.style.visibility = 'hidden';
	mirror.style.pointerEvents = 'none';
	// Keeps the mirror out of the page's own layout and screen-reader output.
	mirror.style.transform = 'translate(-100%, -100%)';
	mirror.setAttribute('aria-hidden', 'true');
	document.body.appendChild(mirror);
	return mirror;
}

function syncStyles(field: HTMLTextAreaElement | HTMLInputElement, target: HTMLDivElement): void {
	const computed = window.getComputedStyle(field);
	for (const property of COPIED_PROPERTIES) {
		target.style[property] = computed[property];
	}

	// A single-line input never wraps, however wide its content grows.
	target.style.whiteSpace = field instanceof HTMLInputElement ? 'pre' : 'pre-wrap';
	target.style.overflowWrap = field instanceof HTMLInputElement ? 'normal' : 'break-word';
	target.style.overflow = 'hidden';
}

/**
 * Lay the field's value out in the mirror and return viewport rects for
 * `[start, end)`, corrected for the field's position and scroll offset.
 */
export function measureSpan(
	field: HTMLTextAreaElement | HTMLInputElement,
	start: number,
	end: number,
): DOMRect[] {
	const target = getMirror();
	syncStyles(field, target);

	const value = field.value;
	const before = document.createTextNode(value.slice(0, start));
	const span = document.createElement('span');
	span.textContent = value.slice(start, end);
	// A trailing newline is not laid out unless something follows it.
	const after = document.createTextNode(`${value.slice(end)}​`);

	target.replaceChildren(before, span, after);

	const mirrorBox = target.getBoundingClientRect();
	const fieldBox = field.getBoundingClientRect();
	const dx = fieldBox.left - mirrorBox.left - field.scrollLeft;
	const dy = fieldBox.top - mirrorBox.top - field.scrollTop;

	return [...span.getClientRects()].map(
		(rect) => new DOMRect(rect.left + dx, rect.top + dy, rect.width, rect.height),
	);
}

/** Viewport rect of the caret at `offset`, as a zero-width box. */
export function measureCaret(
	field: HTMLTextAreaElement | HTMLInputElement,
	offset: number,
): DOMRect | null {
	// Measure the character before the caret so the box sits on the right line.
	const [rect] = measureSpan(field, Math.max(0, offset - 1), offset);
	if (!rect) return null;
	return new DOMRect(rect.right, rect.top, 0, rect.height);
}
