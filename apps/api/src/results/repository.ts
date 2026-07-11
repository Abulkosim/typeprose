import type { Band, CharEvents, ResultMode } from '@prosetype/schema';

/**
 * A result to persist — server-computed stats plus the raw log (plan §4, §8).
 * A prose run sets `passageId` (and `wordText` is null); a word run sets
 * `wordText` (and `passageId` is null). The DB CHECK enforces this shape.
 */
export interface NewResult {
  profileId: string;
  mode: ResultMode;
  passageId: number | null;
  wordText: string | null;
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
 * history list, the last-10 average, and the per-result recomputes (punctuation
 * tax + per-key/bigram stats, which need the typed text + charEvents). For a
 * word-mode run the passage attribution is null and the text lives in
 * `wordText`; use `passageText ?? wordText` as the run's effective text.
 */
export interface StoredResultRow {
  id: number;
  mode: ResultMode;
  passageId: number | null;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  durationMs: number;
  clientMatch: boolean;
  createdAt: Date;
  band: Band | null;
  workTitle: string | null;
  authorName: string | null;
  authorSlug: string | null;
  passageText: string | null;
  wordText: string | null;
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

/**
 * All-time aggregates for a profile (spanning every result, not just recent).
 * `best` is the top-wpm run across all modes; its passage attribution is null
 * for a word-mode best, where `wordText` carries the typed text instead.
 */
export interface ProfileAggregates {
  tests: number;
  timeTypedMs: number;
  avgAccuracy: number | null;
  avgConsistency: number | null;
  best: {
    wpm: number;
    mode: ResultMode;
    passageId: number | null;
    workTitle: string | null;
    authorName: string | null;
    wordText: string | null;
  } | null;
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
