# grammar-check

A Manifest V3 Chrome extension: grammar, spelling and style underlines in any
text field on any site, synonyms for repeated words, and optional Claude-powered
sentence rewrites.

## Commands

```bash
npm run build      # build to dist/ — this is what you load in Chrome
npm run dev        # Vite dev server with HMR
npm test           # vitest, pure logic only
npm run typecheck  # tsc --noEmit
npx playwright test  # loads the built extension into Chromium, drives demo/index.html
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

## Measured behaviour

A check is ~10ms once the worker is warm. A cold worker costs ~1.5s to
recompile Harper's WASM, which is why `keepAlive.ts` exists — MV3 evicts an
idle worker after 30s, and without the port the user pays that 1.5s every time
they return to a form.

The architectural reasoning — why underlines stay outside the field, why edits
go through `insertText`, why the linter is in the worker — is in
`.claude/agents/extension-dev.md`.
