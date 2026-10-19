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

// Nothing is editable until the saved values are in the form. Without this a
// change made in the first moments is silently overwritten by the load below,
// and Save would write back a half-populated form.
save.disabled = true;

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

save.disabled = false;
document.body.dataset.ready = 'true';

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
const rulesCount = document.querySelector<HTMLElement>('#rules-count')!;

function renderRules(rules: Rule[], filter: string): void {
	const needle = filter.trim().toLowerCase();
	const matching = needle
		? rules.filter(
				(rule) =>
					rule.name.toLowerCase().includes(needle) ||
					rule.description.toLowerCase().includes(needle),
			)
		: rules;

	// Filtering changes the list silently for anyone not looking at it.
	rulesCount.textContent = needle
		? `${matching.length} of ${rules.length} checks shown`
		: `${rules.length} checks`;

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
			// The list runs to hundreds of checks. Leaving each one in the tab
			// order would make everything below this section unreachable in
			// practice, so the list is a single stop and the arrows move inside.
			toggle.tabIndex = -1;
			// Written straight through rather than on Save: a list this long is
			// easy to lose track of, and a toggle that needs confirming elsewhere
			// is a toggle people think did not work.
			toggle.addEventListener('change', async () => {
				// Nothing is editable until the saved values are in the form. Without this a
// change made in the first moments is silently overwritten by the load below,
// and Save would write back a half-populated form.
save.disabled = true;

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

/** Checkboxes in the list, in the order they are shown. */
function ruleToggles(): HTMLInputElement[] {
	return [...rulesContainer.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
}

/**
 * Arrow-key navigation within the checks.
 *
 * Tab reaches the list; the arrows move through it; Tab again leaves it. Space
 * still toggles, because the checkboxes are real checkboxes.
 */
rulesContainer.addEventListener('keydown', (event) => {
	const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
	if (!keys.includes(event.key)) return;

	const toggles = ruleToggles();
	if (toggles.length === 0) return;

	const current = toggles.indexOf(document.activeElement as HTMLInputElement);
	const next =
		event.key === 'Home' ? 0
		: event.key === 'End' ? toggles.length - 1
		: current === -1 ? 0
		: Math.min(toggles.length - 1, Math.max(0, current + (event.key === 'ArrowDown' ? 1 : -1)));

	toggles[next]?.focus();
	event.preventDefault();
});

const rulesResponse = await send({ type: 'getRules' });
if (rulesResponse.type === 'rules') {
	const { rules } = rulesResponse;
	renderRules(rules, '');
	ruleSearch.addEventListener('input', () => renderRules(rules, ruleSearch.value));
} else {
	rulesContainer.textContent = 'Could not load the list of checks.';
}
