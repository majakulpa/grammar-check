/**
 * Plain-text offsets to DOM positions and back.
 *
 * The linter works on a flat string; the browser works on a tree of text nodes.
 * Everything in this file is pure and covered by unit tests, because an
 * off-by-one here puts every underline in the wrong place.
 */

export interface DomPosition {
	node: Text;
	offset: number;
}

/** Text nodes of `root` in document order, skipping anything not rendered. */
export function textNodesOf(root: Node): Text[] {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			const parent = node.parentElement;
			if (!parent) return NodeFilter.FILTER_REJECT;
			// `display: none` text is in the DOM but not in what the user reads.
			if (!parent.isConnected || parent.closest('[hidden]')) return NodeFilter.FILTER_REJECT;
			return NodeFilter.FILTER_ACCEPT;
		},
	});

	const nodes: Text[] = [];
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		nodes.push(node as Text);
	}
	return nodes;
}

/**
 * The text a contenteditable holds, as the linter should see it.
 *
 * `innerText` would be closer to what is rendered, but its collapsing rules
 * make offsets impossible to map back. Concatenating text-node data keeps the
 * mapping exact; block boundaries are re-inserted as newlines so sentence
 * detection does not run two paragraphs together.
 */
export function flattenText(root: Node): string {
	const nodes = textNodesOf(root);
	let text = '';
	let previous: Text | undefined;

	for (const node of nodes) {
		if (previous && startsNewBlock(previous, node, root)) text += '\n';
		text += node.data;
		previous = node;
	}
	return text;
}

/**
 * The nearest ancestor that establishes a block box — the thing a line break
 * actually corresponds to. `display: contents` elements generate no box at all,
 * so they are transparent here.
 */
function blockAncestor(node: Node, root: Node): Element | null {
	let element = node.parentElement;
	while (element) {
		const display = window.getComputedStyle(element).display;
		if (display !== 'inline' && display !== 'contents') return element;
		if (element === root) return element;
		element = element.parentElement;
	}
	return null;
}

/**
 * Whether `node` is laid out in a different block from `previous`, and so reads
 * as a new line. Comparing parents directly is not enough: `a<b>x</b>c` has
 * three parents but is one line.
 */
function startsNewBlock(previous: Text, node: Text, root: Node): boolean {
	if (previous.parentElement === node.parentElement) return false;
	return blockAncestor(previous, root) !== blockAncestor(node, root);
}

/** Locate the text node and local offset holding plain-text `offset`. */
export function positionAt(root: Node, offset: number): DomPosition | null {
	const nodes = textNodesOf(root);
	let consumed = 0;
	let previous: Text | undefined;

	for (const node of nodes) {
		if (previous && startsNewBlock(previous, node, root)) consumed += 1;

		const length = node.data.length;
		// `<=` so an offset at the very end of a node resolves to that node
		// rather than failing at the end of the field.
		if (offset <= consumed + length) {
			return { node, offset: Math.max(0, offset - consumed) };
		}

		consumed += length;
		previous = node;
	}

	return previous ? { node: previous, offset: previous.data.length } : null;
}

/** The inverse of `positionAt`: a DOM position back to a plain-text offset. */
export function offsetOf(root: Node, node: Node, nodeOffset: number): number | null {
	const nodes = textNodesOf(root);
	let consumed = 0;
	let previous: Text | undefined;

	for (const current of nodes) {
		if (previous && startsNewBlock(previous, current, root)) consumed += 1;
		if (current === node) return consumed + nodeOffset;
		consumed += current.data.length;
		previous = current;
	}

	return null;
}

/** A DOM `Range` covering plain-text `[start, end)`, or `null` if unmappable. */
export function rangeFor(root: Node, start: number, end: number): Range | null {
	const from = positionAt(root, start);
	const to = positionAt(root, end);
	if (!from || !to) return null;

	const range = document.createRange();
	range.setStart(from.node, Math.min(from.offset, from.node.data.length));
	range.setEnd(to.node, Math.min(to.offset, to.node.data.length));
	return range;
}
