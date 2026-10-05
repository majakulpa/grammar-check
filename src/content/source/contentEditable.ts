import { flattenText, offsetOf, positionAt, rangeFor } from './offsets';
import type { SourceElement } from './types';

export class ContentEditableSource implements SourceElement {
	constructor(readonly element: HTMLElement) {}

	getText(): string {
		return flattenText(this.element);
	}

	highlightRange(start: number, end: number): AbstractRange | null {
		return rangeFor(this.element, start, end);
	}

	rectsForSpan(start: number, end: number): DOMRect[] {
		const range = rangeFor(this.element, start, end);
		return range ? [...range.getClientRects()] : [];
	}

	caretOffset(): number | null {
		const selection = window.getSelection();
		if (!selection?.focusNode) return null;
		if (!this.element.contains(selection.focusNode)) return null;
		return offsetOf(this.element, selection.focusNode, selection.focusOffset);
	}

	caretRect(): DOMRect | null {
		const selection = window.getSelection();
		if (!selection?.rangeCount) return null;

		const range = selection.getRangeAt(0).cloneRange();
		range.collapse(true);

		// A collapsed range in an empty block has no rects of its own.
		const [rect] = range.getClientRects();
		return rect ?? range.startContainer.parentElement?.getBoundingClientRect() ?? null;
	}

	/**
	 * Replaces via the selection and `insertText` so the page's editor —
	 * ProseMirror, Quill, Lexical and friends all listen for `beforeinput` —
	 * records the change as an ordinary edit it can undo.
	 */
	applyEdit(start: number, end: number, replacement: string): void {
		const from = positionAt(this.element, start);
		const to = positionAt(this.element, end);
		if (!from || !to) return;

		const range = document.createRange();
		range.setStart(from.node, Math.min(from.offset, from.node.data.length));
		range.setEnd(to.node, Math.min(to.offset, to.node.data.length));

		const selection = window.getSelection();
		if (!selection) return;

		this.element.focus();
		selection.removeAllRanges();
		selection.addRange(range);

		if (!document.execCommand('insertText', false, replacement)) {
			// Last resort. Loses the page's undo entry but still fires `input`.
			range.deleteContents();
			range.insertNode(document.createTextNode(replacement));
			this.element.dispatchEvent(new InputEvent('input', { bubbles: true }));
		}
	}
}
