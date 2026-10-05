import type { Issue } from '../../shared/protocol';
import type { SourceElement } from '../source';
import { injectHighlightStyles, severityOf, type Severity } from './styles';

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
