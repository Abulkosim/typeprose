import type { CharEvents } from '@typeprose/schema';
import { parsePassage } from './passage.ts';
import { replayEvents } from './replay.ts';

/** Per-character heatmap datum (plan §7.6). */
export interface CharHeat {
  /**
   * First-attempt inter-key interval in ms: time from the previous keypress to
   * the first keypress that targeted this character. Null for the run's first
   * character and for characters never typed (missed via early space).
   */
  interKeyMs: number | null;
  /** How many incorrect keypresses touched this index (wrong chars, extras
   * and over-cap presses at the word's space index, early space commits). */
  errorTouches: number;
  /**
   * Normalized latency for rendering: `log1p(min(interKeyMs, p95)) / log1p(p95)`
   * where p95 is the run's 95th-percentile latency, so 0..1 with outliers
   * clamped (plan §7.6). Null when interKeyMs is null.
   */
  heat: number | null;
}

export interface SlowWord {
  wordIndex: number;
  word: string;
  /** Sum of the word's own characters' first-attempt latencies, ms. */
  ms: number;
}

export interface HeatmapData {
  /** One entry per passage character (spaces included). */
  perChar: CharHeat[];
  /** Up to three slowest words, slowest first. */
  slowestWords: SlowWord[];
  /**
   * Punctuation tax: mean latency on punctuation chars vs letter/digit chars,
   * as a percentage over (e.g. 38.4 means punctuation is +38.4% slower).
   * Null when the run has no sampled punctuation or letter latencies.
   */
  punctuationTaxPct: number | null;
}

/** The §6.2 punctuation set. */
const PUNCTUATION = new Set([...'.,;:!?\'"-()']);

function percentile95(sortedAsc: readonly number[]): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(0.95 * sortedAsc.length) - 1));
  return sortedAsc[idx] ?? 0;
}

/**
 * Hesitation heatmap + reader stats (plan §7.6), replayed from the log alone.
 *
 * @throws InvalidPassageError | MalformedLogError
 */
export function computeHeatmap(passageText: string, log: CharEvents): HeatmapData {
  const passage = parsePassage(passageText);
  const latency = new Array<number | null>(passage.length).fill(null);
  const errorTouches = new Array<number>(passage.length).fill(0);
  const attempted = new Array<boolean>(passage.length).fill(false);
  let prevKeyT: number | null = null;

  replayEvents(passage, log, (event, result) => {
    if (
      result.kind === 'delete-slot' ||
      result.kind === 'delete-extra' ||
      result.kind === 'uncommit'
    ) {
      return; // backspaces are not keypresses and do not advance the chain
    }
    const [t, i] = event;
    // Latency is attributed on the first attempt at a target index (slot chars
    // and the space itself); extras/over-cap presses have no target char.
    if ((result.kind === 'add-slot' || result.kind === 'commit') && attempted[i] !== true) {
      attempted[i] = true;
      if (prevKeyT !== null) latency[i] = t - prevKeyT;
    }
    if (result.correct === false) errorTouches[i] = (errorTouches[i] ?? 0) + 1;
    prevKeyT = t; // every keypress (extras and over-cap included) advances the chain
  });

  const samples = latency.filter((l): l is number => l !== null).sort((a, b) => a - b);
  const p95 = percentile95(samples);
  const perChar: CharHeat[] = latency.map((l, i) => ({
    interKeyMs: l,
    errorTouches: errorTouches[i] ?? 0,
    heat: l === null ? null : p95 > 0 ? Math.log1p(Math.min(l, p95)) / Math.log1p(p95) : 0,
  }));

  const slowestWords: SlowWord[] = passage.words
    .map((w, wordIndex) => {
      let ms = 0;
      let sampled = false;
      for (let i = w.start; i < w.end; i += 1) {
        const l = latency[i];
        if (l !== null && l !== undefined) {
          ms += l;
          sampled = true;
        }
      }
      return { wordIndex, word: w.text, ms, sampled };
    })
    .filter((w) => w.sampled)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 3)
    .map(({ wordIndex, word, ms }) => ({ wordIndex, word, ms }));

  let punctSum = 0;
  let punctCount = 0;
  let letterSum = 0;
  let letterCount = 0;
  for (let i = 0; i < passage.length; i += 1) {
    const l = latency[i];
    if (l === null || l === undefined) continue;
    const ch = passage.text[i] as string;
    if (ch === ' ') continue;
    if (PUNCTUATION.has(ch)) {
      punctSum += l;
      punctCount += 1;
    } else {
      letterSum += l;
      letterCount += 1;
    }
  }
  const punctuationTaxPct =
    punctCount > 0 && letterCount > 0 && letterSum > 0
      ? Math.round(((punctSum / punctCount / (letterSum / letterCount)) * 100 - 100) * 100) / 100
      : null;

  return { perChar, slowestWords, punctuationTaxPct };
}
