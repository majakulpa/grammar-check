# grammar-check

A Manifest V3 Chrome extension: grammar, spelling and style underlines in any
text field on any site, synonyms for repeated words, and optional Claude-powered
sentence rewrites.

## Commands

```bash
npm run build      # build to dist/ — this is what you load in Chrome
npm run dev        # Vite dev server with HMR
npm test           # vitest, pure logic only
npm run test:coverage  # the same, with enforced thresholds
npm run typecheck  # tsc --noEmit
npm run test:e2e   # loads the built extension into Chromium, drives demo/index.html
npm run test:a11y  # just the axe and keyboard suites
npm run test:all   # everything, in the order CI would
```

Install: `chrome://extensions` → Developer mode → Load unpacked → `dist/`.
After `npm run build`, hit reload on the extension card.

## Layout

| Path | What lives there |
|---|---|
| `src/manifest.ts` | MV3 manifest (CRXJS `defineManifest`) |
| `src/shared/protocol.ts` | The message vocabulary both processes import |
| `src/background/` | Harper linter, Datamuse client, Claude rewrites, message router |
| `src/content/source/` | `SourceElement` adapters + plain-text↔DOM offset mapping |
| `src/content/render/` | `HighlightRenderer` (primary), `OverlayRenderer` (fallback) |
| `src/content/card.ts` | Suggestion popup, in a shadow root |
| `src/content/index.ts` | Controller: field focus, debounce, caret tracking |
| `src/content/keepAlive.ts` | Holds a port open so the worker is not evicted mid-session |
| `demo/index.html` | Test page with deliberately broken text |

## Conventions

- Tabs for indentation, single quotes, semicolons.
- Comments explain *why*, never *what*. If a line needs a comment to say what it
  does, rewrite the line.
- Everything crossing a process boundary is typed in `src/shared/protocol.ts`.
- All positions are offsets into `SourceElement.getText()`, never DOM nodes.

## Testing notes

The Playwright suite shares one browser across all tests (a worker-scoped
fixture) because a fresh Chrome profile makes the worker recompile the WASM,
which is slow enough to be flaky. Independence comes from the per-test `page`
fixture, which clears `chrome.storage.local` before each test. If you add a
test that needs a clean profile, give it its own context explicitly.

## Testing Google Docs

Two layers, and the difference matters:

- `tests/e2e/docs.spec.ts` runs against `pages/fake-google-docs.html`, served
  at a real `docs.google.com` URL through Playwright route interception — which
  is what makes Chrome inject the actual bootstrap and bridge. It covers the
  hook claim, reading, underline placement, paste-based editing and the
  staleness refusal, with no Google account.
- `tests/e2e/docs-live.spec.ts` is opt-in and run by hand:
  `npm run docs:login` once, then
  `GRAMMAR_CHECK_DOC_URL=<url> npm run test:docs-live`.

The fake is built from our own reading of an undocumented Google hook. If that
reading is wrong, the fake is wrong the same way and the offline tests pass
regardless. **Only the live test can tell you Docs support actually works** —
run it after anything that touches `src/content/googleDocs/`.

## Accessibility

The target is WCAG 2.2 AA, and it is enforced, not aspired to:

- `tests/e2e/a11y.spec.ts` scans every surface with axe in both themes.
  `expectNoViolations` fails if axe ran no checks at all, so a mis-scoped scan
  cannot pass by matching nothing.
- `tests/e2e/keyboard.spec.ts` covers what axe cannot: the card is reachable
  only by `Alt+Enter`, arrow keys move within it, `Esc` returns focus.
- `tests/contrast.test.ts` checks the palette against AA using the same
  `src/shared/contrast.ts` the extension ships, so the assertion cannot drift
  from what renders.

Two rules worth keeping: the card must never take focus by itself, because an
issue can appear mid-word; and the settings' checks list must stay a single tab
stop, or everything below it becomes unreachable in practice.

## Coverage

`vite.config.ts` scopes coverage to the modules that can be tested without a
browser and holds them at 90%. Everything excluded there is covered by the
Playwright suite against the real extension instead — if you add a pure helper,
it belongs in the measured set, not the exclusion list.

## Measured behaviour

A check is ~10ms once the worker is warm. A cold worker costs ~1.5s to
recompile Harper's WASM, which is why `keepAlive.ts` exists — MV3 evicts an
idle worker after 30s, and without the port the user pays that 1.5s every time
they return to a form.

The architectural reasoning — why underlines stay outside the field, why edits
go through `insertText`, why the linter is in the worker — is in
`.claude/agents/extension-dev.md`.
