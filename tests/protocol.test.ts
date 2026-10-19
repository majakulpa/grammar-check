import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { DEFAULT_SETTINGS, editFor, send, type Issue, type Suggestion } from '../src/shared/protocol';

const issue = (text: string, start: number, end: number): Issue => ({
	start,
	end,
	kind: 'Grammar',
	kindLabel: 'Grammar',
	message: 'test',
	suggestions: [],
	original: text.slice(start, end),
});

/** Applies the edit the way the source adapters do, so the test checks the result. */
function apply(text: string, target: Issue, suggestion: Suggestion): string {
	const edit = editFor(target, suggestion);
	return text.slice(0, edit.start) + edit.text + text.slice(edit.end);
}

describe('editFor', () => {
	const text = 'I has a cat.';
	const target = issue(text, 2, 5);

	it('swaps the problem text for a replacement', () => {
		expect(apply(text, target, { kind: 'replace', text: 'have' })).toBe('I have a cat.');
	});

	it('cuts the problem text out', () => {
		expect(apply(text, target, { kind: 'remove', text: '' })).toBe('I  a cat.');
	});

	it('adds after the problem text without disturbing it', () => {
		expect(apply(text, target, { kind: 'insertAfter', text: 'n’t' })).toBe('I hasn’t a cat.');
	});

	it('collapses an insert to a zero-width edit at the end of the span', () => {
		const edit = editFor(target, { kind: 'insertAfter', text: 'x' });
		expect(edit.start).toBe(edit.end);
		expect(edit.end).toBe(target.end);
	});

	it('handles a span at the very start and the very end', () => {
		expect(apply(text, issue(text, 0, 1), { kind: 'replace', text: 'You' })).toBe(
			'You has a cat.',
		);
		expect(apply(text, issue(text, 11, 12), { kind: 'remove', text: '' })).toBe('I has a cat');
	});
});

describe('DEFAULT_SETTINGS', () => {
	it('starts switched on, with nothing opted into', () => {
		expect(DEFAULT_SETTINGS.enabled).toBe(true);
		expect(DEFAULT_SETTINGS.disabledHosts).toEqual([]);
		expect(DEFAULT_SETTINGS.dictionary).toEqual([]);
		expect(DEFAULT_SETTINGS.rules).toEqual({});
	});

	it('ships no API key, so the AI features stay hidden until asked for', () => {
		expect(DEFAULT_SETTINGS.anthropicApiKey).toBeUndefined();
	});
});

describe('send', () => {
	it('passes the request straight to the background and returns its reply', async () => {
		const sendMessage = vi.fn().mockResolvedValue({ type: 'lint', issues: [] });
		vi.stubGlobal('chrome', { runtime: { sendMessage } });

		await expect(send({ type: 'lint', text: 'hello' })).resolves.toEqual({
			type: 'lint',
			issues: [],
		});
		expect(sendMessage).toHaveBeenCalledWith({ type: 'lint', text: 'hello' });

		vi.unstubAllGlobals();
	});
});
