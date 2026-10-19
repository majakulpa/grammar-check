import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/shared/protocol';

/** A stand-in for `chrome.storage.local` that behaves like the real one. */
function fakeStorage() {
	let data: Record<string, unknown> = {};
	return {
		get: vi.fn(async (key: string) => (key in data ? { [key]: data[key] } : {})),
		set: vi.fn(async (patch: Record<string, unknown>) => {
			data = { ...data, ...patch };
		}),
		read: () => data,
	};
}

describe('settings', () => {
	let storage: ReturnType<typeof fakeStorage>;
	let getSettings: () => Promise<typeof DEFAULT_SETTINGS>;
	let setSettings: (patch: Partial<typeof DEFAULT_SETTINGS>) => Promise<typeof DEFAULT_SETTINGS>;

	beforeEach(async () => {
		storage = fakeStorage();
		vi.stubGlobal('chrome', { storage: { local: storage } });
		vi.resetModules();
		({ getSettings, setSettings } = await import('../src/background/settings'));
	});

	it('returns the defaults when nothing has been saved', async () => {
		expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
	});

	it('fills in defaults for keys a saved older version did not have', async () => {
		await storage.set({ settings: { dialect: 'British' } });

		const settings = await getSettings();
		expect(settings.dialect).toBe('British');
		expect(settings.rules).toEqual({});
		expect(settings.enabled).toBe(true);
	});

	it('merges a patch rather than replacing everything', async () => {
		await setSettings({ dictionary: ['widgetise'] });
		await setSettings({ dialect: 'British' });

		const settings = await getSettings();
		expect(settings.dictionary).toEqual(['widgetise']);
		expect(settings.dialect).toBe('British');
	});

	it('keeps the API key out of synced storage', async () => {
		await setSettings({ anthropicApiKey: 'sk-ant-test' });

		// Writing it anywhere Chrome syncs would put the key on Google's servers.
		expect(storage.set).toHaveBeenCalled();
		expect(Object.keys(storage.read())).toEqual(['settings']);
	});
});
