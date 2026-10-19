/*
 * The Docs hooks themselves are already declared globally by
 * `src/content/googleDocs/bridge.ts`; redeclaring them here would conflict.
 * This adds only what the fake page exposes for tests.
 */
interface Window {
	/** Test-only: the fake document's state, without going through the bridge. */
	__fakeDocs: {
		getText(): string;
		setText(next: string): void;
		charWidth: number;
		origin: { x: number; y: number };
	};
}
