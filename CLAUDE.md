# typeprose

Typing practice on real prose (Project Gutenberg literature). pnpm monorepo, TypeScript throughout.

## Map

- `apps/web` — React 19 + Vite + Tailwind 4 + zustand. Typing UI ("stage"), result view, library/stats/leaderboard. Dev server :5173 proxies `/api` → :3001.
- `apps/api` — Fastify 5 + Drizzle + Postgres. Routes under `/api/v1`. No build step — Node 24 runs the TS directly (native type stripping).
- `packages/engine` — pure typing engine (keystroke log, stats, heatmap, replay). **Zero runtime dependencies**; Monkeytype-parity stats pinned by tests.
- `packages/schema` — zod v4 schemas, single source of truth for the wire format (DTOs, charEvents, the 6000-event/64KB caps).
- `scripts` — corpus ingest; `corpus/passages.yaml` is the corpus.

## Commands

Needs **Node 24** (`.nvmrc`) — run via nvm if the shell defaults older; the api/ingest scripts break on Node <24.

```sh
docker compose up -d && pnpm --filter api db:migrate && pnpm ingest   # first-time setup
pnpm dev            # web + api
pnpm lint && pnpm typecheck && pnpm test    # CI runs these in this order, then e2e
pnpm test:e2e       # Playwright smoke (starts/reuses servers)
```

## Rules

- **`DECISIONS.md` is load-bearing**: one line per non-obvious decision (what, why). Read the relevant lines before changing behavior that looks odd — it's usually deliberate. Append a line when you make a new non-obvious choice.
- `IMPROVEMENTS.md` = roadmap; `deploy/` = production notes.
- No `any` (lint error). tsconfig is maximally strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` → use `import type`).
- api/packages/scripts use explicit `.ts` extensions on relative imports (Node type stripping); keep api code free of enums/namespaces/parameter properties.
- Web components take colors from `var(--color-*)` (stage/bone/smoke/tungsten/blood/bar in `apps/web/src/styles.css`) — never hardcode hex; errors never color-alone; respect `prefers-reduced-motion`.
- Web has no direct zod dep — API responses validate through `apps/web/src/lib/api.ts`'s `Parser<T>` + shared schemas.
- API data access goes behind repository interfaces; `buildApp` takes optional repo deps so route tests stub them. `pnpm test` must stay green with no database (integration suite auto-skips).
- Error bodies: `{ error: 'BadRequest'|'NotFound', message }`. Reject invalid input with 400, never silently truncate.
- Engine stat behavior is pinned to 2 decimals — changing a pinned test value is a deliberate decision that belongs in `DECISIONS.md`.

## Editor rules

`.cursor/rules/*.mdc` holds the same conventions scoped per area (for Cursor users); keep them in sync with this file when conventions change.
