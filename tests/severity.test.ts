import { describe, expect, it } from 'vitest';
import { severityOf } from '../src/content/render/styles';
import type { Issue } from '../src/shared/protocol';

const of = (kind: string): Issue => ({
	start: 0,
	end: 1,
	kind,
	kindLabel: kind,
	message: '',
	suggestions: [],
	original: 'x',
});

describe('severityOf', () => {
	it.each(['Spelling', 'Typo', 'Grammar', 'Agreement', 'Capitalization', 'Punctuation'])(
		'treats %s as an outright error',
		(kind) => {
			expect(severityOf(of(kind))).toBe('error');
		},
	);

	it.each(['Readability', 'Redundancy', 'Style', 'WordChoice', 'Enhancement'])(
		'treats %s as a matter of style',
		(kind) => {
			expect(severityOf(of(kind))).toBe('style');
		},
	);

	it('gives repetition its own colour, since the fix is a synonym', () => {
		expect(severityOf(of('Repetition'))).toBe('repetition');
	});

	it('errs towards style for a kind Harper adds later', () => {
		// A new rule should read as advice, not as a mistake we are sure about.
		expect(severityOf(of('SomethingHarperAddedLater'))).toBe('style');
	});
});
