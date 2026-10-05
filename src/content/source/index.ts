import { ContentEditableSource } from './contentEditable';
import { TextFieldSource } from './textField';
import type { SourceElement } from './types';

export type { SourceElement } from './types';

/** Input types that hold prose. `email`, `url`, `password` and friends do not. */
const CHECKABLE_INPUT_TYPES = new Set(['text', 'search', '']);

/** Whether we should be checking this element at all. */
export function isCheckable(element: Element): element is HTMLElement {
	if (!(element instanceof HTMLElement)) return false;
	if (element.isContentEditable) {
		// `isContentEditable` is inherited, so every descendant reports true.
		// Only the outermost host is a field; nested ones would double-report.
		return element.parentElement?.isContentEditable !== true;
	}
	if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
	if (element instanceof HTMLInputElement) {
		return (
			CHECKABLE_INPUT_TYPES.has(element.type) && !element.readOnly && !element.disabled
		);
	}
	return false;
}

export function sourceFor(element: HTMLElement): SourceElement | null {
	if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
		return new TextFieldSource(element);
	}
	if (element.isContentEditable) return new ContentEditableSource(element);
	return null;
}
