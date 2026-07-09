# PROSETYPE, Build Plan & Task Specification

_Working title. A typing test for people who read. Node.js + React + Postgres._

---

## 0. Instructions to the executing AI

Read this entire document before writing any code. Then build **one phase at a time**, in order. At the end of each phase, **stop and request human review** against that phase's acceptance checklist. Do not begin the next phase without explicit approval.

Rules of engagement:

- Follow this spec exactly. Where the spec is silent, make the boring choice and log it in `DECISIONS.md` at the repo root (one line per decision: what, why).
- Do not add features not listed here. Phase 3 items are a backlog, not an invitation.
- Conventional commits (`feat:`, `fix:`, `chore:`, `test:`). Small, coherent commits.
- TypeScript strict mode everywhere. No `any`. Zod validation at every I/O boundary.
- If a library's current API differs from what this spec assumes, follow the library's current docs and note the divergence in `DECISIONS.md`.
- Never commit secrets. `.env` is gitignored; keep `.env.example` current.

---

## 1. Product brief

**What:** A minimalist typing test in the spirit of Monkeytype, but you type real literary prose instead of random word lists, Dostoevsky in Garnett's translation, Nietzsche's aphorisms, Hammett's hardboiled sentences, Marcus Aurelius. The corpus is curated, public-domain, and is itself the product.

**Who:** People who read seriously and type daily, developers, writers, students of literature. The niche is "typing practice that is also twenty seconds inside a great text."

**Point of view:** One aesthetic (literary noir), one mode (quote mode), executed precisely. No settings sprawl. Feel is the entire game: keystroke handling, caret motion, and stat honesty must match or beat Monkeytype's quality bar.

**Differentiators:**

1. Curated literary corpus with real attribution (author, work, translator, year).
2. Real prose difficulty: punctuation, long clauses, em-dash-era syntax, and stats that speak to it (per-character hesitation heatmap, "punctuation tax").
3. Reader-flavored analytics: your speed per author, your stumble map over the actual text.

**Non-goals for v1** (do not build): user accounts/auth, timed word-list modes, multiplayer, leaderboards, mobile-first layout, UI theming options, AI-generated passages, i18n of the UI, non-English passages.

---

## 2. Success criteria for v1

1. A visitor can load the site, start typing immediately, finish a passage, and see honest stats (wpm, raw, accuracy, consistency) plus a per-character hesitation heatmap over the text they just typed.
2. Stats formulas match the Monkeytype definitions in §7 exactly, verified by unit tests with the worked examples given there.
3. No dropped or misordered keystrokes during a 120+ wpm burst on mid-range hardware.
4. Results persist to Postgres against an anonymous profile; a stats page shows history and per-author aggregates after reload.
5. All engine unit tests, API integration tests, and one Playwright smoke test pass in CI.

---

## 3. Tech stack

| Layer      | Choice                                          | Notes                                                                                                  |
| ---------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Runtime    | Node.js 22 LTS+                                 | 24 LTS also fine; pin in `.nvmrc`                                                                      |
| Backend    | Fastify 5                                       | `@fastify/cors`, `@fastify/rate-limit`; use built-in `app.inject()` for tests                          |
| ORM        | Drizzle ORM + drizzle-kit                       | Postgres driver: `postgres` (postgres.js)                                                              |
| DB         | PostgreSQL 16+                                  | via docker-compose for dev                                                                             |
| Frontend   | React 19 + Vite + TypeScript                    | react-router for 3 routes                                                                              |
| Styling    | Tailwind CSS v4                                 | **v4 is CSS-first**: tokens via `@theme` in CSS, no `tailwind.config.js`. Do not emit v3-style config. |
| State      | zustand                                         | thin store wrapping the pure engine                                                                    |
| Validation | zod                                             | shared DTOs in `packages/schema`                                                                       |
| Tests      | vitest, Playwright                              | engine + API + one E2E smoke                                                                           |
| Tooling    | pnpm workspaces, ESLint (flat config), Prettier |                                                                                                        |

**Monorepo layout:**

```
prosetype/
  apps/
    api/          # Fastify server
    web/          # Vite + React app
  packages/
    engine/       # pure TS typing engine + stats (no DOM, no deps)
    schema/       # zod schemas + shared types (DTOs, charEvents format)
  scripts/
    ingest.ts     # corpus ingestion from curation file → Postgres
  corpus/
    passages.yaml # hand-curated excerpts (source of truth for seed data)
  docker-compose.yml
  DECISIONS.md
```

The architectural centerpiece: **`packages/engine` runs in both the browser and the server.** The client computes live stats from the keystroke log; the server re-runs the exact same pure function on the submitted log to verify before persisting. One implementation, no drift.

---

## 4. Data model (Postgres)

Use Drizzle schema definitions; migrations via drizzle-kit. Conceptual DDL:

```sql
authors (
  id            serial primary key,
  slug          text unique not null,        -- 'dostoevsky'
  name          text not null,               -- 'Fyodor Dostoevsky'
  birth_year    int,
  death_year    int,
  era           text                          -- 'russian-golden-age', 'modernist', ...
);

works (
  id            serial primary key,
  author_id     int not null references authors(id),
  slug          text unique not null,        -- 'crime-and-punishment'
  title         text not null,
  translator    text,                        -- 'Constance Garnett' | null
  pub_year      int,                         -- year of the PD edition/translation
  source        text not null,               -- 'gutenberg:2554' or archive URL
  language      text not null default 'en'
);

passages (
  id            serial primary key,
  work_id       int not null references works(id),
  text          text not null,               -- normalized, typeable (see §6.3)
  text_hash     text unique not null,        -- sha256 of text, dedupe guard
  char_count    int not null,
  word_count    int not null,
  difficulty    numeric(5,2) not null,       -- 0-100, see §6.4
  band          text not null,               -- 'warmup'|'standard'|'hard'|'brutal'
  themes        text[] not null default '{}',-- {'russian-soul','hardboiled',...}
  language      text not null default 'en',
  created_at    timestamptz not null default now()
);

profiles (
  id            uuid primary key default gen_random_uuid(),
  display_name  text,
  created_at    timestamptz not null default now()
);

results (
  id            bigserial primary key,
  profile_id    uuid not null references profiles(id),
  passage_id    int not null references passages(id),
  wpm           numeric(6,2) not null,       -- server-computed values stored
  raw_wpm       numeric(6,2) not null,
  accuracy      numeric(5,2) not null,
  consistency   numeric(5,2) not null,
  duration_ms   int not null,
  char_events   jsonb not null,              -- compact keystroke log, see §7.5
  client_match  boolean not null,            -- server recompute agreed with client?
  created_at    timestamptz not null default now()
);
create index on results (profile_id, created_at desc);
create index on results (passage_id);
create index on passages (band);
create index on passages using gin (themes);
```

---

## 5. Corpus: sourcing rules

**Copyright rule (hard constraint):** seed only from texts that are unambiguously US public domain. As of 2026 that means **works published in 1930 or earlier** (the 95-year rule; the Public Domain Day 2026 class added 1930 works, including the complete _Maltese Falcon_ and Faulkner's _As I Lay Dying_). The practical filter: **prefer texts hosted on Project Gutenberg**, if PG hosts it, it has cleared US PD review. For very recent PD entries (2025-26 class) not yet on PG, either source from a clean PD scan (Internet Archive / Standard Ebooks) or defer the excerpt.

**Explicitly excluded** (in copyright, never seed, even though they fit the brand): Bulgakov's _Master and Margarita_ (all translations), Steinbeck, Camus translations, Pevear & Volokhonsky translations of anything, Kaufmann's Nietzsche translations, Chandler. If the curator wants these vibes later, that's the phase-3 AI-styled-passage feature, clearly labeled as generated, never attributed to the real author.

**PD-safe seed list** (curator picks the exact excerpts; ~30 passages, 140-450 chars each, starting at sentence boundaries):

- **Russian golden age** (theme `russian-soul`): Dostoevsky, _Crime and Punishment_, _Notes from the Underground_, _The Brothers Karamazov_, _White Nights_ (Garnett, all on PG); Tolstoy, _Anna Karenina_ opening, _The Death of Ivan Ilyich_ (Maude/PG editions); Chekhov stories (Garnett); Gogol, _The Overcoat_; Turgenev, _Fathers and Sons_.
- **Aphorists** (theme `aphorisms`, natural warm-ups): Nietzsche, _Thus Spoke Zarathustra_ (Common), _Beyond Good and Evil_ (Zimmern); Marcus Aurelius, _Meditations_ (Long); Epictetus, _Enchiridion_.
- **Hardboiled** (theme `hardboiled`): Hammett, _Red Harvest_ (1929, PD since 2025) and _The Maltese Falcon_ (1930, PD since Jan 1 2026); Conrad, _The Secret Agent_, _Heart of Darkness_ as proto-noir.
- **Modernists** (theme `modernist`): Fitzgerald, _The Great Gatsby_ (1925); Hemingway, _The Sun Also Rises_ (1926); Woolf, _Mrs Dalloway_ (1925); Faulkner, _As I Lay Dying_ (1930); Kafka, _The Castle_ (Muir translation, 1930).
- **Gothic/style** (theme `gothic`): Poe stories; Wilde, _The Picture of Dorian Gray_.

**Curation format**, `corpus/passages.yaml` is the human-editable source of truth:

```yaml
- author: dostoevsky
  author_name: Fyodor Dostoevsky
  era: russian-golden-age
  work: crime-and-punishment
  title: Crime and Punishment
  translator: Constance Garnett
  pub_year: 1914
  source: 'gutenberg:2554'
  themes: [russian-soul]
  text: >
    Pain and suffering are always inevitable for a large intelligence and a
    deep heart. The really great men must, I think, have great sadness on
    earth.
```

**Ingestion pipeline** (`scripts/ingest.ts`): parse YAML → normalize text (§6.3) → compute counts + difficulty (§6.4) → hash + dedupe → upsert authors/works/passages. Print a **curation report**: per passage, the difficulty score, band, and any characters that were folded during normalization (so the curator can veto mangled excerpts). Ingestion is **offline/seed-time only**, Gutendex (`gutendex.com/books`, filterable by author/language, links to plain-text formats) may be used by the curator to _locate_ texts, but it is community-run and best-effort, so nothing at runtime ever depends on it. The app reads passages exclusively from our Postgres.

---

## 6. Passage processing

### 6.1 Excerpt guidelines (for the curator, and for any tooling that proposes excerpts)

- 140-450 characters, 25-80 words. One coherent thought; starts and ends at sentence boundaries.
- Avoid dialogue-heavy fragments in v1 (attribution dashes and nested quotes type badly).
- Prefer excerpts that are self-contained out of context, aphorisms, openings, famous passages.

### 6.2 Canonical text constraints

Stored passage text must consist only of: ASCII letters, digits, space, and this punctuation set: `. , ; : ! ? ' " - ( )`. Single spaces only; no leading/trailing whitespace; no newlines.

### 6.3 Normalization map (applied at ingestion, never at runtime)

- Curly quotes `‘ ’ “ ”` → straight `'` and `"`
- Em dash and en dash (U+2014, U+2013): `word-word` → `word - word` (spaced hyphen); already-spaced dashes → single spaced hyphen
- Ellipsis `…` → `...`
- Non-breaking and exotic spaces → regular space; collapse whitespace runs; trim
- Accented Latin folded to ASCII (`é→e`, `à→a`, `ï→i`, `æ→ae`, `œ→oe`), every folded word is listed in the curation report for human veto
- Any character not in the §6.2 set after the above → ingestion **fails loudly** for that passage with the offending character named

### 6.4 Difficulty score

```
raw = 2.0 * avgWordLength
    + 2.5 * punctuationCharsPer100Chars
    + 0.4 * percentWordsOfLength8Plus
    + 0.2 * avgSentenceLengthInWords
difficulty = clamp(raw, 0, 100)
```

Starting weights only, after seeding, calibrate so the seed corpus spreads sensibly across bands, then freeze. Bands: `warmup < 30 ≤ standard < 45 ≤ hard < 60 ≤ brutal`. Store both score and band; band may be manually overridden in YAML (`band_override:`).

---

## 7. The typing engine (packages/engine)

Pure TypeScript, zero dependencies, no DOM access. Deterministic: given `(passageText, eventLog)`, all outputs are reproducible. This module is the heart of the product, build it first, test it hardest.

### 7.1 Test lifecycle

- Test is in `idle` state on load; **timer starts at the first character keystroke** (not on focus).
- Quote-mode end condition: the test **completes when the final character of the last word has been consumed** (typed input length for the last word reaches its target length), regardless of correctness. No trailing space required.
- `tab` → abandon and load a new random passage. `esc` → restart the current passage from scratch. (Restarted runs of the same passage are valid but the client marks them; do not treat them specially in v1 beyond storing them like any run.)

### 7.2 Input model

- Words are the passage split on single spaces; punctuation belongs to its word.
- Character states: `pending`, `correct`, `incorrect`, `corrected` (was wrong, later fixed), `missed` (skipped via early space), `extra` (typed beyond word length).
- **Space** commits the current word and advances. If the word was incomplete, all untyped characters become `missed` and the word is incorrect.
- **Extra characters:** typing beyond a word's length appends `extra` chars, capped at **+8 per word**; further keypresses are ignored (but still count as incorrect keypresses for accuracy).
- **Backspace:** always allowed within the current word (including deleting extras). Crossing into the previous word is allowed **only if that word was committed with errors**; if the previous word is fully correct, backspace at position 0 is a no-op. `Ctrl/Alt+Backspace` clears the current word's typed input.
- A `corrected` character still counts as one incorrect keypress in accuracy (the original miss is not erased), but the word can still end fully correct for wpm purposes.

### 7.3 Stat formulas (Monkeytype-compatible, implement exactly)

Let `t` = test duration in seconds (first keystroke → completion), from `performance.now()` deltas.

```
wpm         = (charsInCorrectWords + correctSpaces) * 60 / t / 5
rawWpm      = (allTypedChars incl. incorrect + extra + spaces) * 60 / t / 5
accuracy    = 100 * correctKeypresses / (correctKeypresses + incorrectKeypresses)
              -- first-attempt basis; backspaces are not keypresses; default 100 if none
consistency = kogasa( stddev(rawPerSecond) / mean(rawPerSecond) )
              where rawPerSecond = raw wpm computed per 1-second bucket
              kogasa(cov) = 100 * (1 - tanh(cov + cov^3/3 + cov^5/5))
              -- verify against Monkeytype's utils/numbers.ts when implementing
```

`charsInCorrectWords` counts every character of words whose final committed state is fully correct, plus the space following each such word (the final word contributes no space).

### 7.4 Worked examples, encode these as unit tests verbatim

**Example A (perfect run):** passage `it was a dark night` (19 chars incl. 4 spaces). Typed perfectly, first keystroke to last spanning exactly 4.000s.
→ `wpm = 19 * 60 / 4 / 5 = 57.00`, `rawWpm = 57.00`, `accuracy = 100`.

**Example B (one corrected error):** same passage, same 4.000s. The `k` in `dark` was first typed as `l`, then backspaced and corrected. Keypresses: 19 correct + 1 incorrect = 20 (backspace not counted).
→ `accuracy = 100 * 19/20 = 95.00`. All words end fully correct → `wpm = 57.00`. `rawWpm = 20 * 60 / 4 / 5 = 60.00`.

**Example C (skipped word):** passage `the old man`, typed `the` `ol<space>` `man`, total 3.000s. `old` committed incomplete → `d` is `missed`, word incorrect. Correct words: `the` (3+1 space) and `man` (3, no trailing space) → 7 chars.
→ `wpm = 7 * 60 / 3 / 5 = 28.00`. Typed chars for raw: `the` (3) + space + `ol` (2) + space + `man` (3) = 10 → `rawWpm = 40.00`.

Also test: extra-char cap, backspace blocked after a correct word, Ctrl+Backspace, completion on final char without trailing space, and the **replay invariant**: `computeStats(text, events)` re-run on a recorded log reproduces identical numbers (property test over generated logs).

### 7.5 Keystroke log (`charEvents`), the wire format

Compact JSON, shared zod schema in `packages/schema`:

```
{ "v": 1, "events": [[t, i, c], ...] }
  t = ms since first keystroke (int, monotonic non-decreasing)
  i = character index in passage the event applies to
  c = 0 add-correct | 1 add-incorrect | 2 delete | 3 add-extra | 4 space-commit
```

Caps: ≤ 6000 events, ≤ 64KB serialized. This log powers per-second buckets (consistency + the wpm-over-time line), the hesitation heatmap, and server-side verification.

### 7.6 Hesitation heatmap + reader stats

- Per character index: inter-key interval = `t[i] − t[prev add event]` (first char excluded); error touches count.
- Heatmap render data: normalized latency per char, log-scaled, clamped at the p95 of the run.
- Derived stats: three slowest words with times; **punctuation tax** = mean latency on punctuation chars vs. letter chars, as a percentage (e.g. `+38%`).

---

## 8. API (apps/api)

Fastify, JSON, all bodies/queries validated with shared zod schemas. Base path `/api/v1`. CORS locked to the web origin. Rate limit: 100 req/min/IP default, 20/min on result submission.

```
POST /profiles                     → { id }            -- create anon profile
GET  /passages/next?band&theme&author&exclude=1,2,3
                                   → Passage           -- random, excludes recent ids (cap 20)
GET  /passages/:id                 → Passage
GET  /authors                      → [{ slug, name, era, passageCount }]
GET  /themes                       → [{ theme, passageCount }]
POST /results                      → { id, serverStats, clientMatch }
GET  /profiles/:id/stats           → aggregates (below)
GET  /healthz                      → { ok: true }
```

**POST /results contract:** body = `{ profileId, passageId, clientStats: {wpm, rawWpm, accuracy, consistency, durationMs}, charEvents }`. Server behavior:

1. Sanity checks: passage exists; duration ≥ 3000ms; timestamps monotonic; event count plausible for passage length; hard-reject computed wpm > 350.
2. Recompute all stats via `packages/engine` from `charEvents`.
3. Compare with `clientStats` (tolerance: 2% relative or 1.0 absolute wpm). Store **server-computed** values; set `client_match` accordingly. Mismatch is stored and flagged, not rejected (could be a client bug, not cheating).

**GET /profiles/:id/stats returns:** totals (tests, time typed), best wpm (+ passage ref), avg wpm over last 10, accuracy and consistency averages, **per-author table** (tests, avg wpm, the "you type Hemingway 11 wpm faster than Dostoevsky" stat), punctuation-tax average, and the last 50 results for the history list.

---

## 9. Frontend (apps/web)

### 9.1 Routes

- `/`, the test. Passage stage, live HUD, result view (in place, no navigation).
- `/stats`, profile history + aggregates.
- `/library`, browse authors/themes/bands; clicking starts a test filtered to that pick.

### 9.2 Profile bootstrap

On first load: `POST /profiles`, store uuid in `localStorage` (`prosetype.profileId`). All result submissions and stats reads use it. No auth in v1.

### 9.3 Typing stage, implementation requirements (this is where feel lives)

- **Input capture:** a visually hidden `<textarea>` holds focus. Handle `beforeinput`/`input` for character insertion (composition-safe), `keydown` for Backspace/Tab/Esc/modifiers. Ignore input between `compositionstart` and `compositionend`. Block paste. `preventDefault` on printable keys at the document level while the test is focused so `'`, `"`, and `/` never trigger browser quick-find (Firefox) and Tab never moves focus.
- **Timestamps:** `performance.now()` captured in the event handler, before any React work. The store appends to the engine's event log synchronously; React renders from derived state.
- **Rendering:** words as memoized components; only the active word re-renders per keystroke. Caret is an absolutely positioned element moved via `transform` with an 80-100ms ease, measure target position from char span refs. 3-line visible window; completed lines translate up smoothly.
- **Live HUD:** wpm + elapsed, dim, updating on a 100ms interval (display only, never used for stat math). Hidden until first keystroke.
- **Focus loss:** after 1s unfocused, dim the stage and show "click to refocus" (timer keeps running, quote mode is short). Caps Lock indicator (via `getModifierState`) as a small tag in the bottom bar.
- **Completion:** 300ms hold, then fade-cut to the result view: big stats, custom SVG wpm-over-time line (no chart library, hand-rolled sparkline fits the aesthetic), the passage re-rendered as the hesitation heatmap with attribution epigraph, slowest words, punctuation tax. `tab` for next passage works from here.

### 9.4 Design direction, "typewriter in a film frame"

This is a brief to follow, not a mood to approximate. The executing AI must not fall back to generic dark-mode-with-neon defaults.

**Tokens** (Tailwind v4 `@theme` CSS variables):

- `--color-stage: #12100E`, warm smoke black (film, not OLED). Never pure `#000`.
- `--color-bone: #E6E0D2`, typed/foreground text, aged paper.
- `--color-smoke: #6E675C`, pending text, muted warm gray.
- `--color-tungsten: #C99A3C`, the single warm accent: caret, live wpm, focus rings. Desk-lamp amber, used sparingly.
- `--color-blood: #8E3B3B`, errors only. Never decorative.
- Film grain: a subtle SVG-noise overlay at ~3% opacity on the stage; low-contrast vignette. Both removed under `prefers-reduced-motion: reduce`? No, grain is static, keep it; disable only animations under reduced motion.

**Type:** IBM Plex Mono for the typing surface and all data (400/500). EB Garamond italic for attribution epigraphs and passage titles (",  Fyodor Dostoevsky, _Crime and Punishment_, trans. Garnett"). Letterspaced Plex Mono caps at ~11px for labels. No third face.

**Signature element:** the **letterbox**. Thin cinematic bars top and bottom frame every screen, wordmark sits in the top bar; keybind hints (`tab next · esc restart`) sit in the bottom bar styled like subtitles. Stats screen composes like a title card. Motion language is film cuts: 150-200ms opacity fades, no springs, no bounce, nothing slides.

**Restraint rules:** one column, max-width ~68ch, generous vertical space. No cards, no borders, no shadows, hierarchy through type scale and the palette above only. Keyboard focus visible (tungsten ring). Respect `prefers-reduced-motion`.

### 9.5 Result submission

Fire-and-forget on completion with one retry; failure shows a quiet "not saved" note in the bottom bar without blocking the next run.

---

## 10. Phased delivery plan

### Phase 0, Skeleton (foundation, no product yet)

Monorepo scaffold per §3; strict tsconfig, ESLint flat config, Prettier, vitest wiring in all packages; docker-compose Postgres; Drizzle schema + initial migration per §4; `corpus/passages.yaml` with **30 curated passages** per §5 (the executing AI drafts the excerpts from PG texts following §6.1; flags them for curator review); `scripts/ingest.ts` with the normalization pipeline and curation report; Fastify app with `/healthz`; Vite app rendering the letterbox frame and tokens from §9.4; CI (GitHub Actions or GitLab CI, match the repo host) running lint + typecheck + tests.

**Gate 0 (human review):** `pnpm dev` runs api+web; `pnpm ingest` seeds and prints the curation report; reviewer approves/edits the 30 excerpts; tokens screen matches the design direction.

### Phase 1, The loop (the product exists)

`packages/engine` complete per §7 with the full unit-test suite including worked examples A/B/C and the replay invariant; typing stage per §9.3; live HUD; result view with heatmap, sparkline, slowest words, punctuation tax; `tab`/`esc` behavior; passage fetch from `GET /passages/next`.

**Gate 1 (human review, feel):** reviewer types ≥10 runs. Checklist: no dropped/misordered keystrokes at speed bursts; caret smooth and never lags a keystroke visibly; backspace rules per §7.2; `'` `"` `-` `(` `)` all typeable on Firefox and Chromium; skipped-word and extra-char behavior correct; stats plausible and matching a manual calculation on one run.

### Phase 2, Memory (persistence + identity)

Profile bootstrap (§9.2); `POST /results` with server recompute per §8; `/stats` page (history, aggregates, per-author table, punctuation-tax trend); `/library` page; API integration tests (real Postgres in CI via service container); Playwright smoke: load → type a short seeded passage via keyboard events → result appears → reload → run visible in stats.

**Gate 2 (human review, data audit):** server-computed stats match client within tolerance across 10 varied runs (`client_match = true`); history survives reload; per-author aggregates correct against SQL spot-check.

### Phase 3, Backlog (do not build without a new instruction)

Esc command palette; sound profile (typewriter thock); Russian-original passages + Cyrillic input handling; account claim (email magic link) merging an anon profile; AI-generated in-style passages, **always labeled "in the style of," never attributed to the real author**; daily passage; shareable result cards; leaderboards; a light "matinee" theme; auto-excerpt proposer for the curator; deployment hardening.

---

## 11. Testing & quality bar

- **Engine (vitest):** worked examples A/B/C exact to 2 decimals; edge cases listed in §7.4; property test, replaying any generated valid event log reproduces identical stats; fuzz malformed logs (non-monotonic timestamps, out-of-range indices) → engine throws typed errors.
- **API (vitest + `app.inject`):** schema rejection cases; result sanity rejections (>350 wpm, <3s); recompute mismatch flagging; stats aggregation against seeded fixtures.
- **E2E (Playwright):** the single smoke in Phase 2. Keep it to one spec; it exists to catch input-wiring regressions, not to re-test the engine.
- **CI order:** lint → typecheck → unit → integration (Postgres service) → e2e (Phase 2+).

---

## 12. Environment & ops (dev scope)

```
DATABASE_URL=postgres://prosetype:prosetype@localhost:5432/prosetype
PORT=3001
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development
```

Deployment is out of scope for the build phases. Appendix intent for later: single small VPS, docker-compose (api + static web behind Caddy + Postgres volume), nightly `pg_dump`. Do not build deploy tooling now.

---

## 13. Open questions for the human (answer before or during Phase 0)

1. Product name (replaces the PROSETYPE placeholder; affects wordmark in the letterbox and the localStorage key).
2. Repo host (GitHub vs. your GitLab), determines CI flavor in Phase 0.
3. Russian originals: confirm they stay in Phase 3 (they add Cyrillic input + IME complexity that would blur the Phase 1 feel gate).
4. Any excerpt vetoes/additions to the §5 seed list before the curator pass.
