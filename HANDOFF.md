**Phase 1 is done — the product exists.** You can type Dostoevsky now. All 8 agents completed, 143 tests pass across 5 packages, working tree is clean with 5 conventional commits. Highlights:

- **Engine** (`packages/engine`): pure TS, zero deps, live engine and replay share one event reducer so client stats and server verification are identical by construction. The `kogasa` consistency function was checked verbatim against Monkeytype's actual source. **Both adversarial verifiers passed it with zero findings** — worked examples, edge cases, and 200 seeded property-test runs all hold.
- **Difficulty recalibrated and frozen**: the old weights over-counted word length (nearly constant in real prose) and ignored sentence length. New spread: 5 warmup / 14 standard / 7 hard / 4 brutal — Woolf's *Mrs Dalloway* is the most brutal at 78.4, short Nietzsche aphorisms are the warmups. Weights logged in `DECISIONS.md`.
- **Typing stage + result view**: hidden-textarea capture, 90ms-eased caret, 3-line window, live HUD, focus-loss dim, caps-lock tag; completion fades to a title card with the hesitation heatmap over the passage, hand-rolled SVG sparkline, slowest words, and punctuation tax.
- End-to-end verified mechanically: a scripted ~54s run against a real API-fetched passage produced a wire-valid 258-event log whose replay reproduced live stats exactly.

**Gate 1 is a feel review — only you can do it.** Start it with:

```
docker --context desktop-linux compose up -d && pnpm dev
```

then type **10+ runs at http://localhost:5173**, ideally in both Chromium and Firefox. Checklist:

1. No dropped or misordered keystrokes during fast bursts; caret never visibly lags.
2. Backspace rules: blocked into a fully-correct previous word, allowed into one committed with errors, Ctrl/Alt+Backspace clears the word.
3. `'` `"` `-` `(` `)` all typeable — no Firefox quick-find popup, Tab never moves focus (it loads the next passage).
4. Skip a word mid-way with space (rest goes "missed"), and mash extra chars at a word end (caps at +8, then ignored).
5. Hand-check one run's wpm/accuracy against the formulas.
6. Judge the feel-only stuff: caret ease, line scroll, the 300ms hold before the result fade, heatmap/sparkline proportions.

Two quirks to know: a perfectly metronomic run renders the heatmap uniformly tungsten (every latency equals p95 — expected, not a bug), and on `/` keyboard-tabbing to the nav links is intentionally impossible per the spec. Also worth a look: whether the 5 warmup passages actually *feel* like warmups — weights are frozen, so if not, the fix is adding shorter aphorisms, not re-tuning.

When the feel passes, Phase 2 is next: profiles, result submission with server-side recompute, the `/stats` and `/library` pages, integration tests, and the Playwright smoke.

---

# Full project record (appended 2026-07-08 — handoff to a new assistant)

Everything above this line is the **Gate 1 review note** written at the end of Phase 1. Everything below is the complete context for picking this project up cold.

## What this is

**prosetype** (placeholder name, see open questions) — a Monkeytype-style typing test where you type curated public-domain literary prose (Dostoevsky, Nietzsche, Hammett, Woolf…) instead of word lists. Full product spec is `plan.md` at the repo root — **read it first; it is the contract.** It mandates building one phase at a time with a human review gate between phases, TypeScript strict everywhere, no `any`, zod at every I/O boundary, conventional commits, and logging every choice the spec doesn't dictate as one line in `DECISIONS.md` (currently ~60 entries — it is the project's institutional memory; keep appending to it).

## How it was built so far

Each phase was executed as a multi-agent workflow (parallel specialist agents per subsystem, then an integrator that makes everything pass and creates the commits), with the human reviewing at each gate. 13 conventional commits on `main`, working tree clean, **143 tests passing across 5 packages**.

## Repo map

```
apps/api        Fastify 5 — /api/v1/healthz, GET /passages/next + /passages/:id
                (PassageRepository), zod-validated env config, Drizzle schema (§4)
                + migration in apps/api/drizzle/, postgres.js client
apps/web        Vite 7 + React 19 + react-router 7 + Tailwind v4 (CSS-first,
                @theme tokens in src/styles.css — NO tailwind.config.js).
                Letterbox frame, typing stage (src/stage), result view (src/result)
packages/engine Pure TS, zero deps — the heart. Event reducer shared by live
                engine and replay; Monkeytype-exact stats (kogasa verified
                against their source); heatmap/reader-stats derivation
packages/schema Shared zod DTOs — charEvents wire format v1, Passage DTO,
                results contract, profiles
scripts/        ingest.ts — corpus/passages.yaml → normalize (§6.3) → difficulty
                (§6.4) → upsert to Postgres; prints curation report
corpus/         passages.yaml — 30 excerpts, every one verified verbatim against
                fetched Project Gutenberg texts
```

## State by phase

- **Phase 0 (done):** monorepo scaffold, docker-compose Postgres 16, Drizzle schema + migration, Fastify skeleton, web letterbox shell with the §9.4 design tokens, ingest pipeline, 30-passage corpus draft, GitLab CI (lint → typecheck → unit).
- **Phase 1 (done, Gate 1 pending):** engine per §7 with worked examples A/B/C + replay-invariant property tests; typing stage per §9.3 (hidden textarea, native `beforeinput` listeners, eased caret, 3-line window, live HUD, focus-loss dim, caps-lock tag, Tab=next/Esc=restart); result view (hesitation heatmap, hand-rolled SVG sparkline, slowest words, punctuation tax); `GET /passages/next` wired up. Difficulty weights were **recalibrated and frozen** (Gate 0's one open issue — original weights bunched 26/30 passages into warmup; new spread is 5 warmup / 14 standard / 7 hard / 4 brutal).
- **Phase 2 (next, do NOT start before Gate 1 passes):** profile bootstrap (§9.2), `POST /results` with server-side engine recompute (§8), `/stats` and `/library` pages, API integration tests with real Postgres in CI, one Playwright smoke. Gate 2 = data audit.
- **Phase 3:** backlog only — never build without explicit instruction.

## Pending human actions (blocking)

1. **Gate 1 feel review** — the checklist at the top of this file. Human must type 10+ runs.
2. **Gate 0 corpus approval was never explicitly given** — `corpus/passages.yaml` is still headed "DRAFT — pending curator review". The human should approve/veto excerpts (read `curation-report.txt`).
3. **Open §13 questions:** final product name (affects wordmark + `prosetype.profileId` localStorage key in Phase 2); repo host confirmation (GitLab CI assumed, not yet pushed anywhere).

## Environment quirks (will bite you)

- The default docker context points at a remote host — always use `docker --context desktop-linux compose up -d` on this machine.
- Run everything through pnpm at the root: `pnpm dev` (api :3001 + web :5173, web proxies `/api`), `pnpm lint` / `pnpm typecheck` / `pnpm test`, `pnpm db:migrate`, `pnpm ingest`.
- Node 24 native type stripping runs api/scripts directly — no build step; imports use explicit `.ts` extensions with `allowImportingTsExtensions`.
- TypeScript pinned ~5.9 (typescript-eslint compat) — don't bump to 6.x casually. zod is v4, Tailwind v4, react-router 7, Vite 7.
- Postgres is already migrated and seeded locally (30 passages). Re-running `pnpm ingest` is idempotent.

## Corpus notes the curator should know

Red Harvest, As I Lay Dying, and Kafka's The Castle are not on Project Gutenberg — substituted (2nd Maltese Falcon passage + extra Fitzgerald/Woolf). Anna Karenina on PG is the Garnett translation (plan assumed Maude); Meditations is PG #15877 (Long). All logged in DECISIONS.md.

## Rules of engagement (from plan §0 — the next assistant must keep following these)

Build one phase at a time; stop for human review at each gate. No features beyond the spec. Conventional commits ending with the assistant's co-author line. Where the spec is silent: boring choice + one line in `DECISIONS.md`. Never commit secrets.