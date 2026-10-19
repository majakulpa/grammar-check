import { demoUrl, expect, optionsUrl, test } from './fixtures';
import { card, placeCaret, underlines } from './helpers';

/** What currently has focus, including inside the card's shadow root. */
async function focused(page: import('@playwright/test').Page): Promise<string> {
	return page.evaluate(() => {
		const active = document.activeElement;
		const inner = active?.shadowRoot?.activeElement ?? active;
		if (!inner) return 'none';
		const tag = inner.tagName.toLowerCase();
		return `${tag}:${inner.getAttribute('id') ?? inner.textContent?.trim().slice(0, 24) ?? ''}`;
	});
}

/** Open the demo's input and land the caret on its spelling mistake. */
async function cardOnSpelling(page: import('@playwright/test').Page) {
	const field = page.locator('input[type="text"]');
	await field.click();
	await expect.poll(async () => (await underlines(page)).error).toBeGreaterThan(0);
	await placeCaret(field, (await field.inputValue()).indexOf('speling') + 3);
	await expect(card(page)).toBeVisible();
	return field;
}

test.describe('using the card without a mouse', () => {
	test('Alt+Enter is the way in', async ({ page }) => {
		await page.goto(demoUrl);
		await cardOnSpelling(page);

		// Focus must not be taken on its own: an issue can appear mid-word.
		expect(await focused(page)).toContain('input:');

		await page.keyboard.press('Alt+Enter');
		expect(await focused(page)).toContain('button:');
	});

	test('arrow keys walk the actions and wrap round', async ({ page }) => {
		await page.goto(demoUrl);
		await cardOnSpelling(page);
		await page.keyboard.press('Alt+Enter');

		const first = await focused(page);
		await page.keyboard.press('ArrowDown');
		const second = await focused(page);
		expect(second).not.toBe(first);

		await page.keyboard.press('ArrowUp');
		expect(await focused(page)).toBe(first);

		await page.keyboard.press('End');
		const last = await focused(page);
		await page.keyboard.press('ArrowDown');
		expect(await focused(page)).not.toBe(last);
	});

	test('Enter applies the focused suggestion', async ({ page }) => {
		await page.goto(demoUrl);
		const field = await cardOnSpelling(page);

		await page.keyboard.press('Alt+Enter');
		await page.keyboard.press('Enter');

		await expect.poll(() => field.inputValue()).toContain('spelling');
	});

	test('Escape closes the card and hands focus back to the text', async ({ page }) => {
		await page.goto(demoUrl);
		await cardOnSpelling(page);

		await page.keyboard.press('Alt+Enter');
		expect(await focused(page)).toContain('button:');

		await page.keyboard.press('Escape');
		await expect(card(page)).toBeHidden();
		expect(await focused(page)).toContain('input:');
	});

	test('the card announces itself without stealing the caret', async ({ page }) => {
		await page.goto(demoUrl);
		await cardOnSpelling(page);

		const announcement = await page.evaluate(() => {
			const host = document.querySelector('grammar-check-card');
			return host?.shadowRoot?.querySelector('[role="status"]')?.textContent ?? '';
		});

		expect(announcement).toMatch(/spelling/i);
		expect(announcement).toMatch(/alt plus enter/i);
	});

	test('the card names itself as a dialog', async ({ page }) => {
		await page.goto(demoUrl);
		await cardOnSpelling(page);

		const label = await card(page).getAttribute('aria-label');
		expect(label).toMatch(/spelling/i);
	});
});

test.describe('using the settings without a mouse', () => {
	test('every control is reachable by tabbing', async ({ page, extensionId }) => {
		await page.goto(optionsUrl(extensionId));
		await expect(page.locator('body[data-ready]')).toBeAttached();

		const wanted = ['dialect', 'api-key', 'model', 'rule-search', 'dictionary', 'disabled-hosts'];
		const seen = new Set<string>();

		// The whole checks list is one stop, so everything is within easy reach.
		for (let i = 0; i < 25 && seen.size < wanted.length; i++) {
			await page.keyboard.press('Tab');
			const id = await page.evaluate(() => document.activeElement?.id ?? '');
			if (wanted.includes(id)) seen.add(id);
		}

		expect([...seen].sort()).toEqual([...wanted].sort());
	});

	test('the checks list is one tab stop, navigated with the arrows', async ({
		page,
		extensionId,
	}) => {
		await page.goto(optionsUrl(extensionId));
		await expect.poll(() => page.locator('#rules .rule').count()).toBeGreaterThan(20);

		await page.locator('#rules').focus();
		await page.keyboard.press('ArrowDown');

		const first = await page.evaluate(() => {
			const active = document.activeElement as HTMLInputElement | null;
			return { type: active?.type, index: [...document.querySelectorAll('#rules input')].indexOf(active!) };
		});
		expect(first.type).toBe('checkbox');
		expect(first.index).toBe(0);

		await page.keyboard.press('ArrowDown');
		await expect
			.poll(() =>
				page.evaluate(() =>
					[...document.querySelectorAll('#rules input')].indexOf(document.activeElement!),
				),
			)
			.toBe(1);

		// Space must still do what Space does on a checkbox.
		const before = await page.evaluate(() => (document.activeElement as HTMLInputElement).checked);
		await page.keyboard.press('Space');
		await expect
			.poll(() => page.evaluate(() => (document.activeElement as HTMLInputElement).checked))
			.toBe(!before);
	});

	test('tabbing past the checks does not mean tabbing through them', async ({
		page,
		extensionId,
	}) => {
		await page.goto(optionsUrl(extensionId));
		await expect.poll(() => page.locator('#rules .rule').count()).toBeGreaterThan(20);

		await page.locator('#rule-search').focus();
		await page.keyboard.press('Tab');
		await expect(page.locator('#rules')).toBeFocused();

		await page.keyboard.press('Tab');
		await expect(page.locator('#dictionary')).toBeFocused();
	});

	test('filtering the checks is announced', async ({ page, extensionId }) => {
		await page.goto(optionsUrl(extensionId));
		await expect.poll(() => page.locator('#rules .rule').count()).toBeGreaterThan(20);

		await page.locator('#rule-search').fill('spell');

		const status = page.locator('#rules-count');
		await expect(status).toHaveAttribute('role', 'status');
		await expect(status).toContainText(/of \d+ checks shown/);
	});
});
