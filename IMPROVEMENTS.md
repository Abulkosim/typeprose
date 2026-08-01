# IMPROVEMENTS — user-perspective roadmap

Product work still worth doing. Deploy / ops notes live in `deploy/`.

Guiding frame: three user moments — **first minute** (do I get it?),
**first week** (why come back?), **first month** (am I improving? can I
show it?).

---

## Shipped (summary)

Batches A–E plus the later polish are done. Highlights:

- **First minute:** dismissible first-run hint, personal-best celebration
  on the result view, keyboardless/mobile honesty notice, leaderboard
  discoverability from result + nav.
- **Corpus & linking:** passage list + deep links, retype-this-passage,
  corpus grown to 101 passages (24 authors / 20 themes).
- **Comeback loop:** daily streak, weak-key drill, punctuation/numbers
  toggles, timed mode (15/30/60/120s).
- **Identity & polish:** account rename/sign-out/delete, result replay,
  favorites, a11y pass (including custom-text focus trap + offline
  save-status announcements), share cards (prose + word runs),
  credits/about sequence, custom text, PWA/offline (shell SW + corpus
  sync + result outbox).

Details and trade-offs live in `DECISIONS.md`.

---

## Open work

Highest-value next steps, in priority order:

1. **Corpus growth** — the corpus still exhausts in ~a week of regular
   use. Curate a third batch via `pnpm propose` (weight the thin bands),
   ingest, refresh the library counts. Pure product upside, near-zero
   risk, needs no users. (`pnpm ingest` regenerates a local
   `curation-report.txt` when you want the band breakdown.)

2. **Bundle / perf pass** — build the app, measure bundle size and run a
   Lighthouse pass; may surface concrete wins. No known gap yet, so this
   is investigation, not a fix.

---

## Tier 4 — bigger bets (decide, don't drift)

Wait for post-launch signal before committing:

- **Mobile typing support** — a real on-screen-keyboard input model;
  large effort, likely a different input pipeline.
- **Multiplayer races** — same-passage live races. Websockets, presence,
  anti-cheat; the per-passage leaderboard is the async version already.
- **i18n / Cyrillic corpora** — already deferred per plan §13.3.
