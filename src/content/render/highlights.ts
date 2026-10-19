import type { Issue } from '../../shared/protocol';
import type { SourceElement } from '../source';
import { SEVERITY_COLORS, severityOf, type Severity } from './styles';

/**
 * `::highlight()` only accepts a short list of properties — colour, background,
 * text-decoration, text-shadow — which is exactly enough for a squiggle.
 *
 * Injected into the page's own document because highlight pseudo-elements are
 * resolved against the originating tree, not a shadow root.
 */
function injectHighlightStyles(): void {
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

const SEVERITIES: Severity[] = ['error', 'style', 'repetition'];
const registryName = (severity: Severity) => `grammar-check-${severity}`;

/**
 * Underlines drawn with the CSS Custom Highlight API.
 *
 * This is the good path. Ranges live in the browser's own layout, so they
 * scroll, wrap and reflow for free — none of the scroll/resize/mutation
 * position tracking an absolutely-positioned overlay needs.
 */
export class HighlightRenderer {
	/** Ranges this renderer contributed, so it can withdraw exactly those. */
	private owned = new Map<Severity, AbstractRange[]>();

	constructor() {
		injectHighlightStyles();
		for (const severity of SEVERITIES) {
			if (!CSS.highlights.has(registryName(severity))) {
				CSS.highlights.set(registryName(severity), new Highlight());
			}
		}
	}

	/** @returns `false` when the source could not produce ranges. */
	render(source: SourceElement, issues: Issue[]): boolean {
		this.clear();

		const next = new Map<Severity, AbstractRange[]>();
		for (const issue of issues) {
			const range = source.highlightRange(issue.start, issue.end);
			if (!range) return false;

			const severity = severityOf(issue);
			const list = next.get(severity) ?? [];
			list.push(range);
			next.set(severity, list);
		}

		for (const [severity, ranges] of next) {
			const highlight = CSS.highlights.get(registryName(severity));
			for (const range of ranges) highlight?.add(range as Range);
		}

		this.owned = next;
		return true;
	}

	clear(): void {
		for (const [severity, ranges] of this.owned) {
			const highlight = CSS.highlights.get(registryName(severity));
			for (const range of ranges) highlight?.delete(range as Range);
		}
		this.owned.clear();
	}
}
