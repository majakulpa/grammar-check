import { expect, optionsUrl, test } from './fixtures';

test.describe('the options page', () => {
	test('lists Harper’s checks and filters them', async ({ page, extensionId }) => {
		await page.goto(optionsUrl(extensionId));

		const rules = page.locator('#rules .rule');
		await expect.poll(() => rules.count(), { timeout: 30_000 }).toBeGreaterThan(20);

		const all = await rules.count();
		await page.locator('#rule-search').fill('spell');

		await expect.poll(() => rules.count()).toBeLessThan(all);
		await expect.poll(() => rules.count()).toBeGreaterThan(0);
	});

	test('turning a check off is persisted immediately', async ({ page, extensionId }) => {
		await page.goto(optionsUrl(extensionId));

		const firstRule = page.locator('#rules .rule').first();
		await expect(firstRule).toBeVisible({ timeout: 30_000 });

		const name = (await firstRule.locator('strong').textContent())!.replace(/\s/g, '');
		await firstRule.locator('input[type="checkbox"]').uncheck();

		await expect
			.poll(() =>
				page.evaluate(async () => {
					const stored = await chrome.storage.local.get('settings');
					return (stored.settings as { rules?: Record<string, boolean> })?.rules ?? {};
				}),
			)
			.toHaveProperty(name, false);
	});

	test('saves the dialect and personal dictionary', async ({ page, extensionId }) => {
		await page.goto(optionsUrl(extensionId));
		// The form is populated asynchronously; editing before that is the bug
		// this page used to have, not something to race here.
		await expect(page.locator('body[data-ready]')).toBeAttached();

		await page.locator('#dialect').selectOption('British');
		await page.locator('#dictionary').fill('majakulpa\nwidgetise');
		await page.locator('#save').click();

		await expect(page.locator('#status')).toHaveText('Saved.');

		const settings = await page.evaluate(async () => {
			const stored = await chrome.storage.local.get('settings');
			return stored.settings as { dialect: string; dictionary: string[]; anthropicApiKey?: string };
		});
		expect(settings.dialect).toBe('British');
		expect(settings.dictionary).toEqual(['majakulpa', 'widgetise']);
		// An empty key field must not leave a value that reads as "configured".
		expect(settings.anthropicApiKey).toBeUndefined();
	});
});
