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

/**
 * Pins the extension's ID.
 *
 * Without this an unpacked extension's ID is derived from its install path, so
 * it differs per machine. Google Docs hands its text to whichever extension ID
 * claimed `_docs_annotate_canvas_by_ext`, and that claim is made by a script in
 * the page's own world where no `chrome` API exists — so the ID has to be a
 * constant we can bake into that script at build time.
 */
const PUBLIC_KEY =
	'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqN/CfdBRzhOHYLbUNbT6KHOQn1Rht7bbVjNV3QB6izIGcohD1bT4iVnFAfsw3XAqC4Fz+121UJeKTa6N8PTcdzLg7Ghvz1BKcUg1M7jYGL5GNyG/i1bYWc2Dqt9rqAfniq3v7+Z9C/Dmwy/vSCHxpxPflDRII3BdYHBwS5rUclfRv2QAMhFRDS/Rm4bjMojiqLl5vxwr8fthI6tiluPxvkhHZoTdkUaRl7/VD/3L1+RGy8azF+LiRlgWQCoVYCIKCQVcHvPrsY0zuD7KfErQz96rbuKp4h1u0SiIwHjvO5iQpE78XDdg7wuUtU+LX47OoSh53vVsuX48Q2MAjhxifQIDAQAB';

/** Must match the ID that `PUBLIC_KEY` produces. See `scripts/extension-id.mjs`. */
export const EXTENSION_ID = 'gihlmnljmjmaonjdlcmnfpjphchekpgm';

export default defineManifest({
	manifest_version: 3,
	key: PUBLIC_KEY,
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
			// Must land before Docs boots, and in the page's own world, or the
			// annotation hook is never offered to us.
			matches: ['https://docs.google.com/document/*'],
			js: ['src/content/googleDocs/bootstrap.ts'],
			run_at: 'document_start',
			world: 'MAIN',
			all_frames: false,
		},
		{
			// The bridge also runs in the page's world — it is the only place
			// Docs' own objects are reachable — but after Docs has built itself.
			matches: ['https://docs.google.com/document/*'],
			js: ['src/content/googleDocs/bridge.ts'],
			run_at: 'document_idle',
			world: 'MAIN',
			all_frames: false,
		},
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
