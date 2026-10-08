/**
 * Opens a Chromium with the built extension loaded and the demo page ready.
 *
 * This is for looking at the extension, not testing it — it leaves the browser
 * open until you close it. Chrome proper needs Load unpacked; see the README.
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const browser = await chromium.launchPersistentContext(path.join(root, '.try-profile'), {
	channel: 'chromium',
	viewport: null,
	args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});

const [page] = browser.pages();
await (page ?? (await browser.newPage())).goto(`file://${path.join(root, 'demo/index.html')}`);

console.log('Extension loaded. Close the window to stop.');
await browser.waitForEvent('close', { timeout: 0 });
