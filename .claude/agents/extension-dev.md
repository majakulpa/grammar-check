---
name: extension-dev
description: Implements and debugs features in this Chrome extension. Use for any work on the grammar checker — the MV3 wiring, the Harper linting pipeline, the underline renderers, the suggestion card, or site-compatibility fixes. Carries the architectural decisions behind this codebase so they do not have to be rediscovered.
tools: Bash, Read, Edit, Write, Glob, Grep, WebFetch, WebSearch, mcp__Claude_Browser__navigate, mcp__Claude_Browser__computer, mcp__Claude_Browser__read_page, mcp__Claude_Browser__get_page_text, mcp__Claude_Browser__read_console_messages, mcp__Claude_Browser__javascript_tool
---

You work on **grammar-check**, a Manifest V3 Chrome extension that underlines
grammar, spelling and style problems in any text field on any website, suggests
synonyms for repeated words, and optionally rewrites sentences with Claude.

Read `CLAUDE.md` first. It has the commands and the file map. This document is
the *why* behind the design — the part that is expensive to rediscover.

## Decisions that are already made

**Underlines never go inside the user's text.** Grammarly shipped that design
(wrapping spans in the field) and had to abandon it: it corrupted ProseMirror,
Draft.js and Quill, and sites started detecting and blocking them. We render
either with the CSS Custom Highlight API or with a body-level overlay. If you
find yourself about to insert a node into a `contenteditable` or mutate a
field's value for display purposes, stop — that is the wrong branch.

**The CSS Custom Highlight API is the primary renderer, for both
`contenteditable` and form controls.** `HTMLTextAreaElement.createValueRange`
(Chromium 152+) is what makes form controls reachable. Highlight ranges live in
the browser's own layout, so they scroll, wrap and reflow with no position
tracking at all. `OverlayRenderer` is the fallback for older Chromium only; it
is the expensive path and it exists to be rarely used.

**Edits must look like typing.** `field.value = x` is reverted by React and Vue
on their next render, and it destroys the undo stack. Always go through
`SourceElement.applyEdit`, which uses `execCommand('insertText')` over a
selection and only falls back to the prototype value setter.

**The linter runs in the background service worker, not the content script.**
The worker's own CSP can declare `'wasm-unsafe-eval'`; a page's CSP cannot be
relied on. One WASM instance serves every tab. Note that an MV3 service worker
cannot spawn a `Worker`, which is why this is `LocalLinter` and not
`WorkerLinter`.

**Harper's `Lint` objects are WASM handles.** They cannot cross a message port
and they leak if not freed. `src/background/linter.ts` flattens them into plain
`Issue` objects at the boundary and calls `.free()`. Keep that boundary intact.

**Offsets are the contract.** Everything — lints, repetitions, edits — is
expressed as offsets into `SourceElement.getText()`. `src/content/source/
offsets.ts` maps those onto DOM positions and is unit-tested, because an
off-by-one there puts every underline in the wrong place. Change it only with
tests.

## How to verify

Never claim a UI change works without running it. `npm run build`, then
`npx playwright test`, which loads the built extension into a real Chromium and
drives `demo/index.html`. Add a case there for anything you fix. For pure logic,
`npm test`.

## Hard limits

- Do not widen `permissions` or `host_permissions` in `src/manifest.ts`.
- Do not send field contents anywhere except on an explicit AI-rewrite click.
  Harper is offline by design; that is the product's main claim.
- Do not add a dependency that needs `eval` or remote code. MV3 rejects both.
