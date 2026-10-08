/**
 * The content script and the Docs bridge live in different JavaScript worlds
 * and can only reach each other through DOM events, so this is their shared
 * vocabulary. It is deliberately separate from `shared/protocol.ts`: that one
 * crosses a process boundary, this one crosses a world boundary inside one page.
 */
export const BRIDGE_READY = 'grammar-check:gdocs-ready';
export const BRIDGE_CHANGED = 'grammar-check:gdocs-changed';
export const BRIDGE_REQUEST = 'grammar-check:gdocs-request';
export const BRIDGE_RESPONSE = 'grammar-check:gdocs-response';

/** What the content script can ask for, before an id is attached. */
export type BridgeCall =
	| { type: 'read' }
	| { type: 'rects'; start: number; end: number }
	| { type: 'caret' }
	| { type: 'replace'; start: number; end: number; text: string; expected: string };

export type BridgeRequest = BridgeCall & { id: number };

export interface BridgeState {
	text: string;
	selectionStart: number;
	selectionEnd: number;
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type BridgeResponse =
	| { id: number; ok: true; state: BridgeState }
	| { id: number; ok: true; rects: Rect[] }
	| { id: number; ok: true; done: boolean }
	| { id: number; ok: false; error: string };
