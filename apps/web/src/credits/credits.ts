/**
 * The title-sequence card deck ("roll credits" - the app's about screen,
 * staged as opening film titles rather than a modal). Pure data + pacing
 * constants, DOM-free so the deck and its invariants are unit-testable.
 *
 * Card grammar: `title` types itself out character-by-character behind the
 * app's own caret; `body` fades in once the title lands. The one `final` card
 * ends the sequence - any advance from it leaves the theater.
 */
export interface CreditCard {
  /** The big typed-out line (lowercase, like the wordmark). */
  title: string;
  /** Subtitle-styled supporting line, revealed after the title completes. */
  body?: string;
  /** Marks the closing card; advancing from it closes the sequence. */
  final?: boolean;
}

/** Typewriter cadence for the title reveal (~a confident 260 wpm). */
export const CREDITS_MS_PER_CHAR = 45;

/** How long a fully revealed card holds before the cut to the next. */
export const CREDITS_HOLD_MS = 2600;

export const CREDIT_CARDS: readonly CreditCard[] = [
  {
    title: 'prosetype',
    body: 'a typing picture',
  },
  {
    title: 'starring',
    body: 'real literature — austen, dickens, melville, wells, and company. no word soup.',
  },
  {
    title: 'also featuring',
    body: 'a daily passage · word mode · drills tuned to your weakest keys',
  },
  {
    title: 'in every screening',
    body: 'wpm, accuracy, a hesitation heatmap — and a replay of every run',
  },
  {
    title: 'the leaderboard awaits',
    body: 'claim your name with an email. no password, ever.',
  },
  {
    title: 'with a score',
    body: 'lo-fi · classical · ambient — the ♪ in the corner starts it',
  },
  {
    title: 'esc runs the show',
    body: 'every command, one key away',
  },
  {
    title: 'tab · begin typing',
    final: true,
  },
];
