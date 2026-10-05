import { describe, expect, it } from 'vitest';
import { sentenceAround } from '../src/content/sentences';

describe('sentenceAround', () => {
	const text = 'First one here. Second one follows! And a third?';

	it('finds the sentence containing the offset', () => {
		expect(sentenceAround(text, 20)?.text).toBe('Second one follows!');
	});

	it('returns offsets that slice back to the same text', () => {
		const sentence = sentenceAround(text, 20)!;
		expect(text.slice(sentence.start, sentence.end)).toBe(sentence.text);
	});

	it('handles the first and last sentences', () => {
		expect(sentenceAround(text, 0)?.text).toBe('First one here.');
		expect(sentenceAround(text, text.length - 1)?.text).toBe('And a third?');
	});

	it('returns null for text with nothing in it', () => {
		expect(sentenceAround('   ', 1)).toBeNull();
	});
});
