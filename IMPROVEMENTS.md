# IMPROVEMENTS — user-perspective roadmap

A prioritized plan of further improvements, written from the user's point of
view. Grounded in a full audit of the current surface (routes, stage, result
view, stats, leaderboard, palette) as of 2026-07-13. Deploy steps live in
`REMAINING.md`; this file is product work.

Guiding frame: three user moments — **first minute** (do I get it?), **first week** (why come back?),
**first month** (am I improving? can I show it?).

---

## Tier 1 — quick wins, high user impact

### ~~1.1 First-run guidance~~ ✅ shipped 2026-07-13

A new visitor lands on `/` with a random passage and zero explanation.

- ~~One-time dismissible hint (localStorage-flagged): "type the passage ·
tab next · esc commands" rendered where the HUD will appear, gone on
first keystroke and never shown again.~~ Shipped as "type the passage
below to begin" in `Hud.tsx`, flagged via `settings/onboarding.ts`.
- ~~Result view, first completion only: one line pointing at stats
("your run is saved — see /stats for progress").~~ Shipped as
"saved · track your progress at stats" in `ResultView.tsx`.
- Cost: small. No new routes, one flag.



### ~~1.2 Personal bests on the result screen~~ ✅ shipped 2026-07-13

Best WPM exists only on `/stats`; a run that beats it passes silently.

- ~~Show "personal best" tag (and previous best) on the result view when a
run beats the profile's best — needs the profile best returned from~~
`POST /results` ~~response or a cheap~~ `GET`~~.~~ Shipped: `POST /results`
now returns `isNewBest`/`previousBestWpm`/`isNewPassageBest`/
`previousPassageBestWpm`; `BestTag` in `ResultView.tsx` renders it.
- ~~Per-passage PB: "your best on this passage: 72 wpm" — makes repeats
meaningful.~~ Shipped.
- A "new record" moment is the single cheapest retention feature a typing
app has. ~~Keep it noir (a quiet tungsten tag, not confetti).~~ Revised
on the owner's instruction: a proper celebration - a warm tungsten
"flashbulb" flare + glow on the wpm number, tag pops in (`styles.css`
`best-flash`/`best-glow`/`best-pop`, all one-shot and reduced-motion
safe). Reserved for a genuine overall PR; a passage-only best stays a
quiet pop with no flash.



### ~~1.3 Mobile: at minimum, honesty~~ ✅ shipped 2026-07-13

The hidden-textarea input model requires a physical keyboard; on a phone
the app just doesn't respond, with no explanation.

- ~~Detect coarse pointer / no keyboard and show a quiet letterboxed notice
("typeprose needs a keyboard — visit on desktop").~~ Shipped as
`lib/device.ts` (`isKeyboardless`) + `KeyboardlessNotice` in
`TypingStage.tsx`.
- ~~Library/stats/leaderboard already render fine — keep them browsable.~~
The notice links out to all three.
- Full mobile typing support is a separate, much bigger decision (Tier 4).



### ~~1.4 Leaderboard & nav discoverability~~ ✅ shipped 2026-07-13

Leaderboard and claim are palette-only; the result screen doesn't link to
the board for the passage you just typed.

- ~~Result view: "see leaderboard for this passage" link (~~`?passageId=`~~).~~
Shipped.
- ~~Leaderboard page: in-page toggle global ↔ this-passage instead of
URL-only; highlight the viewer's own row / show "your rank".~~ Shipped:
tabs + a "your rank #N at X wpm" line + highlighted own row (needed
adding `profileId` to the leaderboard entry DTO).
- ~~Consider adding~~ `leaderboard` ~~to the top-bar nav (it currently holds
only stats · library).~~ Shipped.



### ~~1.5 Replay a specific passage~~ ✅ shipped 2026-07-13

Library picks load a *random* match; there is no way to retype the
passage you just finished or one you liked.

- ~~"Retype this passage" command/action on the result view (the id is
already in the store).~~ Shipped: a button next to "leaderboard for this
passage" in `ResultView.tsx` calls the existing `restart()` store action
(no refetch — the result view's `test` is already that passage).
- ~~Library: list actual passages (title + opening words + band) under each
author/theme, each linking to~~ `/?passage=<id>` ~~— needs a~~
`GET /passages/:id` ~~load path in the store (route already exists).~~
Shipped: a new `GET /passages` list endpoint (filtered by author/theme/
band, `PassageRepository.list`) backs a per-passage summary DTO
(`PassageSummaryItem`: id/band/opening/work.title/author); `LibraryPage.tsx`
adds a lazy "show passages" disclosure under each author/theme row. Picking
a passage links to `/?passage=<id>`, which `StagePage.tsx` reads and loads
via a new `loadById` store action (`fetchPassageById` → `GET /passages/:id`,
the route already existed).
- Favorites can wait (Tier 3); direct linking is the 80%.

---



## Tier 2 — the comeback loop (first week)



### ~~2.1 Daily streak~~ ✅ shipped 2026-07-14

The daily passage exists but nothing tracks doing it.

- Track consecutive daily-passage completions server-side (per profile,
UTC-keyed like the passage pick).
- Show streak count on the daily result + stats page. A claimed profile
keeps it across devices.
- No push/email nagging — the streak display itself is the motivator.



### ~~2.2 Practice weak keys~~ ✅ shipped 2026-07-14

Stats already computes problem keys/bigrams and shows a table; there's no
way to act on it.

- "Drill weak keys" palette command / stats-page button: generate a word
run biased toward words containing the profile's worst keys/bigrams
(client-side filter over the existing 500-word list — zero engine
changes, same words-mode submission path).
- This closes the app's core loop: measure → see → train.



### ~~2.3 Word-mode options~~ ✅ shipped 2026-07-14

- ~~Punctuation and numbers toggles (Monkeytype's most-used options) —
inject into the sampled word stream; engine already handles both.~~
- ~~A timed mode (30s / 60s) is popular but changes the engine's
completion semantics — spec it separately before committing.~~ ✅
shipped 2026-07-16 as 15/30/60/120s timed mode (see below).



### ~~2.4 Corpus growth~~ ✅ shipped 2026-07-13

30 passages exhausts in a week of regular use (word mode was added
precisely for this).

- ~~Use the existing~~ `pnpm propose` ~~tooling to curate a second batch
(target: 100+ passages, weighted toward the thin bands — warmup has
only 5).~~ Shipped: 71 new passages curated via `pnpm propose` from 10
additional Project Gutenberg works — Baum, Twain, Stevenson, London,
Dickens, Austen, Stoker, Wells, Aesop (trans. Vernon Jones), Melville —
appended to `corpus/passages.yaml` and ingested. Aesop's short,
simple-sentence fables were deliberately biased toward warmup. Corpus is
now 101 passages · warmup 15 · standard 45 · hard 26 · brutal 15 (warmup
tripled from 5).
- ~~More authors/themes also makes the library page worth browsing.~~ 24
authors now (was 14); 20 themes now (was 5) — pairs naturally with the
new library passage listing from 1.5.

---



## Tier 3 — identity & polish (first month)



### ~~3.1 Account management~~ ✅ shipped 2026-07-14

Claiming sets a display name once from the email local part; there's no
way to change it, sign out, or delete data.

- ~~Rename (shows on leaderboard — users will want this quickly).~~
Shipped: `PATCH /profiles/:id` + rename form on `/account`.
- ~~Sign out (drop local profileId) and delete-my-data (GDPR hygiene:
delete profile + results).~~ Shipped: sign out clears the local id;
`DELETE /profiles/:id` removes profile + results + claim tokens in one
transaction, behind a two-step confirm.
- ~~A minimal~~ `/account` ~~page or palette commands; claimed-state indicator
in the letterbox.~~ Shipped: `/account` page (three states: no profile /
anonymous / claimed), the palette's claim command became "Account", and
the header nav shows the display name once claimed.
- Prerequisite shipped alongside: the leaderboard no longer exposes raw
`profileId` (it is the bearer credential the new rename/delete endpoints
key on) — the client sends `?self=` and the server marks `isSelf` instead.



### ~~3.2 Result replay~~ ✅ shipped 2026-07-14

The engine keeps a full keystroke log — the README sells this — but the
result view only shows the static heatmap.

- ~~"Watch replay" on the result view: re-render the passage board driven
by the charEvents timeline (1×/2× speed). High wow-factor, pure
client-side, data already stored.~~ Shipped: `ReplayEngine` in
`@typeprose/engine` (same reducer as the live engine, so replay cannot
drift from live rendering) drives `PassageBoard` from a rAF clock;
"watch replay" swaps the heatmap for the replay with pause, 1×/2×, and
watch-again. Works for prose and word runs. Known cosmetic limit: the
wire log carries no typed characters, so extras replay as blanks.



### ~~3.3 Favorites~~ ✅ shipped 2026-07-16

- ~~Star a passage from the result view; "favorites" filter in the library.
Per-profile server-side (survives claim/merge).~~ Shipped: a `favorites`
join table (composite PK, idempotent), `GET`/`PUT`/`DELETE /profiles/:id/favorites`; the profile owns the join (cascades on delete,
merges on claim), the catalog turns ids into summaries. Web: an optimistic
`useFavoritesStore`, a prose-only star on the result view, and a "your
favorites" section on the library page.



### ~~3.4 Accessibility pass~~ ✅ shipped 2026-07-16

- `aria-live` ~~region announcing completion + final WPM.~~ Shipped: a
visually-hidden `role="status"` region on the result view.
- ~~Screen-reader review of the stage (the passage is currently
visual-only).~~ Shipped: the char-span board is `aria-hidden`; the input's
`aria-describedby` exposes the clean target text.
- ~~Keyboard-only audit of library/leaderboard/claim pages.~~ Shipped: a
skip-to-content link + `<main>` landmark; the pages were already
buttons/links/labeled forms under the global tungsten focus ring.



### ~~3.5 Share cards for word runs~~ ✅ shipped 2026-07-16

- ~~Word runs currently get no share card. A "words · N" variant of the
canvas card is cheap and keeps the share loop for grinders.~~ Shipped: the
card generalized to a `ShareCardMeta` - prose keeps its italic-serif
attribution, word runs caption with their mode label in mono caps.



### ~~3.6 An about screen~~ ✅ shipped 2026-07-14 (not in the original plan)

Nowhere told a new visitor what typeprose actually does beyond the stage
in front of them - no about page, no feature tour.

- ~~Staged in the app's own film language instead of a modal: "roll
credits" from a quiet footer tag or the palette opens an opening title
sequence.~~ Shipped: `credits/` (deck data + a `TitleSequence` component).
Each card types itself out behind the app's own caret, then its subtitle
fades in - covering real literature, daily/word/drill modes, stats +
heatmap + replay, the leaderboard + email claim, the music channels, and
the Esc palette. The house goes dark regardless of theme (a
`credits-noir` CSS scope), auto-advances, and click/space/tab skips.
- Cost: small, self-contained (one new store, one component, a data
file) - worth documenting here so it doesn't read as scope creep on a
later audit.

---



## Tier 4 — bigger bets (decide, don't drift into)

- **Mobile typing support** — a real on-screen-keyboard input model;
large effort, likely a different input pipeline. Decide deliberately.
- **Multiplayer races** — same-passage live races. Websockets, presence,
anti-cheat; the per-passage leaderboard is the async version already.
- ~~**Custom text** — paste your own text to type. Cheap client-side, but
interacts with results storage the same way word mode did (self-
reported text); reuse the word-mode submission shape.~~ ✅ shipped
2026-07-17: a palette-opened paste dialog normalizes text with the
ingest normalizer (moved into the engine package) and submits as
`mode: 'custom'` — the word-mode shape with its own mode tag.
- ~~**PWA/offline** — manifest exists, no service worker. Offline prose
needs passage caching; nice-to-have, not asked for yet.~~ ✅ shipped
2026-07-24: hand-written service worker (network-first shell, `/api`
never intercepted), full-corpus sync into localStorage for offline
prose/library/daily, and an offline result outbox that replays on
reconnect ("will sync"). Details in `DECISIONS.md`.
- **i18n / Cyrillic corpora** — already deferred per plan §13.3.

---



## Suggested sequencing

1. ~~**Batch A (one sitting each):** 1.1 first-run hint, 1.2 PB on result,
  1.3 mobile notice, 1.4 leaderboard links/toggle.~~ ✅ shipped 2026-07-13.
2. ~~**Batch B:** 1.5 passage linking + retype, 2.4 corpus batch #2.~~ ✅
  shipped 2026-07-13.
3. ~~**Batch C:** 2.1 streak, 2.2 weak-key drill, 2.3 word-mode toggles.~~
  ✅ shipped 2026-07-14 (timed mode deferred).
4. ~~**Batch D:** 3.1 account management, 3.2 replay, then reassess.~~
  ✅ shipped 2026-07-14.

Rationale: Batch A fixes the silent-failure moments (confused first
visit, unnoticed PB, dead mobile tab). Batch B makes the corpus the
product again. Batch C builds the habit loop. Batch D rewards the
invested user.

---



## What's next (reassessed 2026-07-14)

Batches A–D are shipped. The highest-value next step is not on this
list: **deploy** (owner steps in `REMAINING.md` — domain, VPS, Resend,
DNS). Everything below has diminishing returns until real users are
hitting the app.

Open product work, in priority order:

1. ~~**Batch E (pre-launch polish):** 3.5 word-run share cards, 3.4
  accessibility pass, 3.3 favorites.~~ ✅ shipped 2026-07-16.
2. ~~**Timed mode (30s/60s)** — the one deliberately deferred piece of
  2.3.~~ ✅ shipped 2026-07-16 as 15/30/60/120s timed mode. Built
  without touching the engine's core reducer: an external `finish()`
  trigger + a `durationOverrideMs` measured over the fixed window that
  the server reproduces from the submitted window, so the recompute
  wire contract still holds. Words-shaped storage (`mode='timed'`,
  migration `0005`); the buffer is sized un-exhaustible so a run always
  ends on the clock. Details in `DECISIONS.md`.
3. ~~**Custom text** — the cheapest Tier 4 bet.~~ ✅ shipped 2026-07-17:
  paste dialog in the palette, ingest-grade normalization client-side
  (the normalizer moved from `scripts/lib` into `@typeprose/engine`),
  submitted as `mode: 'custom'` reusing the word-mode shape (migration
  `0006`). Details in `DECISIONS.md`.
4. ~~**PWA/offline**~~ ✅ shipped 2026-07-24 (owner request): app-shell
  service worker, offline prose via corpus sync, offline result queue.
  Details in `DECISIONS.md`.
5. **Tier 4 (rest)** stays decide-don't-drift: wait for post-launch
  signal before committing to mobile input or multiplayer.

