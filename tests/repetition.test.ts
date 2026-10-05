import { describe, expect, it } from 'vitest';
import { findRepetitions, stem } from '../src/content/repetition';

describe('stem', () => {
	it('folds common inflections together', () => {
		expect(stem('processes')).toBe('process');
		expect(stem('processing')).toBe('process');
		expect(stem('reviewed')).toBe('review');
	});

	it('leaves short words alone so "uses" does not become "u"', () => {
		expect(stem('uses')).toBe('uses');
	});
});

describe('findRepetitions', () => {
	it('flags every occurrence after the first', () => {
		const text =
			'The report is important because it covers important findings about important customers.';
		const issues = findRepetitions(text);

		expect(issues).toHaveLength(2);
		expect(issues.every((issue) => issue.original === 'important')).toBe(true);
		expect(text.slice(issues[0]!.start, issues[0]!.end)).toBe('important');
	});

	it('ignores words used only twice', () => {
		expect(findRepetitions('An important point and another important point.')).toEqual([]);
	});

	it('ignores stopwords however often they appear', () => {
		expect(findRepetitions('That thing and that thing and that thing again.')).toEqual([]);
	});

	it('ignores capitalised words, which are usually names', () => {
		const text = 'I met Jordan today. Jordan was late. Jordan apologised for it.';
		expect(findRepetitions(text)).toEqual([]);
	});

	it('does not flag uses spread far apart', () => {
		const filler = 'x'.repeat(500);
		expect(findRepetitions(`budget ${filler} budget ${filler} budget`)).toEqual([]);
	});
});
