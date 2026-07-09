import type { Band, CharEvents } from '@prosetype/schema';

/** A result to persist, server-computed stats plus the raw log (plan §4, §8). */
export interface NewResult {
  profileId: string;
  passageId: number;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  durationMs: number;
  charEvents: CharEvents;
  clientMatch: boolean;
}

/**
 * A stored result joined with its passage's attribution and text, for the
 * history list, the last-10 average, and the per-result punctuation-tax
 * recompute (which needs the passage text + charEvents).
 */
export interface StoredResultRow {
  id: number;
  passageId: number;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  durationMs: number;
  clientMatch: boolean;
  createdAt: Date;
  band: Band;
  workTitle: string;
  authorName: string;
  authorSlug: string;
  passageText: string;
  charEvents: CharEvents;
}

/** One per-author aggregate row (plan §8 per-author table). */
export interface AuthorAggregateRow {
  authorSlug: string;
  authorName: string;
  tests: number;
  avgWpm: number;
}

/** One leaderboard row: a single profile's best run (global or per passage). */
export interface LeaderboardRow {
  wpm: number;
  accuracy: number;
  consistency: number;
  displayName: string | null;
  passageId: number;
  band: Band;
  workTitle: string;
  authorName: string;
  createdAt: Date;
}

/** All-time aggregates for a profile (spanning every result, not just recent). */
export interface ProfileAggregates {
  tests: number;
  timeTypedMs: number;
  avgAccuracy: number | null;
  avgConsistency: number | null;
  best: { wpm: number; passageId: number; workTitle: string; authorName: string } | null;
  perAuthor: AuthorAggregateRow[];
}

/**
 * Data access for results (plan §4, §8), behind an interface so route tests
 * can substitute an in-memory stub.
 */
export interface ResultRepository {
  /** Persist a result; returns its generated id. */
  insert(row: NewResult): Promise<number>;
  /** All-time aggregates for the profile's stats page. */
  aggregatesForProfile(profileId: string): Promise<ProfileAggregates>;
  /** The most recent results, newest first, capped at `limit`. */
  recentForProfile(profileId: string, limit: number): Promise<StoredResultRow[]>;
  /**
   * Leaderboard: each profile's single best run by wpm, highest first, capped
   * at `limit`. Scoped to one passage when `passageId` is given, else global.
   */
  topResults(opts: { passageId?: number | undefined; limit: number }): Promise<LeaderboardRow[]>;
}
