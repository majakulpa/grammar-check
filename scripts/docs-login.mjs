/**
 * Opens a browser in the profile the live Docs test uses, so you can sign in
 * to Google once by hand. The session is kept on disk and reused afterwards.
 *
 * The profile is git-ignored. Nothing reads it except the live test.
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const browser = await chromium.launchPersistentContext(path.join(root, '.google-profile'), {
	channel: 'chromium',
	headless: false,
	viewport: null,
	args: [`--disable-extensions-except=${root}/dist`, `--load-extension=${root}/dist`],
});

const [page] = browser.pages();
await (page ?? (await browser.newPage())).goto('https://docs.google.com');

console.log('Sign in, then close the window. The session is kept for the live test.');
await browser.waitForEvent('close', { timeout: 0 });
