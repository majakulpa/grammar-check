import { describe, expect, it } from 'vitest';
import { matchCase } from '../src/content/textCase';

describe('matchCase', () => {
	it('leaves a lower-case word alone', () => {
		expect(matchCase('quick', 'swift')).toBe('swift');
	});

	it('follows a capitalised word, so a sentence start survives the swap', () => {
		expect(matchCase('Quick', 'swift')).toBe('Swift');
	});

	it('follows a word in capitals', () => {
		expect(matchCase('QUICK', 'swift')).toBe('SWIFT');
	});

	it('treats a single capital letter as a sentence start, not as shouting', () => {
		expect(matchCase('I', 'me')).toBe('Me');
	});

	it('copes with accented capitals', () => {
		expect(matchCase('Éclair', 'pastry')).toBe('Pastry');
	});
});
