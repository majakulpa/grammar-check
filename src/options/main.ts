import { DEFAULT_SETTINGS, send, type Rule, type Settings } from '../shared/protocol';

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

// --- Checks ------------------------------------------------------------------

const rulesContainer = document.querySelector<HTMLElement>('#rules')!;
const ruleSearch = document.querySelector<HTMLInputElement>('#rule-search')!;

function renderRules(rules: Rule[], filter: string): void {
	const needle = filter.trim().toLowerCase();
	const matching = needle
		? rules.filter(
				(rule) =>
					rule.name.toLowerCase().includes(needle) ||
					rule.description.toLowerCase().includes(needle),
			)
		: rules;

	if (matching.length === 0) {
		rulesContainer.replaceChildren(
			Object.assign(document.createElement('div'), {
				className: 'rules-empty',
				textContent: 'No checks match that.',
			}),
		);
		return;
	}

	rulesContainer.replaceChildren(
		...matching.map((rule) => {
			const row = document.createElement('label');
			row.className = 'rule';

			const toggle = document.createElement('input');
			toggle.type = 'checkbox';
			toggle.checked = rule.enabled;
			// Written straight through rather than on Save: a list this long is
			// easy to lose track of, and a toggle that needs confirming elsewhere
			// is a toggle people think did not work.
			toggle.addEventListener('change', async () => {
				const stored = await chrome.storage.local.get('settings');
				const current = { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings>) };
				await chrome.storage.local.set({
					settings: { ...current, rules: { ...current.rules, [rule.name]: toggle.checked } },
				});
			});

			const text = document.createElement('div');
			text.className = 'rule-text';
			const name = document.createElement('strong');
			name.textContent = rule.name.replace(/([a-z])([A-Z])/g, '$1 $2');
			const description = document.createElement('span');
			description.textContent = rule.description;
			text.append(name, description);

			row.append(toggle, text);
			return row;
		}),
	);
}

const rulesResponse = await send({ type: 'getRules' });
if (rulesResponse.type === 'rules') {
	const { rules } = rulesResponse;
	renderRules(rules, '');
	ruleSearch.addEventListener('input', () => renderRules(rules, ruleSearch.value));
} else {
	rulesContainer.textContent = 'Could not load the list of checks.';
}
