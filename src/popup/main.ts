import { DEFAULT_SETTINGS, type Settings } from '../shared/protocol';

const enabled = document.querySelector<HTMLInputElement>('#enabled')!;
const site = document.querySelector<HTMLInputElement>('#site')!;
const siteLabel = document.querySelector<HTMLElement>('#site-label')!;
const options = document.querySelector<HTMLButtonElement>('#options')!;

async function load(): Promise<Settings> {
	const stored = await chrome.storage.local.get('settings');
	return { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings> | undefined) };
}

async function save(patch: Partial<Settings>): Promise<void> {
	await chrome.storage.local.set({ settings: { ...(await load()), ...patch } });
}

async function currentHost(): Promise<string | null> {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	if (!tab?.url) return null;
	try {
		return new URL(tab.url).hostname;
	} catch {
		// `chrome://` and other internal pages, where we do not run anyway.
		return null;
	}
}

const settings = await load();
const host = await currentHost();

enabled.checked = settings.enabled;
enabled.addEventListener('change', () => void save({ enabled: enabled.checked }));

if (host) {
	siteLabel.textContent = `Enabled on ${host}`;
	site.checked = !settings.disabledHosts.includes(host);
	site.addEventListener('change', async () => {
		const current = await load();
		const disabledHosts = site.checked
			? current.disabledHosts.filter((h) => h !== host)
			: [...new Set([...current.disabledHosts, host])];
		await save({ disabledHosts });
	});
} else {
	site.disabled = true;
	siteLabel.textContent = 'Not available on this page';
}

options.addEventListener('click', () => chrome.runtime.openOptionsPage());
