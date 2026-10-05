import { demoUrl, expect, test } from './fixtures';
import { underlines } from './helpers';

test.describe('underlining', () => {
	test('underlines errors in a textarea', async ({ page }) => {
		await page.goto(demoUrl);
		await page.locator('textarea').click();

		await expect.poll(async () => (await underlines(page)).error).toBeGreaterThan(0);
	});

	test('underlines errors in a contenteditable', async ({ page }) => {
		await page.goto(demoUrl);
		await page.locator('.editable').first().click();

		await expect.poll(async () => (await underlines(page)).error).toBeGreaterThan(0);
	});

	test('flags an overused word as repetition', async ({ page }) => {
		await page.goto(demoUrl);
		// The first editable repeats "important" four times.
		await page.locator('.editable').first().click();

		await expect.poll(async () => (await underlines(page)).repetition).toBeGreaterThan(0);
	});

	test('leaves password and email fields alone', async ({ page }) => {
		await page.goto(demoUrl);

		await page.locator('input[type="password"]').click();
		await page.waitForTimeout(1500);
		expect((await underlines(page)).total).toBe(0);

		await page.locator('input[type="email"]').click();
		await page.waitForTimeout(1500);
		expect((await underlines(page)).total).toBe(0);
	});

	test('clears underlines when the text is fixed', async ({ page }) => {
		const field = page.locator('input[type="text"]');

		await page.goto(demoUrl);
		await field.click();
		await expect.poll(async () => (await underlines(page)).error).toBeGreaterThan(0);

		await field.fill('This sentence has no spelling mistakes in it at all.');
		await expect.poll(async () => (await underlines(page)).total).toBe(0);
	});
});
