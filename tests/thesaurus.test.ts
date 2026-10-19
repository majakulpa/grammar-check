import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Datamuse's shape: a ranked list of words. */
const reply = (...words: string[]) =>
	Promise.resolve({ ok: true, json: () => Promise.resolve(words.map((word) => ({ word }))) });

describe('synonyms', () => {
	let fetchMock: ReturnType<typeof vi.fn>;
	let synonyms: (word: string) => Promise<string[]>;

	beforeEach(async () => {
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		// Fresh module each time, because the client caches between calls.
		vi.resetModules();
		({ synonyms } = await import('../src/background/thesaurus'));
	});

	afterEach(() => vi.unstubAllGlobals());

	it('asks Datamuse for synonyms of the word', async () => {
		fetchMock.mockReturnValue(reply('swift', 'rapid', 'speedy'));

		expect(await synonyms('quick')).toEqual(['swift', 'rapid', 'speedy']);

		const url = new URL(fetchMock.mock.calls[0]![0]);
		expect(url.hostname).toBe('api.datamuse.com');
		expect(url.searchParams.get('rel_syn')).toBe('quick');
	});

	it('drops the word itself and multi-word phrases, which cannot be swapped in', async () => {
		fetchMock.mockReturnValue(reply('swift', 'Quick', 'very fast', 'rapid'));

		expect(await synonyms('quick')).toEqual(['swift', 'rapid']);
	});

	it('falls back to near-meanings when true synonyms are thin', async () => {
		fetchMock
			.mockReturnValueOnce(reply('sad'))
			.mockReturnValueOnce(reply('unhappy', 'miserable', 'gloomy'));

		expect(await synonyms('morose')).toContain('miserable');

		const second = new URL(fetchMock.mock.calls[1]![0]);
		expect(second.searchParams.get('ml')).toBe('morose');
	});

	it('does not ask twice for the same word', async () => {
		fetchMock.mockReturnValue(reply('swift', 'rapid', 'speedy'));

		await synonyms('quick');
		await synonyms('QUICK');

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('reports a failure rather than returning nothing silently', async () => {
		fetchMock.mockResolvedValue({ ok: false, status: 503 });

		await expect(synonyms('quick')).rejects.toThrow(/503/);
	});
});
