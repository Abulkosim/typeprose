import { aggregateKeyStats, computeHeatmap } from '@prosetype/engine';
import type { ProfileStats } from '@prosetype/schema';
import type { ProfileAggregates, StoredResultRow } from './repository.ts';

/** How many most-recent results the last-10 wpm average draws from (plan §8). */
export const AVG_WPM_WINDOW = 10;

function roundTo2(x: number): number {
  return Math.round(x * 100) / 100;
}

function mean(values: readonly number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * A run's effective typed text: the passage text for a prose run, the generated
 * word text for a word run. Both recompute paths (punctuation tax, per-key /
 * bigram) replay charEvents against this.
 */
function effectiveText(row: StoredResultRow): string | null {
  return row.passageText ?? row.wordText;
}

/** Word count of a canonical (single-spaced) text. */
function wordCountOf(text: string): number {
  return text.split(' ').length;
}

/**
 * Mean punctuation tax (§7.6) over the recent window. Each row's tax is
 * recomputed from its stored charEvents against its effective text; rows whose
 * run never sampled both punctuation and letters (tax null) are skipped, and a
 * row whose log fails to replay is skipped defensively (it passed recompute at
 * insert time, so this is belt-and-suspenders). Word runs are lowercase with no
 * punctuation, so their tax is null and they drop out naturally. Null when
 * nothing sampled.
 */
function punctuationTaxAvg(recent: readonly StoredResultRow[]): number | null {
  const samples: number[] = [];
  for (const row of recent) {
    const text = effectiveText(row);
    if (text === null) continue;
    try {
      const heatmap = computeHeatmap(text, row.charEvents);
      if (heatmap.punctuationTaxPct !== null) {
        samples.push(heatmap.punctuationTaxPct);
      }
    } catch {
      // Skip a row whose stored log cannot replay.
    }
  }
  return samples.length === 0 ? null : roundTo2(mean(samples));
}

/**
 * Assemble the GET /profiles/:id/stats DTO (plan §8) from all-time aggregates
 * plus the recent-results window. Kept free of DB access so it is unit-testable
 * with plain fixtures. All-time figures (totals, best, per-author, accuracy and
 * consistency averages) come from `aggregates`; the last-10 wpm average and the
 * punctuation-tax average are derived from `recent` (newest first).
 */
export function buildProfileStats(
  aggregates: ProfileAggregates,
  recent: readonly StoredResultRow[],
): ProfileStats {
  const last10Wpm = recent.slice(0, AVG_WPM_WINDOW).map((r) => r.wpm);

  // Per-key / per-bigram analysis is replayed from the same recent window's
  // stored logs against each run's effective text (aggregateKeyStats skips any
  // row that fails to replay). Word runs contribute clean letter/bigram data.
  const keyStats = aggregateKeyStats(
    recent
      .map((r) => ({ passageText: effectiveText(r), log: r.charEvents }))
      .filter((r): r is { passageText: string; log: typeof r.log } => r.passageText !== null),
  );

  return {
    totals: {
      tests: aggregates.tests,
      timeTypedMs: aggregates.timeTypedMs,
    },
    bestWpm:
      aggregates.best === null
        ? null
        : {
            wpm: roundTo2(aggregates.best.wpm),
            mode: aggregates.best.mode,
            passageId: aggregates.best.passageId,
            wordCount:
              aggregates.best.wordText === null ? null : wordCountOf(aggregates.best.wordText),
            workTitle: aggregates.best.workTitle,
            authorName: aggregates.best.authorName,
          },
    avgWpmLast10: last10Wpm.length === 0 ? null : roundTo2(mean(last10Wpm)),
    avgAccuracy: aggregates.avgAccuracy === null ? null : roundTo2(aggregates.avgAccuracy),
    avgConsistency: aggregates.avgConsistency === null ? null : roundTo2(aggregates.avgConsistency),
    punctuationTaxAvgPct: punctuationTaxAvg(recent),
    perAuthor: aggregates.perAuthor.map((a) => ({
      authorSlug: a.authorSlug,
      authorName: a.authorName,
      tests: a.tests,
      avgWpm: roundTo2(a.avgWpm),
    })),
    history: recent.map((r) => ({
      id: r.id,
      mode: r.mode,
      passageId: r.passageId,
      wordCount: r.wordText === null ? null : wordCountOf(r.wordText),
      wpm: r.wpm,
      rawWpm: r.rawWpm,
      accuracy: r.accuracy,
      consistency: r.consistency,
      durationMs: r.durationMs,
      clientMatch: r.clientMatch,
      createdAt: r.createdAt.toISOString(),
      band: r.band,
      workTitle: r.workTitle,
      authorName: r.authorName,
      authorSlug: r.authorSlug,
    })),
    keyStats: keyStats.keys,
    bigramStats: keyStats.bigrams,
  };
}
