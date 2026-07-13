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
 * Which kind of test a run was: a curated corpus passage ('prose', the default)
 * or a generated random-word set ('words', the Monkeytype-style mode). A prose
 * run keys on a server passage id; a word run carries its generated text so the
 * server can recompute against it (there is no stored passage).
 */
export const resultModeSchema = z.enum(['prose', 'words']);

export type ResultMode = z.infer<typeof resultModeSchema>;

/**
 * Upper bound on a submitted word-mode text (chars). Comfortably covers the
 * largest preset (200 words) even with long words; a guard against abuse, since
 * word-mode text is client-supplied rather than a stored passage.
 */
export const MAX_WORD_TEXT_LEN = 4000;

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

/** POST /results request body (plan §8), discriminated on `mode`. */
export const postResultsRequestSchema = z.discriminatedUnion('mode', [
  proseResultRequestSchema,
  wordsResultRequestSchema,
]);

export type PostResultsRequest = z.infer<typeof postResultsRequestSchema>;

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
});

export type PostResultsResponse = z.infer<typeof postResultsResponseSchema>;
