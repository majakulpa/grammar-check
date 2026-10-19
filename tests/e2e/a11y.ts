import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect } from './fixtures';

/**
 * The rule sets that make up WCAG 2.2 AA in axe's vocabulary.
 *
 * `best-practice` is deliberately left out: those are axe's own advice rather
 * than the standard, and failing the build on them would mean failing it on
 * opinions.
 */
const AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export interface ScanOptions {
	/** Restrict the scan to one part of the page. */
	include?: string;
	/**
	 * Rules to skip, each with the reason. Only for things axe cannot judge
	 * from a static snapshot — never to make a real failure go away.
	 */
	allow?: Record<string, string>;
}

/** Readable one-liner per violation, so a failure says what to fix. */
function describe(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']): string {
	return violations
		.map(
			(violation) =>
				`\n  [${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help}\n` +
				violation.nodes
					.slice(0, 3)
					.map((node) => `      ${node.target.join(' ')}\n        ${node.failureSummary ?? ''}`)
					.join('\n'),
		)
		.join('\n');
}

/** Runs axe over the page and fails with the detail if anything is wrong. */
export async function expectNoViolations(page: Page, options: ScanOptions = {}): Promise<void> {
	let builder = new AxeBuilder({ page }).withTags(AA_TAGS);

	if (options.include) builder = builder.include(options.include);
	if (options.allow) builder = builder.disableRules(Object.keys(options.allow));

	const { violations, passes } = await builder.analyze();

	// A scan whose selector matched nothing reports no violations and looks
	// like a pass. Requiring some checks to have actually run is what stops a
	// mis-scoped scan from quietly asserting nothing.
	expect(passes.length, 'axe ran no checks — the scan matched nothing').toBeGreaterThan(0);

	expect(violations, `Accessibility violations:${describe(violations)}\n`).toEqual([]);
}
