import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from './fixtures';
import { underlines } from './helpers';

const here = path.dirname(fileURLToPath(import.meta.url));
const FAKE_PAGE = readFileSync(path.join(here, 'pages/fake-google-docs.html'), 'utf8');

/**
 * A Google Docs URL, served from disk.
 *
 * Chrome decides which content scripts to inject from the URL, not from where
 * the bytes came from — so intercepting the request is what lets the real
 * bootstrap and bridge run against a page we control, with no Google account
 * involved.
 */
const DOC_URL = 'https://docs.google.com/document/d/grammar-check-test/edit';

async function openFakeDoc(page: import('@playwright/test').Page) {
	await page.route(DOC_URL, (route) =>
		route.fulfill({ status: 200, contentType: 'text/html', body: FAKE_PAGE }),
	);
	await page.goto(DOC_URL);
	await expect(page.locator('.kix-appview-editor')).toBeVisible();
}

/** The text as the extension's bridge sees it, which is the thing under test. */
async function bridgeSees(page: import('@playwright/test').Page): Promise<string> {
	return page.evaluate(async () => {
		const token = window._docs_annotate_canvas_by_ext;
		const annotated = await window._docs_annotate_getAnnotatedText?.(token!);
		return annotated?.getText() ?? '';
	});
}

test.describe('Google Docs', () => {
	test('claims the annotation hook before the page loads', async ({ page, extensionId }) => {
		await openFakeDoc(page);

		// Without this the document stays a canvas and nothing else can work.
		await expect
			.poll(() => page.evaluate(() => window._docs_annotate_canvas_by_ext))
			.toBe(extensionId);
	});

	test('reads the document text through the hook', async ({ page }) => {
		await openFakeDoc(page);

		await expect.poll(() => bridgeSees(page)).toContain('Their going to the conference');
	});

	test('underlines the mistakes it finds there', async ({ page }) => {
		await openFakeDoc(page);

		// Docs has no DOM ranges, so this has to come out as overlay boxes.
		await expect.poll(async () => (await underlines(page)).total, { timeout: 30_000 })
			.toBeGreaterThan(0);
	});

	test('puts the underlines over the words they belong to', async ({ page }) => {
		await openFakeDoc(page);
		await expect.poll(async () => (await underlines(page)).total, { timeout: 30_000 })
			.toBeGreaterThan(0);

		const { boxes, expected } = await page.evaluate(() => {
			const fake = window.__fakeDocs;
			const overlay = document.querySelector('[data-grammar-check-overlay]');
			const boxes = [...(overlay?.children ?? [])].map((child) => {
				const rect = child.getBoundingClientRect();
				return { left: Math.round(rect.left), width: Math.round(rect.width) };
			});

			// "Their" is the first word, so its box starts at the text origin.
			return { boxes, expected: Math.round(fake.origin.x) };
		});

		expect(boxes.length).toBeGreaterThan(0);
		// Within a character's width of where the word actually is.
		expect(Math.min(...boxes.map((b) => Math.abs(b.left - expected)))).toBeLessThan(12);
	});

	test('applies a correction through a paste, as Docs requires', async ({ page }) => {
		await openFakeDoc(page);
		await expect.poll(async () => (await underlines(page)).total, { timeout: 30_000 })
			.toBeGreaterThan(0);

		// Drive the bridge the way the card does when a suggestion is accepted.
		const applied = await page.evaluate(async () => {
			const text = window.__fakeDocs.getText();
			const start = text.indexOf('Their');

			document.dispatchEvent(
				new CustomEvent('grammar-check:gdocs-request', {
					detail: {
						id: 9001,
						type: 'replace',
						start,
						end: start + 'Their'.length,
						text: 'They are',
						expected: 'Their',
					},
				}),
			);

			await new Promise((resolve) => setTimeout(resolve, 500));
			return window.__fakeDocs.getText();
		});

		expect(applied).toContain('They are going to the conference');
	});

	test('refuses to edit text that changed since it was checked', async ({ page }) => {
		await openFakeDoc(page);
		await expect.poll(() => bridgeSees(page)).toContain('Their');

		const { error, text } = await page.evaluate(async () => {
			const before = window.__fakeDocs.getText();

			const answer = new Promise<{ ok: boolean; error?: string }>((resolve) => {
				document.addEventListener(
					'grammar-check:gdocs-response',
					(event) => resolve((event as CustomEvent).detail),
					{ once: true },
				);
			});

			document.dispatchEvent(
				new CustomEvent('grammar-check:gdocs-request', {
					detail: {
						id: 9002,
						type: 'replace',
						start: 0,
						end: 5,
						// Stale: the document does not say this any more.
						expected: 'Something else entirely',
						text: 'They are',
					},
				}),
			);

			const response = await answer;
			return { error: response.error ?? '', text: before === window.__fakeDocs.getText() };
		});

		expect(error).toMatch(/changed/i);
		expect(text).toBe(true);
	});
});
