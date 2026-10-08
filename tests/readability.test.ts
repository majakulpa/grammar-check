import { describe, expect, it } from 'vitest';
import { countWords, enrichReadability, splitSuggestions } from '../src/content/readability';
import type { Issue } from '../src/shared/protocol';

const longSentence =
	'The quarterly report covers the three regions we opened last year, and it also ' +
	'sets out the hiring plan that the board approved in March after a long debate.';

function readabilityIssue(text: string): Issue {
	return {
		start: 0,
		end: text.length,
		kind: 'Readability',
		kindLabel: 'Readability',
		message: `This sentence is ${countWords(text)} words long.`,
		suggestions: [],
		original: text,
	};
}

describe('countWords', () => {
	it('counts words, not tokens', () => {
		expect(countWords("It isn't a well-known fact, is it?")).toBe(7);
	});
});

describe('splitSuggestions', () => {
	it('splits at a joining "and" and capitalises the new sentence', () => {
		const [first] = splitSuggestions(longSentence);
		expect(first?.text).toContain('last year. It also sets out');
	});

	it('keeps the connector when the second half needs it to read naturally', () => {
		const [first] = splitSuggestions(
			'We shipped the first version in April, but the migration took another two months to finish.',
		);
		expect(first?.text).toBe(
			'We shipped the first version in April. But the migration took another two months to finish.',
		);
	});

	it('labels where the cut lands rather than dumping the whole sentence', () => {
		const [first] = splitSuggestions(longSentence);
		expect(first?.label).toMatch(/^Split after “…/);
		expect(first?.label!.length).toBeLessThan(40);
	});

	it('refuses splits that would leave a stub', () => {
		expect(splitSuggestions('It rained, and we left.')).toEqual([]);
	});

	it('leaves subordinate clauses alone, since cutting them strands a fragment', () => {
		expect(
			splitSuggestions(
				'We delayed the launch until the autumn, which gave the team the time it needed to finish.',
			),
		).toEqual([]);
	});

	it('prefers the seam nearest the middle, for two balanced halves', () => {
		const sentence =
			'The team shipped it, and we reviewed the numbers together last week, ' +
			'and everyone agreed that the result was good enough.';
		const [first] = splitSuggestions(sentence);
		expect(first?.text).toContain('together last week. Everyone agreed');
	});
});

describe('enrichReadability', () => {
	it('replaces the bare complaint with a target and real options', () => {
		const enriched = enrichReadability(readabilityIssue(longSentence));
		expect(enriched.message).toMatch(/^29 words — aim for under 25\./);
		expect(enriched.suggestions.length).toBeGreaterThan(0);
	});

	it('still gives advice when there is no clean seam', () => {
		const issue = readabilityIssue(
			'The committee reviewed every single one of the many detailed proposals submitted ' +
				'during the unusually long consultation period that ended last month.',
		);
		const enriched = enrichReadability(issue);
		expect(enriched.suggestions).toEqual([]);
		expect(enriched.message).toContain('aim for under 25');
	});

	it('leaves other kinds of issue untouched', () => {
		const spelling: Issue = { ...readabilityIssue('teh'), kind: 'Spelling' };
		expect(enrichReadability(spelling)).toBe(spelling);
	});
});
