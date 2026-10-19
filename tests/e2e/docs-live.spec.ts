import { chromium, expect, test } from './fixtures';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The only test that can tell you whether Google Docs support actually works.
 *
 * Everything in `docs.spec.ts` runs against a fake built from our own reading
 * of Google's undocumented hook. If that reading is wrong, the fake is wrong in
 * exactly the same way and those tests pass anyway. This one uses the real
 * thing, so it is the only check on the assumption underneath all of it.
 *
 * It cannot run in CI — it needs a Google account — so it is opt-in:
 *
 *   npm run docs:login          # once: sign in, in a profile kept for this
 *   GRAMMAR_CHECK_DOC_URL=<url> npm run test:docs-live
 *
 * Use a scratch document. The test types into it.
 */
const DOC_URL = process.env.GRAMMAR_CHECK_DOC_URL;
const PROFILE = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../.google-profile',
);

test.describe('Google Docs, for real', () => {
	test.skip(!DOC_URL, 'Set GRAMMAR_CHECK_DOC_URL to a scratch document to run this.');
	// Signing in, loading Docs and waiting for it to settle is slow.
	test.setTimeout(180_000);

	test('Docs still hands us its text', async () => {
		const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
		const browser = await chromium.launchPersistentContext(PROFILE, {
			channel: 'chromium',
			headless: false,
			args: [
				`--disable-extensions-except=${root}/dist`,
				`--load-extension=${root}/dist`,
			],
		});

		try {
			const page = await browser.newPage();
			await page.goto(DOC_URL!, { waitUntil: 'domcontentloaded', timeout: 120_000 });

			await expect(page.locator('.kix-appview-editor')).toBeVisible({ timeout: 60_000 });

			// The claim has to have landed before Docs booted.
			const claimed = await page.evaluate(() => window._docs_annotate_canvas_by_ext);
			expect(claimed, 'the annotation hook was not claimed').toBeTruthy();

			// And Docs has to honour it. This is the assumption the fake cannot test.
			const text = await page.evaluate(async () => {
				const get = window._docs_annotate_getAnnotatedText;
				if (typeof get !== 'function') return null;
				const annotated = await get(window._docs_annotate_canvas_by_ext!);
				return annotated?.getText?.() ?? null;
			});

			expect(
				text,
				'Google no longer hands its text to extensions this way — Docs support is broken',
			).not.toBeNull();
			expect(typeof text).toBe('string');
		} finally {
			await browser.close();
		}
	});
});
