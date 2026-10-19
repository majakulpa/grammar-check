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

/**
 * Underline colours. These are graphics, so WCAG asks for 3:1 against what is
 * behind them — and what is behind them is somebody else's page, which we do
 * not control. These clear 3:1 on both white and a near-black page, which is as
 * far as the guarantee can go.
 *
 * Colour is never the only cue: the card names the kind in words.
 */
export const SEVERITY_COLORS: Record<Severity, string> = {
	error: '#e5484d',
	style: '#b06c00',
	repetition: '#8e4ec6',
};

/**
 * Label colours, which are text and so need 4.5:1 — a bar the underline
 * colours do not meet on a light background. Kept per theme for that reason.
 */
export const SEVERITY_TEXT_COLORS: Record<'light' | 'dark', Record<Severity, string>> = {
	light: { error: '#ce4145', style: '#9d6a17', repetition: '#8e4ec6' },
	dark: { error: '#e7575b', style: '#f5a524', repetition: '#a571d1' },
};
