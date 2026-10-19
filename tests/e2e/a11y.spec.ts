import { demoUrl, expect, optionsUrl, test } from './fixtures';
import { expectNoViolations } from './a11y';
import { card, placeCaret, underlines } from './helpers';

const popupUrl = (id: string) => `chrome-extension://${id}/src/popup/index.html`;

test.describe('WCAG 2.2 AA', () => {
	test('the popup has no violations', async ({ page, extensionId }) => {
		await page.goto(popupUrl(extensionId));
		await expect(page.locator('#enabled')).toBeVisible();

		await expectNoViolations(page);
	});

	test('the options page has no violations', async ({ page, extensionId }) => {
		await page.goto(optionsUrl(extensionId));
		await expect(page.locator('body[data-ready]')).toBeAttached();
		// Wait for the rules list, so the scan covers it too.
		await expect.poll(() => page.locator('#rules .rule').count()).toBeGreaterThan(20);

		await expectNoViolations(page);
	});

	test('the options page is still clean in dark mode', async ({ page, extensionId }) => {
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.goto(optionsUrl(extensionId));
		await expect(page.locator('body[data-ready]')).toBeAttached();

		await expectNoViolations(page);
	});

	test('the suggestion card has no violations', async ({ page }) => {
		await page.goto(demoUrl);

		const field = page.locator('input[type="text"]');
		await field.click();
		await expect.poll(async () => (await underlines(page)).error).toBeGreaterThan(0);
		await placeCaret(field, (await field.inputValue()).indexOf('speling') + 3);
		await expect(card(page)).toBeVisible();

		// The card is the extension's own UI; the demo page around it is not.
		await expectNoViolations(page, { include: 'grammar-check-card' });
	});

	test('the card is still clean in dark mode', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.goto(demoUrl);

		const field = page.locator('input[type="text"]');
		await field.click();
		await expect.poll(async () => (await underlines(page)).error).toBeGreaterThan(0);
		await placeCaret(field, (await field.inputValue()).indexOf('speling') + 3);
		await expect(card(page)).toBeVisible();

		await expectNoViolations(page, { include: 'grammar-check-card' });
	});
});
