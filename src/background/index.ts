import type { Request, Response } from '../shared/protocol';
import { rewrite } from './ai';
import { invalidateCache, lint, warmUp } from './linter';
import { getSettings } from './settings';
import { synonyms } from './thesaurus';

async function handle(request: Request): Promise<Response> {
	switch (request.type) {
		case 'lint':
			return { type: 'lint', issues: await lint(request.text) };
		case 'synonyms':
			return { type: 'synonyms', words: await synonyms(request.word) };
		case 'rewrite':
			return { type: 'rewrite', text: await rewrite(request.text, request.tone) };
		case 'getSettings':
			return { type: 'settings', settings: await getSettings() };
	}
}

chrome.runtime.onMessage.addListener((request: Request, _sender, sendResponse) => {
	handle(request)
		.then(sendResponse)
		.catch((error: unknown) => {
			const message = error instanceof Error ? error.message : String(error);
			console.error('[grammar-check]', request.type, 'failed:', error);
			sendResponse({ type: 'error', message } satisfies Response);
		});

	// Keeps the message channel open for the async `sendResponse` above.
	return true;
});

// Cached issues were produced under the old dialect and dictionary.
chrome.storage.local.onChanged.addListener((changes) => {
	if (changes.settings) invalidateCache();
});

// Compiling the WASM takes long enough to be felt on the first keystroke, so
// pay for it when the worker starts rather than when the user starts typing.
chrome.runtime.onInstalled.addListener(() => void warmUp());
chrome.runtime.onStartup.addListener(() => void warmUp());
void warmUp();
