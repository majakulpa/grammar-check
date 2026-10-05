import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json';

const isDev = process.env.NODE_ENV === 'development';

/**
 * MV3 only accepts `'self'` and `'wasm-unsafe-eval'` in `script-src` — anything
 * else (notably `'unsafe-eval'`) makes Chrome reject the whole extension.
 * `'wasm-unsafe-eval'` is what lets the background worker compile Harper's WASM.
 */
function extensionCSP(dev: boolean): string {
	const connectSrc = ["'self'", 'https://api.datamuse.com', 'https://api.anthropic.com'];
	const styleSrc = ["'self'", "'unsafe-inline'"];

	if (dev) {
		// Vite's HMR channel.
		connectSrc.push('http://localhost:5173', 'ws://localhost:5173');
		styleSrc.push('http://localhost:5173');
	}

	return [
		"script-src 'self' 'wasm-unsafe-eval'",
		"object-src 'self'",
		`connect-src ${connectSrc.join(' ')}`,
		`style-src ${styleSrc.join(' ')}`,
		"img-src 'self' data:",
	].join('; ');
}

export default defineManifest({
	manifest_version: 3,
	name: `Grammar Check${isDev ? ' (dev)' : ''}`,
	description: pkg.description,
	version: pkg.version,
	icons: {
		16: 'icons/icon-16.png',
		48: 'icons/icon-48.png',
		128: 'icons/icon-128.png',
	},
	action: {
		default_popup: 'src/popup/index.html',
		default_title: 'Grammar Check',
	},
	options_page: 'src/options/index.html',
	background: {
		service_worker: 'src/background/index.ts',
		type: 'module',
	},
	content_scripts: [
		{
			matches: ['<all_urls>'],
			all_frames: true,
			match_about_blank: true,
			// Lets the script run in sandboxed/`about:`-style frames by falling back
			// to the initiator's origin. Valid MV3, missing from CRXJS's types.
			// @ts-expect-error -- not in @crxjs/vite-plugin's manifest types yet.
			match_origin_as_fallback: true,
			js: ['src/content/index.ts'],
			run_at: 'document_idle',
		},
	],
	// `activeTab` lets the popup read the current tab's hostname when the user
	// clicks the icon, without the blanket read access `tabs` would grant.
	permissions: ['storage', 'activeTab'],
	host_permissions: ['https://api.datamuse.com/*', 'https://api.anthropic.com/*'],
	content_security_policy: {
		extension_pages: extensionCSP(isDev),
	},
});
