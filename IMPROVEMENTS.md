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
run beats the profile's best — needs the profile best returned from
`POST /results` response or a cheap `GET`.~~ Shipped: `POST /results`
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
("prosetype needs a keyboard — visit on desktop").~~ Shipped as
`lib/device.ts` (`isKeyboardless`) + `KeyboardlessNotice` in
`TypingStage.tsx`.
- ~~Library/stats/leaderboard already render fine — keep them browsable.~~
The notice links out to all three.
- Full mobile typing support is a separate, much bigger decision (Tier 4).



### ~~1.4 Leaderboard & nav discoverability~~ ✅ shipped 2026-07-13

Leaderboard and claim are palette-only; the result screen doesn't link to
the board for the passage you just typed.

- ~~Result view: "see leaderboard for this passage" link (`?passageId=`).~~
Shipped.
- ~~Leaderboard page: in-page toggle global ↔ this-passage instead of
URL-only; highlight the viewer's own row / show "your rank".~~ Shipped:
tabs + a "your rank #N at X wpm" line + highlighted own row (needed
adding `profileId` to the leaderboard entry DTO).
- ~~Consider adding `leaderboard` to the top-bar nav (it currently holds
only stats · library).~~ Shipped.



### ~~1.5 Replay a specific passage~~ ✅ shipped 2026-07-13

Library picks load a *random* match; there is no way to retype the
passage you just finished or one you liked.

- ~~"Retype this passage" command/action on the result view (the id is
already in the store).~~ Shipped: a button next to "leaderboard for this
passage" in `ResultView.tsx` calls the existing `restart()` store action
(no refetch — the result view's `test` is already that passage).
- ~~Library: list actual passages (title + opening words + band) under each
author/theme, each linking to `/?passage=<id>` — needs a
`GET /passages/:id` load path in the store (route already exists).~~
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



### 2.1 Daily streak

The daily passage exists but nothing tracks doing it.

- Track consecutive daily-passage completions server-side (per profile,
UTC-keyed like the passage pick).
- Show streak count on the daily result + stats page. A claimed profile
keeps it across devices.
- No push/email nagging — the streak display itself is the motivator.



### 2.2 Practice weak keys

Stats already computes problem keys/bigrams and shows a table; there's no
way to act on it.

- "Drill weak keys" palette command / stats-page button: generate a word
run biased toward words containing the profile's worst keys/bigrams
(client-side filter over the existing 500-word list — zero engine
changes, same words-mode submission path).
- This closes the app's core loop: measure → see → train.



### 2.3 Word-mode options

- Punctuation and numbers toggles (Monkeytype's most-used options) —
inject into the sampled word stream; engine already handles both.
- A timed mode (30s / 60s) is popular but changes the engine's
completion semantics — spec it separately before committing.



### ~~2.4 Corpus growth~~ ✅ shipped 2026-07-13

30 passages exhausts in a week of regular use (word mode was added
precisely for this).

- ~~Use the existing `pnpm propose` tooling to curate a second batch
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



### 3.1 Account management

Claiming sets a display name once from the email local part; there's no
way to change it, sign out, or delete data.

- Rename (shows on leaderboard — users will want this quickly).
- Sign out (drop local profileId) and delete-my-data (GDPR hygiene:
delete profile + results).
- A minimal `/account` page or palette commands; claimed-state indicator
in the letterbox.



### 3.2 Result replay

The engine keeps a full keystroke log — the README sells this — but the
result view only shows the static heatmap.

- "Watch replay" on the result view: re-render the passage board driven
by the charEvents timeline (1×/2× speed). High wow-factor, pure
client-side, data already stored.



### 3.3 Favorites

- Star a passage from the result view; "favorites" filter in the library.
Per-profile server-side (survives claim/merge).



### 3.4 Accessibility pass

- `aria-live` region announcing completion + final WPM.
- Screen-reader review of the stage (the passage is currently
visual-only).
- Keyboard-only audit of library/leaderboard/claim pages.



### 3.5 Share cards for word runs

Word runs currently get no share card. A "words · N" variant of the
canvas card is cheap and keeps the share loop for grinders.

---



## Tier 4 — bigger bets (decide, don't drift into)

- **Mobile typing support** — a real on-screen-keyboard input model;
large effort, likely a different input pipeline. Decide deliberately.
- **Multiplayer races** — same-passage live races. Websockets, presence,
anti-cheat; the per-passage leaderboard is the async version already.
- **Custom text** — paste your own text to type. Cheap client-side, but
interacts with results storage the same way word mode did (self-
reported text); reuse the word-mode submission shape.
- **PWA/offline** — manifest exists, no service worker. Offline prose
needs passage caching; nice-to-have, not asked for yet.
- **i18n / Cyrillic corpora** — already deferred per plan §13.3.

---



## Suggested sequencing

1. ~~**Batch A (one sitting each):** 1.1 first-run hint, 1.2 PB on result,
  1.3 mobile notice, 1.4 leaderboard links/toggle.~~ ✅ shipped 2026-07-13.
2. ~~**Batch B:** 1.5 passage linking + retype, 2.4 corpus batch #2.~~ ✅
  shipped 2026-07-13.
3. **Batch C:** 2.1 streak, 2.2 weak-key drill, 2.3 word-mode toggles.
4. **Batch D:** 3.1 account management, 3.2 replay, then reassess.

Rationale: Batch A fixes the silent-failure moments (confused first
visit, unnoticed PB, dead mobile tab). Batch B makes the corpus the
product again. Batch C builds the habit loop. Batch D rewards the
invested user.