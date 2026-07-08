import { z } from 'zod';
import { bandSchema } from './passages.ts';

/**
 * One row of the profile's recent-history list (plan §8, "last 50 results").
 * Carries enough attribution to render a history row without extra requests:
 * the work title, author name/slug, and band alongside the stored stats.
 */
export const resultSummarySchema = z.object({
  id: z.int().positive(),
  passageId: z.int().positive(),
  wpm: z.number().nonnegative(),
  rawWpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  durationMs: z.int().positive(),
  /** Whether the server recompute agreed with the client (plan §8). */
  clientMatch: z.boolean(),
  /** ISO 8601 timestamp of when the result was stored. */
  createdAt: z.string().min(1),
  band: bandSchema,
  workTitle: z.string().min(1),
  authorName: z.string().min(1),
  authorSlug: z.string().min(1),
});

export type ResultSummary = z.infer<typeof resultSummarySchema>;

/** Best single run for the profile, with a reference to the passage typed. */
export const bestRunSchema = z.object({
  wpm: z.number().nonnegative(),
  passageId: z.int().positive(),
  workTitle: z.string().min(1),
  authorName: z.string().min(1),
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
});

export type ProfileStats = z.infer<typeof profileStatsSchema>;
