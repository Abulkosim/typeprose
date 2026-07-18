import { z } from 'zod';
import { charEventsSchema } from './charEvents.ts';

/**
 * One run's stats, as computed by the engine (plan §7.3).
 * Used both for the client-submitted stats and the server-recomputed ones.
 */
export const runStatsSchema = z.object({
  wpm: z.number().nonnegative(),
  rawWpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  durationMs: z.int().positive(),
});

export type RunStats = z.infer<typeof runStatsSchema>;

/**
 * Which kind of test a run was: a curated corpus passage ('prose', the default),
 * a generated random-word set ('words', the Monkeytype-style mode), a fixed
 * time window ('timed', §2.3), or user-pasted text ('custom'). A prose run keys
 * on a server passage id; every other mode carries its own text so the server
 * can recompute against it (there is no stored passage). A timed run
 * additionally carries its window `durationMs`, so the server measures WPM over
 * that same fixed window.
 */
export const resultModeSchema = z.enum(['prose', 'words', 'timed', 'custom']);

export type ResultMode = z.infer<typeof resultModeSchema>;

/**
 * The timed-mode windows offered (seconds), the Monkeytype-standard set. Fixed
 * here so the client presets and the server's accepted `durationMs` values are
 * one source of truth - the server rejects any other window (a shorter one
 * can't be forged to inflate WPM).
 */
export const TIMED_SECONDS = [15, 30, 60, 120] as const;

export type TimedSeconds = (typeof TIMED_SECONDS)[number];

/** The same windows in milliseconds (the wire unit, matching RunStats.durationMs). */
export const TIMED_DURATIONS_MS = TIMED_SECONDS.map((s) => s * 1000) as unknown as readonly [
  number,
  ...number[],
];

/**
 * Upper bound on a submitted word-mode text (chars). Comfortably covers the
 * largest preset (200 words) even with long words; a guard against abuse, since
 * word-mode text is client-supplied rather than a stored passage.
 */
export const MAX_WORD_TEXT_LEN = 4000;

/**
 * Upper bound on a timed-mode text (chars). Larger than the word cap: a timed
 * run pre-generates a buffer big enough that even a 350-wpm typist can't exhaust
 * the longest (120s) window, so the buffer runs well past what's actually typed.
 */
export const MAX_TIMED_TEXT_LEN = 8000;

/**
 * Upper bound on a custom-mode (user-pasted) text (chars). The 6000-event wire
 * cap already makes text much beyond ~5000 chars uncompletable (each char costs
 * at least one event), so a larger cap would only admit runs that can never
 * finish; 5000 leaves ~1000 events of correction slack on a maximal paste.
 */
export const MAX_CUSTOM_TEXT_LEN = 5000;

/** A prose run: recomputed server-side against the passage identified by id. */
const proseResultRequestSchema = z.object({
  mode: z.literal('prose'),
  profileId: z.uuid(),
  passageId: z.int().positive(),
  clientStats: runStatsSchema,
  charEvents: charEventsSchema,
});

/** A word run: recomputed server-side against the client-submitted text. */
const wordsResultRequestSchema = z.object({
  mode: z.literal('words'),
  profileId: z.uuid(),
  text: z.string().min(1).max(MAX_WORD_TEXT_LEN),
  clientStats: runStatsSchema,
  charEvents: charEventsSchema,
});

/**
 * A timed run (§2.3): like a word run (client-submitted generated text), plus
 * the fixed window `durationMs` the WPM is measured over. Constrained to the
 * supported windows so a client can't claim an arbitrary (shorter) window to
 * inflate its WPM.
 */
const timedResultRequestSchema = z.object({
  mode: z.literal('timed'),
  profileId: z.uuid(),
  text: z.string().min(1).max(MAX_TIMED_TEXT_LEN),
  durationMs: z
    .int()
    .refine(
      (v) => (TIMED_DURATIONS_MS as readonly number[]).includes(v),
      'durationMs must be one of the supported timed windows',
    ),
  clientStats: runStatsSchema,
  charEvents: charEventsSchema,
});

/**
 * A custom run (user-pasted text): the word-mode submission shape verbatim -
 * self-reported text the server recomputes against - just tagged with its own
 * mode so history/stats stay honest about what was typed. The text must already
 * be canonical (§6.2, the client normalizes on paste); the server's
 * `parsePassage` rejects anything else.
 */
const customResultRequestSchema = z.object({
  mode: z.literal('custom'),
  profileId: z.uuid(),
  text: z.string().min(1).max(MAX_CUSTOM_TEXT_LEN),
  clientStats: runStatsSchema,
  charEvents: charEventsSchema,
});

/** POST /results request body (plan §8), discriminated on `mode`. */
export const postResultsRequestSchema = z.discriminatedUnion('mode', [
  proseResultRequestSchema,
  wordsResultRequestSchema,
  timedResultRequestSchema,
  customResultRequestSchema,
]);

export type PostResultsRequest = z.infer<typeof postResultsRequestSchema>;

/**
 * Daily-passage streak state after a submission (Batch C §2.1). `extended` is
 * true only when this submission advanced the streak (a new UTC day); a
 * same-day retype reports the unchanged streak with `extended: false`.
 */
export const dailyStreakInfoSchema = z.object({
  current: z.int().nonnegative(),
  best: z.int().nonnegative(),
  extended: z.boolean(),
});

export type DailyStreakInfo = z.infer<typeof dailyStreakInfoSchema>;

/** POST /results response body (plan §8). */
export const postResultsResponseSchema = z.object({
  id: z.int().positive(),
  serverStats: runStatsSchema,
  clientMatch: z.boolean(),
  /** True when this run's wpm beats the profile's best across every prior run. */
  isNewBest: z.boolean(),
  /** The profile's best wpm before this run (any mode/passage), or null with no prior runs. */
  previousBestWpm: z.number().nonnegative().nullable(),
  /** True (prose only) when this run's wpm beats the profile's best on this same passage. */
  isNewPassageBest: z.boolean(),
  /** The profile's best wpm on this passage before this run, or null (word runs, or no prior attempt). */
  previousPassageBestWpm: z.number().nonnegative().nullable(),
  /**
   * Daily-streak update (Batch C §2.1), non-null only when this run's passage
   * was matched against today's daily pick server-side - the client cannot
   * fake a daily completion by claiming any passage id.
   */
  dailyStreak: dailyStreakInfoSchema.nullable(),
});

export type PostResultsResponse = z.infer<typeof postResultsResponseSchema>;
