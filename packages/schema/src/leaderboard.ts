import { z } from 'zod';
import { bandSchema } from './passages.ts';

/**
 * Leaderboard DTOs (Phase 3, plan §10.3). One entry per profile's best run -
 * either globally or scoped to a single passage. `displayName` is null for an
 * unclaimed anonymous profile (the client renders it as "anonymous").
 */
export const leaderboardEntrySchema = z.object({
  rank: z.int().positive(),
  wpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  displayName: z.string().nullable(),
  passageId: z.int().positive(),
  band: bandSchema,
  workTitle: z.string(),
  authorName: z.string(),
  createdAt: z.string(),
});

export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardSchema = z.object({
  /** The passage the board is scoped to, or null for the global board. */
  passageId: z.int().positive().nullable(),
  entries: z.array(leaderboardEntrySchema),
});

export type Leaderboard = z.infer<typeof leaderboardSchema>;
