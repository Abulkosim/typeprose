import type { CharEvents } from '@prosetype/schema';
import { parsePassage } from './passage.ts';
import { replayEvents } from './replay.ts';

/**
 * Aggregate per-key / per-bigram error and hesitation stats across many runs
 * (deeper stats, backlog §4). Built by replaying each run's stored charEvents
 * against its passage text and grouping first-attempt latency + error touches
 * by the *expected character* (and the preceding character, for bigrams), rather
 * than by passage index as {@link computeHeatmap} does.
 */

/** One expected character's aggregate typing behaviour across the window. */
export interface KeyStat {
  /** The expected character (letters, digits, punctuation; spaces excluded). */
  key: string;
  /** First-attempt slots holding this character. */
  occurrences: number;
  /** Incorrect keypresses that touched those slots. */
  errors: number;
  /** `100 * errors / occurrences`, rounded to one decimal. */
  errorRate: number;
  /** Mean first-attempt inter-key latency (ms), or null when never sampled. */
  avgLatencyMs: number | null;
}

/** One ordered character pair's aggregate (transition into the second char). */
export interface BigramStat {
  /** The two expected characters, e.g. "th"; neither is a space. */
  bigram: string;
  occurrences: number;
  errors: number;
  errorRate: number;
  avgLatencyMs: number | null;
}

export interface KeyStatsData {
  /** Worst first: descending errorRate, then descending avgLatencyMs. */
  keys: KeyStat[];
  bigrams: BigramStat[];
}

/** One run to fold into the aggregate: its passage text and stored log. */
export interface KeyStatsRun {
  passageText: string;
  log: CharEvents;
}

/**
 * Below this many occurrences a key/bigram is dropped from the ranked output,
 * so a single stray press can't top the "worst" list.
 */
export const MIN_OCCURRENCES = 5;

interface Bucket {
  occurrences: number;
  errors: number;
  latencySum: number;
  latencyCount: number;
}

function bucketFor(map: Map<string, Bucket>, key: string): Bucket {
  let b = map.get(key);
  if (b === undefined) {
    b = { occurrences: 0, errors: 0, latencySum: 0, latencyCount: 0 };
    map.set(key, b);
  }
  return b;
}

/**
 * Replay one run and fold its first-attempt latencies + error touches into the
 * key and bigram buckets. Mirrors the per-index accounting in
 * {@link computeHeatmap}: backspaces don't advance the chain, latency is
 * attributed on the first attempt at a target slot (or a committed space), and
 * every keypress advances the previous-keypress clock.
 *
 * @throws InvalidPassageError | MalformedLogError
 */
function foldRun(run: KeyStatsRun, keys: Map<string, Bucket>, bigrams: Map<string, Bucket>): void {
  const passage = parsePassage(run.passageText);
  const latency = new Array<number | null>(passage.length).fill(null);
  const errorTouches = new Array<number>(passage.length).fill(0);
  const attempted = new Array<boolean>(passage.length).fill(false);
  let prevKeyT: number | null = null;

  replayEvents(passage, run.log, (event, result) => {
    if (
      result.kind === 'delete-slot' ||
      result.kind === 'delete-extra' ||
      result.kind === 'uncommit'
    ) {
      return; // backspaces are not keypresses and do not advance the chain
    }
    const [t, i] = event;
    if ((result.kind === 'add-slot' || result.kind === 'commit') && attempted[i] !== true) {
      attempted[i] = true;
      if (prevKeyT !== null) latency[i] = t - prevKeyT;
    }
    if (result.correct === false) errorTouches[i] = (errorTouches[i] ?? 0) + 1;
    prevKeyT = t;
  });

  const text = passage.text;
  for (let i = 0; i < passage.length; i += 1) {
    if (attempted[i] !== true) continue;
    const ch = text[i] as string;
    if (ch === ' ') continue;

    const key = bucketFor(keys, ch);
    key.occurrences += 1;
    key.errors += errorTouches[i] ?? 0;
    const l = latency[i];
    if (l !== null && l !== undefined) {
      key.latencySum += l;
      key.latencyCount += 1;
    }

    // Bigram: the transition into this char from the previous typed char, when
    // both are non-space and the predecessor was itself attempted.
    const prevCh = i > 0 ? (text[i - 1] as string) : undefined;
    if (prevCh !== undefined && prevCh !== ' ' && attempted[i - 1] === true) {
      const bg = bucketFor(bigrams, `${prevCh}${ch}`);
      bg.occurrences += 1;
      bg.errors += errorTouches[i] ?? 0;
      if (l !== null && l !== undefined) {
        bg.latencySum += l;
        bg.latencyCount += 1;
      }
    }
  }
}

function finalize<T extends { occurrences: number; errors: number; errorRate: number; avgLatencyMs: number | null }>(
  map: Map<string, Bucket>,
  make: (label: string, b: Bucket) => T,
): T[] {
  const out: T[] = [];
  for (const [label, b] of map) {
    if (b.occurrences < MIN_OCCURRENCES) continue;
    out.push(make(label, b));
  }
  out.sort((a, z) => {
    if (z.errorRate !== a.errorRate) return z.errorRate - a.errorRate;
    return (z.avgLatencyMs ?? -1) - (a.avgLatencyMs ?? -1);
  });
  return out;
}

function rate(b: Bucket): number {
  return Math.round((1000 * b.errors) / b.occurrences) / 10;
}

function avgLatency(b: Bucket): number | null {
  return b.latencyCount === 0 ? null : Math.round(b.latencySum / b.latencyCount);
}

/**
 * Fold a window of runs into ranked per-key and per-bigram stats. Runs whose
 * stored log fails to replay are skipped defensively (they passed recompute at
 * insert time); keys/bigrams below {@link MIN_OCCURRENCES} are dropped.
 */
export function aggregateKeyStats(runs: readonly KeyStatsRun[]): KeyStatsData {
  const keys = new Map<string, Bucket>();
  const bigrams = new Map<string, Bucket>();
  for (const run of runs) {
    try {
      foldRun(run, keys, bigrams);
    } catch {
      // Skip a row whose stored log cannot replay.
    }
  }
  return {
    keys: finalize(keys, (key, b) => ({
      key,
      occurrences: b.occurrences,
      errors: b.errors,
      errorRate: rate(b),
      avgLatencyMs: avgLatency(b),
    })),
    bigrams: finalize(bigrams, (bigram, b) => ({
      bigram,
      occurrences: b.occurrences,
      errors: b.errors,
      errorRate: rate(b),
      avgLatencyMs: avgLatency(b),
    })),
  };
}
