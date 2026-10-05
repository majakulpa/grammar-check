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
});
