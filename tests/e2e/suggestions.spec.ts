import { demoUrl, expect, test } from './fixtures';
import { card, placeCaret, underlines } from './helpers';

/** Focus the demo's input and wait for its "speling" error to be underlined. */
async function readyInput(page: import('@playwright/test').Page) {
	const field = page.locator('input[type="text"]');
	await field.click();
	await expect.poll(async () => (await underlines(page)).error).toBeGreaterThan(0);

	// Land mid-word so the caret is unambiguously inside the issue's span.
	await placeCaret(field, (await field.inputValue()).indexOf('speling') + 3);
	return field;
}

/** Puts the caret inside the second "important", which is flagged as repetition. */
async function caretOnSecondImportant(editable: import('@playwright/test').Locator) {
	await editable.evaluate((element) => {
		const node = [...element.querySelectorAll('p')][0]!.firstChild as Text;
		const at = node.data.indexOf('important', node.data.indexOf('important') + 1) + 3;
		const range = document.createRange();
		range.setStart(node, at);
		range.collapse(true);
		const selection = window.getSelection()!;
		selection.removeAllRanges();
		selection.addRange(range);
	});
}

test.describe('the suggestion card', () => {
	test('opens when the caret lands on an issue', async ({ page }) => {
		await page.goto(demoUrl);
		await readyInput(page);

		await expect(card(page)).toBeVisible();
		await expect(card(page)).toContainText(/spell/i);
	});

	test('applying a suggestion rewrites the field', async ({ page }) => {
		await page.goto(demoUrl);
		const field = await readyInput(page);

		await expect(card(page)).toBeVisible();
		await page.locator('grammar-check-card button.primary').first().click();

		await expect.poll(() => field.inputValue()).toContain('spelling');
		expect(await field.inputValue()).not.toContain('speling ');
	});

	test('an applied suggestion fires an input event the page can see', async ({ page }) => {
		await page.goto(demoUrl);
		const field = await readyInput(page);

		await field.evaluate((element) => {
			(window as unknown as { seen: number }).seen = 0;
			element.addEventListener('input', () => {
				(window as unknown as { seen: number }).seen++;
			});
		});

		await page.locator('grammar-check-card button.primary').first().click();
		// Without this, a framework-controlled input would revert the edit.
		await expect.poll(() => page.evaluate(() => (window as unknown as { seen: number }).seen))
			.toBeGreaterThan(0);
	});

	test('stays open while you reach for it', async ({ page }) => {
		await page.goto(demoUrl);
		await readyInput(page);
		await expect(card(page)).toBeVisible();

		// Pressing down on the card used to pull focus out of the field, which
		// moved the caret, which closed the card before the click landed.
		await card(page).hover();
		await page.mouse.down();
		await expect(card(page)).toBeVisible();

		await page.mouse.up();
		await expect(card(page)).toBeVisible();
	});

	test('stays open when reached for in a contenteditable', async ({ page }) => {
		await page.goto(demoUrl);

		const editable = page.locator('.editable').first();
		await editable.click();
		await expect.poll(async () => (await underlines(page)).repetition).toBeGreaterThan(0);

		await caretOnSecondImportant(editable);
		await expect(card(page)).toBeVisible();

		await card(page).hover();
		await page.mouse.down();
		await expect(card(page)).toBeVisible();
		await page.mouse.up();
		await expect(card(page)).toBeVisible();
	});

	test('hides on Escape', async ({ page }) => {
		await page.goto(demoUrl);
		await readyInput(page);

		await expect(card(page)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(card(page)).toBeHidden();
	});

	test('offers synonyms for a repeated word', async ({ page }) => {
		await page.goto(demoUrl);

		const editable = page.locator('.editable').first();
		await editable.click();
		await expect.poll(async () => (await underlines(page)).repetition).toBeGreaterThan(0);

		await caretOnSecondImportant(editable);

		await expect(card(page)).toContainText(/repeated word/i);
		await expect(card(page)).toContainText(/synonyms/i);
	});

	test('does not offer AI rewrites without an API key', async ({ page }) => {
		await page.goto(demoUrl);
		await readyInput(page);

		await expect(card(page)).toBeVisible();
		await expect(card(page)).not.toContainText(/rewrite/i);
	});
});
