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

/** POST /results request body (plan §8). */
export const postResultsRequestSchema = z.object({
  profileId: z.uuid(),
  passageId: z.int().positive(),
  clientStats: runStatsSchema,
  charEvents: charEventsSchema,
});

export type PostResultsRequest = z.infer<typeof postResultsRequestSchema>;

/** POST /results response body (plan §8). */
export const postResultsResponseSchema = z.object({
  id: z.int().positive(),
  serverStats: runStatsSchema,
  clientMatch: z.boolean(),
});

export type PostResultsResponse = z.infer<typeof postResultsResponseSchema>;
