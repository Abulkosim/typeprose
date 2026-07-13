/**
 * Weak-key drill (Batch C §2.2): a client-side filter over `COMMON_WORDS`
 * biased toward the keys and bigrams a profile's stats show as error-prone.
 * Pure and DOM-free so it's unit-testable without a store or fetch; submits
 * through the existing words path (§9.5) - no API/schema/engine changes, no
 * new mode field.
 */

import type { BigramStat, KeyStat } from '@prosetype/schema';

import { COMMON_WORDS, sampleWords, type Rng } from './words';

/** How many worst keys/bigrams to target - keeps the pool filter tight, not exhaustive. */
const MAX_WEAK_KEYS = 5;
const MAX_WEAK_BIGRAMS = 5;

/**
 * Below this many matching words, the filtered pool is too thin to type a
 * varied set from (also covers empty targets / a brand-new profile with no
 * stats yet), so `selectDrillPool` falls back to the full word list.
 */
export const MIN_DRILL_POOL = 20;

/** Single lowercase letters and letter-pairs worth drilling, worst first. */
export interface WeakTargets {
  keys: readonly string[];
  bigrams: readonly string[];
}

/** Keep the first (worst) occurrence of each item, up to `limit`. */
function dedupeWorst(items: readonly string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Extract the worst letter keys/bigrams from a profile's stats. Prose stats
 * can contain capitals, punctuation, and the space char (they cover whatever
 * the passage's text does) - those match zero list words, so they're filtered
 * out here rather than left to fail silently in `selectDrillPool`. `keyStats`
 * and `bigramStats` arrive worst-first (server-side, per plan §8), so taking
 * the first few after dedup keeps the true worst-N.
 */
export function extractWeakTargets(stats: {
  keyStats: readonly KeyStat[];
  bigramStats: readonly BigramStat[];
}): WeakTargets {
  const keys = dedupeWorst(
    stats.keyStats.map((k) => k.key.toLowerCase()).filter((k) => /^[a-z]$/.test(k)),
    MAX_WEAK_KEYS,
  );
  const bigrams = dedupeWorst(
    stats.bigramStats.map((b) => b.bigram.toLowerCase()).filter((b) => /^[a-z]{2}$/.test(b)),
    MAX_WEAK_BIGRAMS,
  );
  return { keys, bigrams };
}

/**
 * Words from `words` that contain at least one weak bigram (substring) or
 * weak key (char). Falls back to the unfiltered list when fewer than
 * `MIN_DRILL_POOL` words match, so a thin or empty target set still yields a
 * varied word run instead of a tiny, repetitive one.
 */
export function selectDrillPool(
  targets: WeakTargets,
  words: readonly string[] = COMMON_WORDS,
): readonly string[] {
  const matches = words.filter(
    (word) =>
      targets.keys.some((key) => word.includes(key)) ||
      targets.bigrams.some((bigram) => word.includes(bigram)),
  );
  return matches.length < MIN_DRILL_POOL ? words : matches;
}

/**
 * Generate a canonical, single-spaced word-mode text (same guarantee as
 * `generateWordText`) sampled uniformly from the weak-key pool.
 *
 * @throws if `count` is not a positive integer.
 */
export function generateDrillText(count: number, targets: WeakTargets, rng: Rng = Math.random): string {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`word count must be a positive integer, got ${String(count)}`);
  }
  const pool = selectDrillPool(targets);
  return sampleWords(pool, count, rng).join(' ');
}
