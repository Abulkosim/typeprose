# prosetype

A typing practice app built on real prose - Dostoevsky, Woolf, Hammett, Aurelius, and friends - pulled from Project Gutenberg. Not random word lists. Actual sentences, with the punctuation still in them.

## What you get

- **Prose mode** - type passages from public-domain books, filtered by author, theme, or difficulty (warmup → brutal)
- **Word mode** - classic timed word sets, with punctuation and numbers toggles, when you just want to grind
- **Daily passage** - one shared text for the day, with a streak that survives claiming your profile
- **Weak-key drill** - generates a word run biased toward the keys and bigrams you actually miss
- **Monkeytype-compatible stats** - wpm, raw, accuracy, consistency
- **Hesitation heatmap** - see where you paused or stumbled after each run
- **Watch replay** - re-type your own run back at yourself, at 1× or 2× speed, driven by the exact keystroke log
- **Reader stats** - slowest words, punctuation tax
- **Library, stats, leaderboard** - browse the corpus, track progress, compete on a passage
- **Command palette** - Esc to switch themes, modes, music, difficulty
- **Background music** - lo-fi, classical, or ambient channels while you type
- **Share cards** - export a result image from a finished prose run
- **Account management** - claim a profile with an email magic link, rename it, sign out, or delete your data
- **Roll credits** - an about screen staged as an opening title sequence instead of a modal

## What makes it different

Most typing apps train you on shuffled dictionaries. prosetype trains you on literature. The engine keeps a full keystroke log, so the result screen doesn't just show a heatmap - it can replay the run frame by frame, exactly as it happened. Difficulty bands come from the prose itself - sentence length, punctuation load - not from how long the string is.

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
