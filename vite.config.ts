/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest';

export default defineConfig({
	plugins: [crx({ manifest })],
	build: {
		// The only runtime is a current Chrome, so there is nothing to down-level
		// to. The default target is old enough to reject top-level `await`.
		target: 'chrome120',
		// Harper's WASM is large; the default 500kB warning is pure noise here.
		chunkSizeWarningLimit: 4000,
	},
	test: {
		// `tests/e2e` belongs to Playwright, which drives a real browser with the
		// built extension loaded. Vitest cannot run those.
		include: ['tests/*.test.ts'],
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			/*
			 * Modules that only exist to talk to a browser, an extension API or
			 * Google Docs. Unit-testing them would mean asserting against mocks
			 * of the very things that break, so they are covered by the
			 * Playwright suite against the real extension instead.
			 */
			exclude: [
				'src/manifest.ts',
				'src/background/index.ts',
				'src/background/ai.ts',
				'src/background/linter.ts',
				'src/content/index.ts',
				'src/content/keepAlive.ts',
				'src/content/googleDocs/**',
				'src/content/card.ts',
				'src/content/render/{highlights,overlay}.ts',
				'src/content/source/{contentEditable,textField,mirror,index,types}.ts',
				'src/options/**',
				'src/popup/**',
			],
			thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
		},
	},
});
