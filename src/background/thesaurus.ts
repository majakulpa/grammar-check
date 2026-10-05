/**
 * Datamuse: free, keyless, 100k requests/day. `rel_syn` gives true synonyms and
 * is often thin for less common words, so fall back to `ml` ("means like"),
 * which is fuzzier but rarely empty.
 */
const ENDPOINT = 'https://api.datamuse.com/words';
const MAX_RESULTS = 10;

/** Survives for the browser session only; synonyms are not worth persisting. */
const cache = new Map<string, string[]>();

interface DatamuseWord {
	word: string;
	score?: number;
}

async function query(params: Record<string, string>): Promise<string[]> {
	const url = new URL(ENDPOINT);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
	url.searchParams.set('max', String(MAX_RESULTS));

	const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
	if (!response.ok) throw new Error(`Datamuse responded ${response.status}`);

	const words = (await response.json()) as DatamuseWord[];
	return words.map((w) => w.word);
}

export async function synonyms(word: string): Promise<string[]> {
	const key = word.toLowerCase();
	const cached = cache.get(key);
	if (cached) return cached;

	let results = await query({ rel_syn: key });
	if (results.length < 3) {
		const alternatives = await query({ ml: key });
		results = [...new Set([...results, ...alternatives])].slice(0, MAX_RESULTS);
	}

	// Datamuse happily returns the word itself and multi-word phrases.
	results = results.filter((w) => w.toLowerCase() !== key && !w.includes(' '));

	cache.set(key, results);
	return results;
}
