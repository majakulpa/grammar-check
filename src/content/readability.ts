import type { Issue, Suggestion } from '../shared/protocol';

/**
 * Turns Harper's readability complaint into something you can act on.
 *
 * Harper reports the problem ("this sentence is 45 words long") and stops
 * there, which leaves the reader with nothing to do but dismiss it. A long
 * sentence almost always has a seam in it — a joined clause — so this finds
 * those seams and offers the split as a real edit.
 */

/** Above this, a sentence is hard to follow in one pass. */
const TARGET_WORDS = 25;

/**
 * Connectors that can be cut cleanly.
 *
 * Each one must leave two sentences that both stand on their own, which rules
 * out most subordinators: splitting at "which" or "while" strands a fragment.
 * `keep` is the word the second sentence starts with, if any.
 */
const SEAMS: { pattern: RegExp; keep?: string }[] = [
	{ pattern: /;\s+/g },
	{ pattern: /,\s+and\s+/g },
	{ pattern: /,\s+but\s+/g, keep: 'But' },
	{ pattern: /,\s+so\s+/g, keep: 'So' },
	{ pattern: /,\s+yet\s+/g, keep: 'Yet' },
	{ pattern: /,\s+however,\s+/g, keep: 'However,' },
	{ pattern: /,\s+then\s+/g, keep: 'Then' },
];

export function countWords(text: string): number {
	return (text.match(/\b[\p{L}\p{N}][\p{L}\p{N}'’-]*\b/gu) ?? []).length;
}

function capitalise(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

interface Seam {
	/** Offset within the sentence where the connector starts. */
	start: number;
	end: number;
	keep?: string;
}

function findSeams(sentence: string): Seam[] {
	const seams: Seam[] = [];

	for (const { pattern, keep } of SEAMS) {
		pattern.lastIndex = 0;
		for (const match of sentence.matchAll(pattern)) {
			seams.push({ start: match.index, end: match.index + match[0].length, keep });
		}
	}

	return seams.sort((a, b) => a.start - b.start);
}

/** The text that results from splitting `sentence` at `seam`. */
function splitAt(sentence: string, seam: Seam): string | null {
	const before = sentence.slice(0, seam.start).trimEnd();
	const after = sentence.slice(seam.end).trimStart();
	if (!before || !after) return null;

	// Both halves have to be substantial, or the split just makes a stub.
	if (countWords(before) < 4 || countWords(after) < 4) return null;

	const second = seam.keep ? `${seam.keep} ${after}` : capitalise(after);
	return `${before}. ${second}`;
}

/** A short label naming where the cut lands, so the button is readable. */
function describe(sentence: string, seam: Seam): string {
	const before = sentence.slice(0, seam.start).trimEnd();
	const lastWords = before.split(/\s+/).slice(-3).join(' ');
	return `Split after “…${lastWords}”`;
}

/**
 * Suggestions for a readability issue: split the sentence at each clean seam,
 * best (most even) first.
 */
export function splitSuggestions(sentence: string): Suggestion[] {
	const middle = sentence.length / 2;

	return findSeams(sentence)
		.map((seam) => ({ seam, text: splitAt(sentence, seam) }))
		.filter((candidate): candidate is { seam: Seam; text: string } => candidate.text !== null)
		// A cut near the middle leaves two balanced sentences; one near an edge
		// just lops off a clause.
		.sort((a, b) => Math.abs(a.seam.start - middle) - Math.abs(b.seam.start - middle))
		.slice(0, 2)
		.map(({ seam, text }) => ({
			kind: 'replace' as const,
			text,
			label: describe(sentence, seam),
		}));
}

/**
 * Rewrites a bare readability complaint into a target plus real options.
 *
 * Returns the issue unchanged when it is not a readability one, or when the
 * sentence has no seam worth cutting — in that case the message at least says
 * what to aim for.
 */
export function enrichReadability(issue: Issue): Issue {
	if (issue.kind !== 'Readability' || issue.suggestions.length > 0) return issue;

	const words = countWords(issue.original);
	if (words === 0) return issue;

	const suggestions = splitSuggestions(issue.original);
	const advice = suggestions.length
		? 'You can split it here, or rewrite it.'
		: 'Try splitting it into two, or cutting the detail you can do without.';

	return {
		...issue,
		message: `${words} words — aim for under ${TARGET_WORDS}. ${advice}`,
		suggestions,
	};
}
