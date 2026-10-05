import { measureCaret, measureSpan } from './mirror';
import { SUPPORTS_VALUE_RANGE, type SourceElement } from './types';

type Field = HTMLTextAreaElement | HTMLInputElement;

/**
 * React and Vue cache the value they last rendered on the DOM node. Assigning
 * `field.value` directly leaves that cache stale, so the next render reverts
 * the edit. `insertText` is what makes the framework — and the browser's own
 * undo stack — see a real user edit; the prototype-setter path is the fallback
 * for the handful of fields where `execCommand` is refused.
 */
function replaceLikeTyping(field: Field, start: number, end: number, text: string): void {
	field.focus();
	field.setSelectionRange(start, end);

	if (document.execCommand('insertText', false, text)) return;

	const prototype =
		field instanceof HTMLTextAreaElement
			? HTMLTextAreaElement.prototype
			: HTMLInputElement.prototype;
	const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
	const value = field.value;

	setter?.call(field, value.slice(0, start) + text + value.slice(end));
	field.dispatchEvent(new Event('input', { bubbles: true }));
	field.setSelectionRange(start + text.length, start + text.length);
}

export class TextFieldSource implements SourceElement {
	constructor(readonly element: Field) {}

	getText(): string {
		return this.element.value;
	}

	highlightRange(start: number, end: number): AbstractRange | null {
		if (!SUPPORTS_VALUE_RANGE) return null;
		return this.element.createValueRange?.(start, end) ?? null;
	}

	rectsForSpan(start: number, end: number): DOMRect[] {
		const clip = this.element.getBoundingClientRect();
		return measureSpan(this.element, start, end).filter(
			// The field scrolls; drop anything that landed outside the visible box.
			(rect) => rect.bottom > clip.top && rect.top < clip.bottom,
		);
	}

	caretOffset(): number | null {
		if (document.activeElement !== this.element) return null;
		return this.element.selectionStart;
	}

	caretRect(): DOMRect | null {
		const offset = this.caretOffset();
		if (offset === null) return null;
		return measureCaret(this.element, offset);
	}

	applyEdit(start: number, end: number, replacement: string): void {
		replaceLikeTyping(this.element, start, end, replacement);
	}
}
