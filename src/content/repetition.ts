import type { Issue } from '../shared/protocol';

/**
 * Finds content words the writer has leaned on, so the card can offer
 * synonyms. Harper has its own `Repetition` rule for immediate duplicates
 * ("the the"); this is the different complaint of using "important" five
 * times in a paragraph.
 */

const MIN_LENGTH = 4;
const MIN_OCCURRENCES = 3;
/** Words this far apart are not felt as repetition. */
const WINDOW = 400;

const STOPWORDS = new Set([
	'about', 'after', 'again', 'also', 'because', 'been', 'before', 'being', 'both',
	'came', 'come', 'could', 'does', 'done', 'down', 'each', 'even', 'ever', 'every',
	'from', 'gets', 'goes', 'going', 'have', 'here', 'into', 'just', 'know', 'like',
	'made', 'make', 'many', 'more', 'most', 'much', 'must', 'need', 'only', 'other',
	'over', 'said', 'same', 'says', 'shall', 'should', 'since', 'some', 'started',
	'such', 'take', 'than', 'that', 'their', 'them', 'then', 'there', 'these',
	'they', 'thing', 'things', 'this', 'those', 'through', 'time', 'under', 'very',
	'want', 'well', 'were', 'what', 'when', 'where', 'which', 'while', 'will',
	'with', 'would', 'your',
]);

/**
 * Crude suffix stripping so "process", "processes" and "processing" count as
 * one word. A real lemmatiser would need a dictionary we do not want to ship
 * for this; over-merging here costs nothing worse than a suggestion the writer
 * ignores.
 */
export function stem(word: string): string {
	const lower = word.toLowerCase();
	for (const suffix of ['ingly', 'edly', 'ing', 'ies', 'ied', 'es', 'ed', 'ly', 's']) {
		if (lower.length - suffix.length >= MIN_LENGTH && lower.endsWith(suffix)) {
			return lower.slice(0, -suffix.length);
		}
	}
	return lower;
}

interface Occurrence {
	start: number;
	end: number;
	word: string;
}

export function findRepetitions(text: string): Issue[] {
	const groups = new Map<string, Occurrence[]>();

	for (const match of text.matchAll(/\b[\p{L}][\p{L}'’-]*\b/gu)) {
		const word = match[0];
		if (word.length < MIN_LENGTH) continue;
		if (STOPWORDS.has(word.toLowerCase())) continue;
		// A capitalised word mid-sentence is usually a name, not a word choice.
		if (match.index > 0 && /\p{Lu}/u.test(word[0] ?? '')) continue;

		const key = stem(word);
		const list = groups.get(key) ?? [];
		list.push({ start: match.index, end: match.index + word.length, word });
		groups.set(key, list);
	}

	const issues: Issue[] = [];
	for (const occurrences of groups.values()) {
		for (const cluster of clustersOf(occurrences)) {
			// Flag every occurrence after the first; the first use is not a repeat.
			for (const occurrence of cluster.slice(1)) {
				issues.push({
					start: occurrence.start,
					end: occurrence.end,
					kind: 'Repetition',
					kindLabel: 'Repeated word',
					message: `"${occurrence.word}" appears ${cluster.length} times nearby. Consider a synonym.`,
					suggestions: [],
					original: occurrence.word,
				});
			}
		}
	}

	return issues;
}

/** Split occurrences into runs where consecutive uses are within `WINDOW`. */
function clustersOf(occurrences: Occurrence[]): Occurrence[][] {
	const clusters: Occurrence[][] = [];
	let current: Occurrence[] = [];

	for (const occurrence of occurrences) {
		const previous = current[current.length - 1];
		if (previous && occurrence.start - previous.start > WINDOW) {
			if (current.length >= MIN_OCCURRENCES) clusters.push(current);
			current = [];
		}
		current.push(occurrence);
	}
	if (current.length >= MIN_OCCURRENCES) clusters.push(current);

	return clusters;
}
