# prosetype

A typing practice app built on real prose - Dostoevsky, Woolf, Hammett, Aurelius, and friends - pulled from Project Gutenberg. Not random word lists. Actual sentences, with the punctuation still in them.

## What you get

- **Prose mode** - type passages from public-domain books, filtered by author, theme, or difficulty (warmup → brutal)
- **Word mode** - classic timed word sets when you just want to grind
- **Daily passage** - one shared text for the day
- **Monkeytype-compatible stats** - wpm, raw, accuracy, consistency
- **Hesitation heatmap** - see where you paused or stumbled after each run
- **Reader stats** - slowest words, punctuation tax
- **Library, stats, leaderboard** - browse the corpus, track progress, compete on a passage
- **Command palette** - Esc to switch themes, modes, music, difficulty
- **Share cards** - export a result image from a finished prose run
- **Claim a profile** - start anonymous, keep your history with an email magic link

## What makes it different

Most typing apps train you on shuffled dictionaries. prosetype trains you on literature. The engine keeps a full keystroke log, so the result screen can replay your run as a heatmap instead of just a number. Difficulty bands come from the prose itself - sentence length, punctuation load - not from how long the string is.

## Stack

pnpm monorepo. TypeScript throughout. Fastify API, React/Vite web app, Postgres via Drizzle.

## Getting started

```sh
pnpm install
docker compose up -d
pnpm --filter api db:migrate
pnpm ingest
pnpm dev
```

Web on `http://localhost:5173`, API on `http://localhost:3001`.

Production deploy notes live in `deploy/`. Music credits are in `apps/web/public/music/ATTRIBUTION.txt`.
