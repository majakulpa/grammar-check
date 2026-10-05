import { send, type Issue, type RewriteTone, type Suggestion } from '../shared/protocol';
import { SEVERITY_COLORS, severityOf } from './render/styles';

const TONES: { tone: RewriteTone; label: string }[] = [
	{ tone: 'clearer', label: 'Clearer' },
	{ tone: 'concise', label: 'Shorter' },
	{ tone: 'formal', label: 'More formal' },
	{ tone: 'casual', label: 'More casual' },
];

const STYLES = `
:host { all: initial; }
.card {
	position: fixed;
	z-index: 2147483647;
	width: 300px;
	max-width: calc(100vw - 16px);
	box-sizing: border-box;
	padding: 12px 14px;
	border-radius: 10px;
	border: 1px solid rgba(0, 0, 0, 0.1);
	background: #fff;
	color: #16181d;
	box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
	font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.kind { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
.message { margin: 6px 0 10px; color: #4a4f57; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; }
button {
	font: inherit;
	padding: 5px 10px;
	border-radius: 6px;
	border: 1px solid rgba(0, 0, 0, 0.12);
	background: #f6f7f9;
	color: inherit;
	cursor: pointer;
}
button:hover { background: #ebedf0; }
button.primary { background: #16181d; border-color: #16181d; color: #fff; }
button.primary:hover { background: #2c3038; }
.section { margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0, 0, 0, 0.08); }
.label { font-size: 11px; font-weight: 600; color: #6b7280; margin-bottom: 6px; }
.note { color: #6b7280; font-style: italic; }
.rewrite { margin-top: 8px; padding: 8px; border-radius: 6px; background: #f6f7f9; }
@media (prefers-color-scheme: dark) {
	.card { background: #1c1f24; color: #e8eaed; border-color: rgba(255, 255, 255, 0.12); }
	.message { color: #a8aeb8; }
	button { background: #2a2e35; border-color: rgba(255, 255, 255, 0.12); }
	button:hover { background: #343941; }
	button.primary { background: #e8eaed; border-color: #e8eaed; color: #16181d; }
	.rewrite { background: #2a2e35; }
	.section { border-top-color: rgba(255, 255, 255, 0.1); }
}
`;

export interface CardCallbacks {
	onAccept(issue: Issue, suggestion: Suggestion): void;
	onIgnore(issue: Issue): void;
	onAddToDictionary(word: string): void;
	onReplaceWord(issue: Issue, word: string): void;
	/** The sentence the issue sits in, for AI rewrites. */
	sentenceFor(issue: Issue): { start: number; end: number; text: string } | null;
	onRewrite(start: number, end: number, text: string): void;
}

/**
 * The suggestion popup.
 *
 * It lives in a shadow root on a top-level host element, which is what keeps
 * the page's stylesheets from reaching in and wrecking the layout.
 *
 * The root is open rather than closed on purpose. Closing it would only hide
 * the card from page scripts, and everything in it is derived from text the
 * page already holds — while an open root is what lets the end-to-end tests
 * actually assert on what the user sees.
 */
export class SuggestionCard {
	private host: HTMLElement;
	private root: ShadowRoot;
	private card?: HTMLElement;
	private issue?: Issue;
	private hasApiKey = false;

	constructor(private callbacks: CardCallbacks) {
		this.host = document.createElement('grammar-check-card');
		this.host.style.setProperty('all', 'initial', 'important');
		this.root = this.host.attachShadow({ mode: 'open' });

		const style = document.createElement('style');
		style.textContent = STYLES;
		this.root.appendChild(style);
	}

	setApiKeyAvailable(available: boolean): void {
		this.hasApiKey = available;
	}

	get currentIssue(): Issue | undefined {
		return this.issue;
	}

	/** True when the event happened inside the card, so callers can ignore it. */
	contains(target: EventTarget | null): boolean {
		return target instanceof Node && this.host.contains(target);
	}

	hide(): void {
		this.issue = undefined;
		this.card?.remove();
		this.card = undefined;
		this.host.remove();
	}

	show(issue: Issue, anchor: DOMRect): void {
		this.issue = issue;

		const card = document.createElement('div');
		card.className = 'card';

		const severity = severityOf(issue);
		const kind = document.createElement('div');
		kind.className = 'kind';
		kind.style.color = SEVERITY_COLORS[severity];
		kind.textContent = issue.kindLabel || issue.kind;
		card.appendChild(kind);

		const message = document.createElement('div');
		message.className = 'message';
		message.textContent = issue.message;
		card.appendChild(message);

		card.appendChild(this.suggestionRow(issue));
		if (issue.kind === 'Repetition') card.appendChild(this.synonymSection(issue));
		if (this.hasApiKey) card.appendChild(this.rewriteSection(issue));

		this.card?.remove();
		this.card = card;
		this.root.appendChild(card);
		if (!this.host.isConnected) document.body.appendChild(this.host);

		this.position(card, anchor);
	}

	private suggestionRow(issue: Issue): HTMLElement {
		const actions = document.createElement('div');
		actions.className = 'actions';

		for (const suggestion of issue.suggestions.slice(0, 3)) {
			const button = document.createElement('button');
			button.className = 'primary';
			button.textContent =
				suggestion.kind === 'remove' ? 'Delete' : suggestion.text || '(blank)';
			button.addEventListener('click', () => this.callbacks.onAccept(issue, suggestion));
			actions.appendChild(button);
		}

		const ignore = document.createElement('button');
		ignore.textContent = 'Ignore';
		ignore.addEventListener('click', () => this.callbacks.onIgnore(issue));
		actions.appendChild(ignore);

		if (issue.kind === 'Spelling') {
			const add = document.createElement('button');
			add.textContent = 'Add to dictionary';
			add.addEventListener('click', () => this.callbacks.onAddToDictionary(issue.original));
			actions.appendChild(add);
		}

		return actions;
	}

	private synonymSection(issue: Issue): HTMLElement {
		const section = document.createElement('div');
		section.className = 'section';

		const label = document.createElement('div');
		label.className = 'label';
		label.textContent = 'Synonyms';
		section.appendChild(label);

		const list = document.createElement('div');
		list.className = 'actions';
		const loading = document.createElement('span');
		loading.className = 'note';
		loading.textContent = 'Looking up…';
		list.appendChild(loading);
		section.appendChild(list);

		void send({ type: 'synonyms', word: issue.original }).then((response) => {
			// The user may have moved on while the request was in flight.
			if (this.issue !== issue) return;

			list.replaceChildren();
			if (response.type !== 'synonyms' || response.words.length === 0) {
				const empty = document.createElement('span');
				empty.className = 'note';
				empty.textContent = 'No synonyms found.';
				list.appendChild(empty);
				return;
			}

			for (const word of response.words.slice(0, 8)) {
				const button = document.createElement('button');
				button.textContent = matchCase(issue.original, word);
				button.addEventListener('click', () =>
					this.callbacks.onReplaceWord(issue, matchCase(issue.original, word)),
				);
				list.appendChild(button);
			}
		});

		return section;
	}

	private rewriteSection(issue: Issue): HTMLElement {
		const section = document.createElement('div');
		section.className = 'section';

		const label = document.createElement('div');
		label.className = 'label';
		label.textContent = 'Rewrite this sentence';
		section.appendChild(label);

		const actions = document.createElement('div');
		actions.className = 'actions';
		section.appendChild(actions);

		const output = document.createElement('div');
		section.appendChild(output);

		for (const { tone, label: text } of TONES) {
			const button = document.createElement('button');
			button.textContent = text;
			button.addEventListener('click', async () => {
				const sentence = this.callbacks.sentenceFor(issue);
				if (!sentence) return;

				output.replaceChildren(note('Rewriting…'));
				const response = await send({ type: 'rewrite', text: sentence.text, tone });
				if (this.issue !== issue) return;

				if (response.type === 'error') {
					output.replaceChildren(note(response.message));
					return;
				}
				if (response.type !== 'rewrite') return;

				const preview = document.createElement('div');
				preview.className = 'rewrite';
				preview.textContent = response.text;

				const apply = document.createElement('button');
				apply.className = 'primary';
				apply.textContent = 'Apply';
				apply.addEventListener('click', () =>
					this.callbacks.onRewrite(sentence.start, sentence.end, response.text),
				);

				const row = document.createElement('div');
				row.className = 'actions';
				row.style.marginTop = '8px';
				row.appendChild(apply);

				output.replaceChildren(preview, row);
			});
			actions.appendChild(button);
		}

		return section;
	}

	private position(card: HTMLElement, anchor: DOMRect): void {
		const margin = 8;
		const { width, height } = card.getBoundingClientRect();

		let left = anchor.left;
		let top = anchor.bottom + margin;

		if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
		if (left < margin) left = margin;
		// Flip above the anchor when there is no room below it.
		if (top + height > window.innerHeight - margin) top = anchor.top - height - margin;
		if (top < margin) top = margin;

		card.style.left = `${left}px`;
		card.style.top = `${top}px`;
	}
}

function note(text: string): HTMLElement {
	const element = document.createElement('div');
	element.className = 'note';
	element.style.marginTop = '8px';
	element.textContent = text;
	return element;
}

/** Keep the writer's capitalisation when swapping in a synonym. */
export function matchCase(original: string, replacement: string): string {
	if (original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase();
	if (/^\p{Lu}/u.test(original)) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
	return replacement;
}
