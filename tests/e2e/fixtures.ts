import { chromium, test as base, type BrowserContext, type Worker } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const extensionPath = path.join(root, 'dist');

export const demoUrl = `file://${path.join(root, 'demo/index.html')}`;
export const optionsUrl = (id: string) => `chrome-extension://${id}/src/options/index.html`;

interface WorkerFixtures {
	/**
	 * The browser with the built extension loaded, shared by every test.
	 *
	 * Worker-scoped on purpose: an unpacked extension needs a persistent
	 * context, and a fresh profile makes the background worker recompile
	 * Harper's 16MB WASM — seconds of wall time, variable enough to make
	 * per-test profiles flaky. The `page` fixture is what keeps tests
	 * independent. (It cannot be called `context`: Playwright's own `context`
	 * is test-scoped and may not be re-scoped.)
	 */
	extension: BrowserContext;
	background: Worker;
	extensionId: string;
}

export const test = base.extend<Record<never, never>, WorkerFixtures>({
	extension: [
		async ({}, use) => {
			const context = await chromium.launchPersistentContext('', {
				channel: 'chromium',
				args: [
					`--disable-extensions-except=${extensionPath}`,
					`--load-extension=${extensionPath}`,
				],
			});
			await use(context);
			await context.close();
		},
		{ scope: 'worker' },
	],

	background: [
		async ({ extension }, use) => {
			const worker =
				extension.serviceWorkers()[0] ?? (await extension.waitForEvent('serviceworker'));
			await use(worker);
		},
		{ scope: 'worker' },
	],

	extensionId: [
		async ({ extension, background }, use) => {
			const id = new URL(background.url()).host;

			// A page that stays open for the whole run, doing two jobs: it
			// compiles the WASM up front so no test absorbs that inside its own
			// timeout, and it holds a keep-alive port so Chrome does not evict
			// the worker between tests and make every one of them pay a cold
			// start. A worker cannot message its own listener, which is why this
			// has to be a page.
			const warmer = await extension.newPage();
			await warmer.goto(optionsUrl(id));
			await warmer.evaluate(async () => {
				await chrome.runtime.sendMessage({ type: 'lint', text: 'Warming the linter up.' });
				const port = chrome.runtime.connect({ name: 'keep-alive' });
				setInterval(() => port.postMessage('ping'), 20_000);
			});

			await use(id);
			await warmer.close();
		},
		{ scope: 'worker' },
	],

	/** A page per test, so no test inherits another's caret, focus or settings. */
	page: async ({ extension, background, extensionId: _warmed }, use) => {
		// Settings are shared state in a shared browser; start every test from
		// the defaults rather than from whatever the last one saved.
		await background.evaluate(() => chrome.storage.local.clear());

		const page = await extension.newPage();
		await use(page);
		await page.close();
	},
});

export const expect = test.expect;
