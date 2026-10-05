/**
 * The single message vocabulary between content scripts and the background
 * worker. Both sides import these types, so a change to one end fails the
 * typecheck on the other.
 */

/** How a suggestion changes the text it is attached to. Mirrors Harper's own kinds. */
export type SuggestionKind = 'replace' | 'remove' | 'insertAfter';

export interface Suggestion {
	kind: SuggestionKind;
	/** Empty for `remove`. */
	text: string;
}

/** A problem to underline, in plain-text offsets into the field's value. */
export interface Issue {
	start: number;
	end: number;
	/** Harper's lint kind, or `Repetition` for our own repeated-word pass. */
	kind: string;
	/** Human-readable category, e.g. "Spelling mistake". */
	kindLabel: string;
	message: string;
	/** Ordered best-first. Empty when the issue is advisory only. */
	suggestions: Suggestion[];
	/** The text the span covered when the issue was produced, for staleness checks. */
	original: string;
}

/** The concrete edit that accepting `suggestion` on `issue` performs. */
export function editFor(
	issue: Issue,
	suggestion: Suggestion,
): { start: number; end: number; text: string } {
	switch (suggestion.kind) {
		case 'remove':
			return { start: issue.start, end: issue.end, text: '' };
		case 'replace':
			return { start: issue.start, end: issue.end, text: suggestion.text };
		case 'insertAfter':
			return { start: issue.end, end: issue.end, text: suggestion.text };
	}
}

export type Request =
	| { type: 'lint'; text: string }
	| { type: 'synonyms'; word: string }
	| { type: 'rewrite'; text: string; tone: RewriteTone }
	| { type: 'getSettings' };

export type RewriteTone = 'clearer' | 'concise' | 'formal' | 'casual';

export type Response =
	| { type: 'lint'; issues: Issue[] }
	| { type: 'synonyms'; words: string[] }
	| { type: 'rewrite'; text: string }
	| { type: 'settings'; settings: Settings }
	| { type: 'error'; message: string };

export interface Settings {
	enabled: boolean;
	dialect: 'American' | 'British' | 'Australian' | 'Canadian';
	/** Hostnames where the extension stays quiet. */
	disabledHosts: string[];
	/** Words the user added; never flagged as misspelled. */
	dictionary: string[];
	/** Absent until the user enters one. The AI features stay hidden without it. */
	anthropicApiKey?: string;
	model: string;
}

export const DEFAULT_SETTINGS: Settings = {
	enabled: true,
	dialect: 'American',
	disabledHosts: [],
	dictionary: [],
	model: 'claude-opus-5-5',
};

/** Typed wrapper around `chrome.runtime.sendMessage`. */
export async function send(request: Request): Promise<Response> {
	return chrome.runtime.sendMessage(request) as Promise<Response>;
}
