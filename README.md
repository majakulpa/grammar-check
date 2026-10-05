# grammar-check

A Grammarly-style Chrome extension that you install yourself and run locally.

It underlines grammar, spelling and style problems in any text field on any
website, points out words you have overused and offers synonyms, and — only if
you give it an API key — rewrites sentences with Claude.

**Grammar checking is fully offline.** The engine is
[Harper](https://github.com/Automattic/harper), a Rust grammar checker compiled
to WebAssembly, running inside the extension. Nothing you type is sent anywhere.
The two features that do use the network are opt-in and obvious: synonym lookups
(Datamuse, no account, no key) and AI rewrites (your own Anthropic key).

## Install

Requires Node 18+ and Chrome 120+.

```bash
git clone git@github.com:majakulpa/grammar-check.git
cd grammar-check
npm install
npm run build
```

Then:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder

The icon appears in your toolbar and the extension starts working immediately.
It stays installed across restarts. Chrome shows a "disable developer-mode
extensions" banner now and then — dismissing it is harmless.

After pulling changes, run `npm run build` again and press the reload button on
the extension's card in `chrome://extensions`.

> The built extension is about 16 MB. Almost all of that is Harper's English
> dictionary, which is the price of checking grammar without a server.

## What it does

**Grammar and spelling** — red squiggles for real errors: agreement, tense,
spelling, capitalisation, punctuation, misused words.

**Style** — amber squiggles for things that are not wrong but could be better:
wordiness, redundancy, awkward phrasing, hard-to-read sentences.

**Repetition and synonyms** — purple squiggles on content words you have used
three or more times nearby. Click one for a list of synonyms; click a synonym to
swap it in, with your capitalisation preserved.

**AI rewrites** — optional. Add an Anthropic API key in Settings and each
suggestion card grows a row of rewrite buttons: *Clearer*, *Shorter*, *More
formal*, *More casual*. Only the sentence you are on is sent, only when you
click. Without a key the feature does not appear at all.

Click into any text field and put your cursor on an underlined word to see the
suggestion card.

## Settings

Right-click the toolbar icon → **Options**, or open the popup and click
*Settings*.

- **Dialect** — American, British, Australian or Canadian English
- **Anthropic API key** — enables AI rewrites; stored locally, never synced
- **Model** — Opus 5.5 (default), Sonnet 5.5, or Haiku 4.5
- **Personal dictionary** — words that are never flagged as misspellings
- **Disabled sites** — hostnames to stay quiet on

The toolbar popup also has a quick on/off for the current site.

## How it works

Three pieces talk over one typed message protocol:

- **Background service worker** — holds the Harper WASM linter, caches results,
  and is the only place that touches the network.
- **Content script** — finds the focused field, maps plain-text offsets onto
  whatever the browser is actually laying out, and draws the underlines.
- **Popup and options pages** — settings.

Underlines are drawn with the
[CSS Custom Highlight API](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Custom_highlight_API),
which reaches inside `<textarea>` and `<input>` via `createValueRange` on
Chromium 152+. Nothing is ever inserted into your text: markup inside a text
field breaks rich editors, which is the mistake Grammarly spent years undoing.
On older Chromium an absolutely-positioned overlay takes over for form controls.

## Development

```bash
npm run dev        # Vite with hot reload
npm test           # unit tests
npm run typecheck
npx playwright test  # drives the built extension against demo/index.html
```

`demo/index.html` is a page of deliberately broken text covering a textarea, an
input, a contenteditable, a scrolling container, and fields that should be left
alone. Open it with `npm run dev` running and iterate there.

## Licence

MIT. Bundles Harper under Apache-2.0 — see [NOTICE](NOTICE).
