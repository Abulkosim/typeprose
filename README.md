# prosetype

A typing practice app built on public-domain prose, with Monkeytype-compatible stats and a hesitation heatmap.

## Stack

pnpm monorepo — TypeScript, Fastify API, React/Vite web app, Postgres via Drizzle.

## Getting started

```
pnpm install
docker --context desktop-linux compose up -d
pnpm dev
```

See `plan.md` and `DECISIONS.md` for design details, and `HANDOFF.md` for current project status.

Bundled background-music credits are in `apps/web/public/music/ATTRIBUTION.txt`.
