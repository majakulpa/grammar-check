/**
 * Runs in the page's own world before Google Docs boots.
 *
 * Docs renders text to a canvas, so there is nothing in the DOM to read. It
 * does, however, check this flag very early and — when it finds an extension ID
 * there — exposes `_docs_annotate_getAnnotatedText`, which hands back the
 * document's text, selection and caret geometry. That hook is the only reason
 * any of this is possible; it is undocumented, so it can disappear.
 *
 * The ID is a literal because the page's world has no `chrome` API to ask. It
 * is pinned by the `key` in the manifest.
 */
declare global {
	interface Window {
		_docs_annotate_canvas_by_ext?: string;
	}
}

try {
	window._docs_annotate_canvas_by_ext = 'gihlmnljmjmaonjdlcmnfpjphchekpgm';
} catch {
	// Docs will simply stay a canvas we cannot read.
}

export {};
