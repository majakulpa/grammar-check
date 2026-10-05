import type { Locator, Page } from '@playwright/test';

export interface UnderlineCounts {
	error: number;
	style: number;
	repetition: number;
	total: number;
}

/**
 * Counts underlines however they happen to be drawn.
 *
 * Which renderer runs depends on the browser's `createValueRange` support, and
 * a test that only looked at `CSS.highlights` would report zero — and quietly
 * pass — whenever the overlay fallback is the one doing the work.
 */
export async function underlines(page: Page): Promise<UnderlineCounts> {
	return page.evaluate(() => {
		const highlight = (name: string) => CSS.highlights.get(`grammar-check-${name}`)?.size ?? 0;
		const overlay = document.querySelector('[data-grammar-check-overlay]')?.children.length ?? 0;
		const counts = {
			error: highlight('error'),
			style: highlight('style'),
			repetition: highlight('repetition'),
		};
		return { ...counts, total: counts.error + counts.style + counts.repetition + overlay };
	});
}

/** The suggestion card's root, or an empty locator when it is not showing. */
export function card(page: Page): Locator {
	return page.locator('grammar-check-card .card');
}

/**
 * Put the caret at `offset` the way a user would, so the extension's own
 * `selectionchange` handling is what opens the card.
 */
export async function placeCaret(field: Locator, offset: number): Promise<void> {
	await field.evaluate((element, at) => {
		const input = element as HTMLInputElement | HTMLTextAreaElement;
		input.focus();
		input.setSelectionRange(at, at);
	}, offset);
}
