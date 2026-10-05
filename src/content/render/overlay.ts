import type { Issue } from '../../shared/protocol';
import type { SourceElement } from '../source';
import { SEVERITY_COLORS, severityOf } from './styles';

/**
 * The fallback underline renderer, for `<textarea>`/`<input>` on Chromium
 * older than 152 (before `createValueRange`, highlights cannot reach inside a
 * form control's value).
 *
 * It is Grammarly's architecture, and worth stating why: underline nodes never
 * go *inside* the field. Wrapping user text in markup is what corrupted rich
 * editors and got Grammarly actively blocked by sites. Instead a single
 * absolutely-positioned container sits last in `document.body`, and we chase
 * the field's geometry from outside.
 */
export class OverlayRenderer {
	private container: HTMLDivElement;
	private source?: SourceElement;
	private issues: Issue[] = [];
	private frame = 0;

	private resizeObserver: ResizeObserver;
	private mutationObserver: MutationObserver;
	private readonly onViewportChange = () => this.scheduleReposition();

	constructor() {
		this.container = document.createElement('div');
		this.container.setAttribute('data-grammar-check-overlay', '');
		Object.assign(this.container.style, {
			position: 'absolute',
			top: '0',
			left: '0',
			pointerEvents: 'none',
			zIndex: '2147483646',
		} satisfies Partial<CSSStyleDeclaration>);

		this.resizeObserver = new ResizeObserver(this.onViewportChange);
		// Layout moves for reasons no event reports: a sibling expanding, a
		// sticky header appearing, a framework re-rendering the form.
		this.mutationObserver = new MutationObserver(this.onViewportChange);
	}

	render(source: SourceElement, issues: Issue[]): void {
		if (!this.container.isConnected) document.body.appendChild(this.container);

		if (this.source?.element !== source.element) {
			this.detachObservers();
			this.source = source;
			this.attachObservers(source.element);
		}

		this.issues = issues;
		this.paint();
	}

	clear(): void {
		this.issues = [];
		this.container.replaceChildren();
	}

	destroy(): void {
		this.detachObservers();
		this.container.remove();
	}

	private attachObservers(element: HTMLElement): void {
		// `capture` catches scrolling in any ancestor, not just the window.
		window.addEventListener('scroll', this.onViewportChange, { capture: true, passive: true });
		window.addEventListener('resize', this.onViewportChange, { passive: true });
		element.addEventListener('scroll', this.onViewportChange, { passive: true });

		this.resizeObserver.observe(element);
		this.mutationObserver.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['style', 'class'],
		});
	}

	private detachObservers(): void {
		window.removeEventListener('scroll', this.onViewportChange, { capture: true });
		window.removeEventListener('resize', this.onViewportChange);
		this.source?.element.removeEventListener('scroll', this.onViewportChange);
		this.resizeObserver.disconnect();
		this.mutationObserver.disconnect();
	}

	private scheduleReposition(): void {
		if (this.frame) return;
		this.frame = requestAnimationFrame(() => {
			this.frame = 0;
			this.paint();
		});
	}

	private paint(): void {
		const source = this.source;
		if (!source || !source.element.isConnected) {
			this.clear();
			return;
		}

		const underlines: HTMLElement[] = [];
		for (const issue of this.issues) {
			const color = SEVERITY_COLORS[severityOf(issue)];
			for (const rect of source.rectsForSpan(issue.start, issue.end)) {
				if (rect.width === 0) continue;
				underlines.push(this.underline(rect, color));
			}
		}
		this.container.replaceChildren(...underlines);
	}

	private underline(rect: DOMRect, color: string): HTMLElement {
		const element = document.createElement('div');
		Object.assign(element.style, {
			position: 'absolute',
			// `rectsForSpan` is viewport-relative; the container is page-relative.
			left: `${rect.left + window.scrollX}px`,
			top: `${rect.bottom + window.scrollY - 2}px`,
			width: `${rect.width}px`,
			height: '2px',
			// A repeating gradient is a cheap squiggle that costs no image load.
			backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 1px, transparent 1px 2px)`,
		} satisfies Partial<CSSStyleDeclaration>);
		return element;
	}
}
