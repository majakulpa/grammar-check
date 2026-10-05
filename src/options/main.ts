import { DEFAULT_SETTINGS, type Settings } from '../shared/protocol';

const dialect = document.querySelector<HTMLSelectElement>('#dialect')!;
const apiKey = document.querySelector<HTMLInputElement>('#api-key')!;
const model = document.querySelector<HTMLSelectElement>('#model')!;
const dictionary = document.querySelector<HTMLTextAreaElement>('#dictionary')!;
const disabledHosts = document.querySelector<HTMLTextAreaElement>('#disabled-hosts')!;
const save = document.querySelector<HTMLButtonElement>('#save')!;
const status = document.querySelector<HTMLElement>('#status')!;

const lines = (value: string): string[] =>
	value
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

const stored = await chrome.storage.local.get('settings');
const settings: Settings = {
	...DEFAULT_SETTINGS,
	...(stored.settings as Partial<Settings> | undefined),
};

dialect.value = settings.dialect;
model.value = settings.model;
apiKey.value = settings.anthropicApiKey ?? '';
dictionary.value = settings.dictionary.join('\n');
disabledHosts.value = settings.disabledHosts.join('\n');

save.addEventListener('click', async () => {
	const key = apiKey.value.trim();
	const next: Settings = {
		...settings,
		dialect: dialect.value as Settings['dialect'],
		model: model.value,
		dictionary: lines(dictionary.value),
		disabledHosts: lines(disabledHosts.value),
	};

	// Store the key only when there is one, so clearing the field removes it
	// rather than leaving an empty string that reads as "configured".
	if (key) next.anthropicApiKey = key;
	else delete next.anthropicApiKey;

	await chrome.storage.local.set({ settings: next });

	status.textContent = 'Saved.';
	setTimeout(() => (status.textContent = ''), 2000);
});
