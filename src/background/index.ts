import { DEFAULT_SETTINGS, type Request, type Response, type Settings } from '../shared/protocol';
import { rewrite } from './ai';
import { invalidate, lint, listRules, warmUp } from './linter';
import { getSettings } from './settings';
import { synonyms } from './thesaurus';

async function handle(request: Request): Promise<Response> {
	switch (request.type) {
		case 'lint':
			return { type: 'lint', issues: await lint(request.text) };
		case 'getRules':
			return { type: 'rules', rules: await listRules() };
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

// Content scripts hold a port open while a field is focused. Accepting it is
// all that is needed: an open port with traffic on it is what stops Chrome
// evicting this worker and throwing away the compiled WASM.
chrome.runtime.onConnect.addListener((port) => {
	if (port.name !== 'keep-alive') return;
	port.onMessage.addListener(() => {});
});

chrome.storage.local.onChanged.addListener((changes) => {
	const change = changes.settings;
	if (!change) return;

	const read = (value: unknown): Settings => ({
		...DEFAULT_SETTINGS,
		...(value as Partial<Settings> | undefined),
	});
	invalidate(read(change.oldValue), read(change.newValue));
});

// Compiling the WASM takes long enough to be felt on the first keystroke, so
// pay for it when the worker starts rather than when the user starts typing.
chrome.runtime.onInstalled.addListener(() => void warmUp());
chrome.runtime.onStartup.addListener(() => void warmUp());
void warmUp();
