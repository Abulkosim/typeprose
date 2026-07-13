import { z } from 'zod';
import { bandSchema } from './passages.ts';
import { resultModeSchema } from './results.ts';

/**
 * One row of the profile's recent-history list (plan §8, "last 50 results").
 * Carries enough attribution to render a history row without extra requests.
 * Attribution (`passageId`, `band`, `workTitle`, `authorName`, `authorSlug`) is
 * null for a word-mode run - it has no passage - where `wordCount` is set
 * instead so the client can render "words · N". `mode` says which shape to read.
 */
export const resultSummarySchema = z.object({
  id: z.int().positive(),
  mode: resultModeSchema,
  passageId: z.int().positive().nullable(),
  /** Number of words typed, for a word-mode run; null for prose. */
  wordCount: z.int().positive().nullable(),
  wpm: z.number().nonnegative(),
  rawWpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  durationMs: z.int().positive(),
  /** Whether the server recompute agreed with the client (plan §8). */
  clientMatch: z.boolean(),
  /** ISO 8601 timestamp of when the result was stored. */
  createdAt: z.string().min(1),
  band: bandSchema.nullable(),
  workTitle: z.string().min(1).nullable(),
  authorName: z.string().min(1).nullable(),
  authorSlug: z.string().min(1).nullable(),
});

export type ResultSummary = z.infer<typeof resultSummarySchema>;

/**
 * Best single run for the profile. Attribution (`passageId`/`workTitle`/
 * `authorName`) is null when the best run was a word-mode run, where
 * `wordCount` is set instead. `mode` says which shape to read.
 */
export const bestRunSchema = z.object({
  wpm: z.number().nonnegative(),
  mode: resultModeSchema,
  passageId: z.int().positive().nullable(),
  wordCount: z.int().positive().nullable(),
  workTitle: z.string().min(1).nullable(),
  authorName: z.string().min(1).nullable(),
});

export type BestRun = z.infer<typeof bestRunSchema>;

/**
 * One row of the per-author aggregate table (plan §8): the
 * "you type Hemingway 11 wpm faster than Dostoevsky" stat.
 */
export const authorAggregateSchema = z.object({
  authorSlug: z.string().min(1),
  authorName: z.string().min(1),
  tests: z.int().positive(),
  avgWpm: z.number().nonnegative(),
});

export type AuthorAggregate = z.infer<typeof authorAggregateSchema>;

/**
 * One expected character's aggregate typing behaviour over the recent window
 * (deeper stats): how often it was typed, how error-prone it is, and how long
 * it takes on average. `avgLatencyMs` is null when the char was never sampled
 * for latency (e.g. only ever the run's first keystroke).
 */
export const keyStatSchema = z.object({
  key: z.string().min(1),
  occurrences: z.int().positive(),
  errors: z.int().nonnegative(),
  errorRate: z.number().nonnegative(),
  avgLatencyMs: z.number().nonnegative().nullable(),
});

export type KeyStat = z.infer<typeof keyStatSchema>;

/** Same shape as {@link keyStatSchema}, keyed by an ordered character pair. */
export const bigramStatSchema = z.object({
  bigram: z.string().min(2),
  occurrences: z.int().positive(),
  errors: z.int().nonnegative(),
  errorRate: z.number().nonnegative(),
  avgLatencyMs: z.number().nonnegative().nullable(),
});

export type BigramStat = z.infer<typeof bigramStatSchema>;

/**
 * A profile's daily-passage streak, as it reads "right now" (Batch C §2.1):
 * lazily reset (no write) rather than the raw stored columns, so a lapsed
 * streak shows 0 without needing a completion to clear it.
 */
export const dailyStreakStatsSchema = z.object({
  current: z.int().nonnegative(),
  best: z.int().nonnegative(),
  /** Whether today's daily has already been completed. */
  completedToday: z.boolean(),
});

export type DailyStreakStats = z.infer<typeof dailyStreakStatsSchema>;

/**
 * GET /profiles/:id/stats response (plan §8). Every aggregate is nullable so a
 * brand-new profile with zero results renders cleanly (nulls, empty arrays).
 */
export const profileStatsSchema = z.object({
  totals: z.object({
    tests: z.int().nonnegative(),
    /** Sum of duration_ms across all of the profile's results. */
    timeTypedMs: z.int().nonnegative(),
  }),
  /** Best wpm run + passage ref, or null with no results. */
  bestWpm: bestRunSchema.nullable(),
  /** Average wpm over the most recent 10 results, or null with none. */
  avgWpmLast10: z.number().nonnegative().nullable(),
  avgAccuracy: z.number().min(0).max(100).nullable(),
  avgConsistency: z.number().min(0).max(100).nullable(),
  /** Mean punctuation tax (§7.6) over the recent window, or null when unsampled. */
  punctuationTaxAvgPct: z.number().nullable(),
  perAuthor: z.array(authorAggregateSchema),
  /** Most recent results, newest first (capped at 50, plan §8). */
  history: z.array(resultSummarySchema),
  /** Worst problem keys over the recent window, worst first (deeper stats). */
  keyStats: z.array(keyStatSchema),
  /** Worst problem bigrams over the recent window, worst first. */
  bigramStats: z.array(bigramStatSchema),
  /** Daily-passage streak (Batch C §2.1); zeros for a profile that never has. */
  dailyStreak: dailyStreakStatsSchema,
});

export type ProfileStats = z.infer<typeof profileStatsSchema>;
