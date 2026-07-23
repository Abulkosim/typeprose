import type { AuthorListItem, Passage, PassageSummaryItem, ThemeListItem } from '@typeprose/schema';

import {
  fetchAuthors,
  fetchDailyPassage,
  fetchNextPassage,
  fetchPassageById,
  fetchPassageSync,
  fetchPassages,
  fetchThemes,
  type PassageQuery,
} from './api';
import { deriveAuthors, deriveThemes, selectRandom, summariesByIds, toSummaries } from './corpus';
import { readCorpus, writeCorpus } from './corpusStore';

/**
 * Offline-aware facade over the passage API (plan: PWA/offline). Every getter
 * is network-first - online behavior is byte-identical to calling the api.ts
 * fetcher directly, and the server stays the source of truth - falling back
 * to the locally synced corpus only when the fetch rejects. When the local
 * corpus can't answer either, the original error is rethrown so callers'
 * error states behave exactly as before.
 */

/** UTC calendar date key, the client twin of the API's utcDateKey. */
export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** GET /passages/next with an offline fallback pick over the synced corpus. */
export async function getNextPassage(
  excludeIds: readonly number[],
  query: PassageQuery = {},
): Promise<Passage> {
  try {
    return await fetchNextPassage(excludeIds, query);
  } catch (err) {
    const corpus = readCorpus();
    const local = corpus === null ? null : selectRandom(corpus.passages, query, excludeIds);
    if (local === null) throw err;
    return local;
  }
}

/**
 * GET /passages/daily with an offline fallback - only when the stored corpus
 * was synced on the same UTC day, so the offline daily is always the exact
 * server pick (a wrong "daily" would corrupt streaks once the run syncs).
 */
export async function getDailyPassage(): Promise<Passage> {
  try {
    return await fetchDailyPassage();
  } catch (err) {
    const corpus = readCorpus();
    if (corpus !== null && corpus.dailyDateKey === utcDateKey(new Date())) {
      const daily = corpus.passages.find((p) => p.id === corpus.dailyPassageId);
      if (daily !== undefined) return daily;
    }
    throw err;
  }
}

/** GET /passages/:id with an offline fallback lookup in the synced corpus. */
export async function getPassageById(id: number): Promise<Passage> {
  try {
    return await fetchPassageById(id);
  } catch (err) {
    const local = readCorpus()?.passages.find((p) => p.id === id);
    if (local === undefined) throw err;
    return local;
  }
}

/** GET /authors with an offline fallback derived from the synced corpus. */
export async function getAuthors(): Promise<AuthorListItem[]> {
  try {
    return await fetchAuthors();
  } catch (err) {
    const corpus = readCorpus();
    if (corpus === null || corpus.passages.length === 0) throw err;
    return deriveAuthors(corpus.passages);
  }
}

/** GET /themes with an offline fallback derived from the synced corpus. */
export async function getThemes(): Promise<ThemeListItem[]> {
  try {
    return await fetchThemes();
  } catch (err) {
    const corpus = readCorpus();
    if (corpus === null || corpus.passages.length === 0) throw err;
    return deriveThemes(corpus.passages);
  }
}

/** GET /passages (summaries) with an offline fallback over the synced corpus. */
export async function getPassageSummaries(
  query: PassageQuery = {},
): Promise<PassageSummaryItem[]> {
  try {
    return await fetchPassages(query);
  } catch (err) {
    const corpus = readCorpus();
    if (corpus === null || corpus.passages.length === 0) throw err;
    return toSummaries(corpus.passages, query);
  }
}

/** Favorite summaries from the synced corpus, for the offline favorites list. */
export function localSummariesByIds(ids: readonly number[]): PassageSummaryItem[] {
  const corpus = readCorpus();
  return corpus === null ? [] : summariesByIds(corpus.passages, ids);
}

/** Re-sync at most once an hour - the corpus is curated and slow-moving. */
const SYNC_INTERVAL_MS = 60 * 60 * 1000;

let syncInFlight = false;

/**
 * Refresh the local corpus from GET /passages/sync, throttled via the stored
 * `syncedAt` (server time; clock skew only shifts the throttle, never
 * correctness). Fire-and-forget: failures keep whatever the store already had.
 */
export async function syncCorpus(): Promise<void> {
  if (syncInFlight) return;
  const existing = readCorpus();
  if (existing !== null && Date.now() - Date.parse(existing.syncedAt) < SYNC_INTERVAL_MS) return;
  syncInFlight = true;
  try {
    writeCorpus(await fetchPassageSync());
  } catch {
    // Offline or the API is down; the next trigger retries.
  } finally {
    syncInFlight = false;
  }
}

/** App-start hook (main.tsx): sync now and again whenever connectivity returns. */
export function initCorpusSync(): void {
  void syncCorpus();
  window.addEventListener('online', () => void syncCorpus());
}
