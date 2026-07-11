---
name: verify
description: Launch and drive the prosetype web app to verify changes end-to-end in a real browser.
---

# Verifying apps/web changes

## Launch

```bash
cd apps/web && pnpm exec vite --port 5199   # any free port; don't fight 5173
```

The stage loads passages from the API (`/api` proxied to :3001). Without the
API running, the stage shows its error state, but the chrome (header/footer),
command palette (Esc), settings, and music all work — enough for most UI
verification. For passage flows, start Postgres (`docker compose up -d`) and
the API (`pnpm --filter api dev`) first.

## Drive

Playwright is a devDependency and Chromium is installed. From a plain node
script, resolve it via the app's package.json:

```js
const { createRequire } = require('node:module');
const req = createRequire('/…/prosetype/apps/web/package.json');
const { chromium } = req('@playwright/test');
```

Useful handles:
- Command palette: `page.keyboard.press('Escape')` opens it; input is
  `input[aria-label="Search commands"]`; results are `[role="dialog"] li`.
  Playwright clicks/Enter count as user gestures (autoplay-safe).
- Music tag: `footer button[aria-label^="Music"]`.
- Audio playback evidence: the `Audio` element is module-scoped (not in the
  DOM) — assert via network instead:
  `performance.getEntriesByType('resource')` filtered to `/music/`.
- Settings persist in localStorage under `prosetype.*` keys.

## Gotchas

- The footer is a `grid-cols-3` whose side tags render `null` most of the
  time — check positions with boundingBox, not visual squint (auto-placement
  bugs hide here; columns are now explicit `col-start-*`).
- Theme toggle: run the `matinee`/`noir` command in the palette, then
  screenshot to check token re-pointing.
