import Anthropic from '@anthropic-ai/sdk';
import type { RewriteTone } from '../shared/protocol';
import { getSettings } from './settings';

const TONE_INSTRUCTIONS: Record<RewriteTone, string> = {
	clearer: 'Make it clearer and easier to follow. Prefer concrete wording over abstraction.',
	concise: 'Make it shorter. Cut filler and redundancy without losing any meaning.',
	formal: 'Make it more formal and professional. Avoid contractions and slang.',
	casual: 'Make it warmer and more conversational, as if writing to a colleague you know well.',
};

const SYSTEM_PROMPT = [
	'You rewrite a single passage of the user\'s own writing.',
	'Reply with the rewritten passage and nothing else: no preamble, no quotation marks,',
	'no commentary, no alternatives.',
	'Preserve the original meaning, the language it is written in, and any names,',
	'numbers, URLs, or technical terms exactly as given.',
	'Match the original punctuation and capitalisation conventions unless they are wrong.',
].join(' ');

export class MissingApiKeyError extends Error {
	constructor() {
		super('No Anthropic API key saved. Add one in the extension options to use AI rewrites.');
		this.name = 'MissingApiKeyError';
	}
}

export async function rewrite(text: string, tone: RewriteTone): Promise<string> {
	const settings = await getSettings();
	if (!settings.anthropicApiKey) throw new MissingApiKeyError();

	const client = new Anthropic({
		apiKey: settings.anthropicApiKey,
		// Sends `anthropic-dangerous-direct-browser-access`, without which the
		// request is rejected at CORS preflight. The key is the user's own and
		// never leaves their machine except to api.anthropic.com.
		dangerouslyAllowBrowser: true,
	});

	const response = await client.beta.messages.create({
		model: settings.model,
		// A rewrite is at most a paragraph; a large ceiling would only buy latency.
		max_tokens: 2000,
		// Rewriting one passage is not a reasoning problem, and this path is in
		// front of someone waiting with their cursor in a text box.
		output_config: { effort: 'low' },
		system: SYSTEM_PROMPT,
		messages: [
			{ role: 'user', content: `${TONE_INSTRUCTIONS[tone]}\n\nPassage:\n${text}` },
		],
		// Routes around a safety refusal instead of handing the user a dead button.
		betas: ['server-side-fallback-2026-07-01'],
		fallbacks: 'default',
	});

	if (response.stop_reason === 'refusal') {
		throw new Error('Claude declined to rewrite this passage.');
	}

	const rewritten = response.content
		.filter((block) => block.type === 'text')
		.map((block) => block.text)
		.join('')
		.trim();

	if (!rewritten) throw new Error('Claude returned an empty rewrite.');
	return rewritten;
}
