// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { flattenText, offsetOf, positionAt, rangeFor } from '../src/content/source/offsets';

function host(html: string): HTMLElement {
	const element = document.createElement('div');
	element.innerHTML = html;
	document.body.appendChild(element);
	return element;
}

describe('flattenText', () => {
	it('concatenates inline text without inserting separators', () => {
		expect(flattenText(host('Hello <b>brave</b> world'))).toBe('Hello brave world');
	});

	it('separates block elements with a newline', () => {
		expect(flattenText(host('<p>One</p><p>Two</p>'))).toBe('One\nTwo');
	});
});

describe('positionAt / offsetOf round-trip', () => {
	it('maps an offset inside the second text node', () => {
		const root = host('Hello <b>brave</b> world');
		const position = positionAt(root, 8);

		expect(position?.node.data).toBe('brave');
		expect(position?.offset).toBe(2);
		expect(offsetOf(root, position!.node, position!.offset)).toBe(8);
	});

	it('accounts for the newline between blocks', () => {
		const root = host('<p>One</p><p>Two</p>');
		// "One\nTwo" — offset 4 is the 'T'.
		const position = positionAt(root, 4);

		expect(position?.node.data).toBe('Two');
		expect(position?.offset).toBe(0);
	});

	it('resolves an offset at the very end of the text', () => {
		const root = host('<p>One</p><p>Two</p>');
		const position = positionAt(root, 7);

		expect(position?.node.data).toBe('Two');
		expect(position?.offset).toBe(3);
	});
});

describe('rangeFor', () => {
	it('selects exactly the requested span', () => {
		const root = host('The quick brown fox');
		expect(rangeFor(root, 4, 9)?.toString()).toBe('quick');
	});

	it('spans across element boundaries', () => {
		const root = host('Hello <b>brave</b> world');
		expect(rangeFor(root, 3, 11)?.toString()).toBe('lo brave');
	});
});
