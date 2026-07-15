import type { CharEvents } from '@typeprose/schema';
import { describe, expect, it } from 'vitest';
import type { ProfileAggregates, StoredResultRow } from '../src/results/repository.ts';
import { buildProfileStats } from '../src/results/stats.ts';

const EMPTY_AGGREGATES: ProfileAggregates = {
  tests: 0,
  timeTypedMs: 0,
  avgAccuracy: null,
  avgConsistency: null,
  best: null,
  perAuthor: [],
};

/** These fixtures aren't exercising the daily streak, so pass a fixed zero state. */
const NO_STREAK = { current: 0, best: 0, completedToday: false };

/** A clean 'aa bb' run: two 'a' slots and two 'b' slots, no errors. */
const cleanAABB: CharEvents = {
  v: 1,
  events: [
    [0, 0, 0],
    [100, 1, 0],
    [200, 2, 4],
    [300, 3, 0],
    [400, 4, 0],
  ],
};

function row(overrides: Partial<StoredResultRow> = {}): StoredResultRow {
  return {
    id: 1,
    mode: 'prose',
    passageId: 1,
    wpm: 60,
    rawWpm: 62,
    accuracy: 98,
    consistency: 90,
    durationMs: 5000,
    clientMatch: true,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    band: 'standard',
    workTitle: 'Test Work',
    authorName: 'Test Author',
    authorSlug: 'test-author',
    passageText: 'aa bb',
    wordText: null,
    charEvents: cleanAABB,
    ...overrides,
  };
}

/** A word-mode row: no passage attribution; its text lives in wordText. */
function wordRow(overrides: Partial<StoredResultRow> = {}): StoredResultRow {
  return row({
    mode: 'words',
    passageId: null,
    band: null,
    workTitle: null,
    authorName: null,
    authorSlug: null,
    passageText: null,
    wordText: 'aa bb',
    ...overrides,
  });
}

describe('buildProfileStats - deeper stats fields', () => {
  it('populates keyStats / bigramStats from the recent window logs', () => {
    // 5 identical clean 'aa bb' rows → each letter reaches 10 occurrences.
    const recent = Array.from({ length: 5 }, (_, i) => row({ id: i + 1 }));
    const stats = buildProfileStats(EMPTY_AGGREGATES, recent, NO_STREAK);

    const a = stats.keyStats.find((k) => k.key === 'a');
    expect(a).toMatchObject({ key: 'a', occurrences: 10, errors: 0, errorRate: 0 });
    expect(stats.keyStats.some((k) => k.key === ' ')).toBe(false);
    expect(stats.bigramStats.map((b) => b.bigram).sort()).toEqual(['aa', 'bb']);
  });

  it('returns empty arrays for a profile with no results', () => {
    const stats = buildProfileStats(EMPTY_AGGREGATES, [], NO_STREAK);
    expect(stats.keyStats).toEqual([]);
    expect(stats.bigramStats).toEqual([]);
  });

  it('folds word-mode runs into keyStats and surfaces them in history', () => {
    // Word runs replay against wordText, so they feed per-key/bigram just like
    // prose. 5 word rows → each letter reaches 10 occurrences.
    const recent = Array.from({ length: 5 }, (_, i) => wordRow({ id: i + 1 }));
    const stats = buildProfileStats(EMPTY_AGGREGATES, recent, NO_STREAK);

    expect(stats.keyStats.find((k) => k.key === 'a')).toMatchObject({ occurrences: 10 });
    const first = stats.history[0];
    expect(first?.mode).toBe('words');
    expect(first?.wordCount).toBe(2);
    expect(first?.passageId).toBeNull();
    expect(first?.workTitle).toBeNull();
  });

  it('carries a word-mode best run through as mode-aware, no attribution', () => {
    const stats = buildProfileStats(
      {
        ...EMPTY_AGGREGATES,
        tests: 1,
        best: {
          wpm: 88,
          mode: 'words',
          passageId: null,
          workTitle: null,
          authorName: null,
          wordText: 'aa bb cc',
        },
      },
      [wordRow()],
      NO_STREAK,
    );
    expect(stats.bestWpm).toMatchObject({ wpm: 88, mode: 'words', wordCount: 3, passageId: null });
  });
});
