import type { Issue } from '../../shared/protocol';

/**
 * Underline colour by lint kind. Three buckets, not twenty-one: a wall of
 * colours teaches the reader nothing.
 */
export type Severity = 'error' | 'style' | 'repetition';

const ERROR_KINDS = new Set([
	'Spelling',
	'Typo',
	'Grammar',
	'Agreement',
	'Capitalization',
	'Punctuation',
	'BoundaryError',
	'Malapropism',
	'Eggcorn',
]);

export function severityOf(issue: Issue): Severity {
	if (issue.kind === 'Repetition') return 'repetition';
	return ERROR_KINDS.has(issue.kind) ? 'error' : 'style';
}

export const SEVERITY_COLORS: Record<Severity, string> = {
	error: '#e5484d',
	style: '#f5a524',
	repetition: '#8e4ec6',
};

/**
 * `::highlight()` only accepts a short list of properties — colour, background,
 * text-decoration, text-shadow — which is exactly enough for a squiggle.
 *
 * Injected into the page's own document because highlight pseudo-elements are
 * resolved against the originating tree, not a shadow root.
 */
export function injectHighlightStyles(): void {
	const id = 'grammar-check-highlight-styles';
	if (document.getElementById(id)) return;

	const rules = (Object.entries(SEVERITY_COLORS) as [Severity, string][])
		.map(
			([severity, color]) => `
::highlight(grammar-check-${severity}) {
	text-decoration: underline wavy ${color};
	text-decoration-skip-ink: none;
	text-underline-offset: 0.18em;
}`,
		)
		.join('\n');

	const style = document.createElement('style');
	style.id = id;
	style.textContent = rules;
	// `documentElement` rather than `head`: some pages replace `head` wholesale.
	document.documentElement.appendChild(style);
}
