import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	// An extension needs a persistent context, which cannot be shared safely.
	workers: 1,
	// The first check in a fresh profile waits on a 16MB WASM compile.
	timeout: 90_000,
	expect: { timeout: 30_000 },
	reporter: process.env.CI ? 'github' : 'list',
});
