import { DEFAULT_SETTINGS, type Settings } from '../shared/protocol';

/**
 * Settings live in `chrome.storage.local` rather than `sync` because one of
 * them is an API key, and `sync` would push it to Google's servers.
 */
export async function getSettings(): Promise<Settings> {
	const stored = await chrome.storage.local.get('settings');
	return { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings> | undefined) };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
	const next = { ...(await getSettings()), ...patch };
	await chrome.storage.local.set({ settings: next });
	return next;
}
