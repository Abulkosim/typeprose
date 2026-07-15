import { parsePassage } from '@typeprose/engine';
import type { BigramStat, KeyStat } from '@typeprose/schema';
import { describe, expect, it } from 'vitest';

import { extractWeakTargets, generateDrillText, MIN_DRILL_POOL, selectDrillPool } from '../src/lib/drill';

function keyStat(key: string): KeyStat {
  return { key, occurrences: 10, errors: 5, errorRate: 50, avgLatencyMs: 200 };
}

function bigramStat(bigram: string): BigramStat {
  return { bigram, occurrences: 10, errors: 5, errorRate: 50, avgLatencyMs: 200 };
}

describe('extractWeakTargets', () => {
  it('lowercases and keeps only single a-z keys and two-letter a-z bigrams', () => {
    // Prose stats can contain capitals, punctuation, and the space char - none
    // of which match any COMMON_WORDS entry, so they're filtered out here.
    const targets = extractWeakTargets({
      keyStats: [keyStat('A'), keyStat(' '), keyStat('.'), keyStat('z'), keyStat('5')],
      bigramStats: [bigramStat('Th'), bigramStat(' t'), bigramStat('ab.'), bigramStat('q7')],
    });
    expect(targets.keys).toEqual(['a', 'z']);
    expect(targets.bigrams).toEqual(['th']);
  });

  it('dedupes repeats while preserving worst-first order', () => {
    const targets = extractWeakTargets({
      keyStats: [keyStat('e'), keyStat('e'), keyStat('t')],
      bigramStats: [bigramStat('th'), bigramStat('th'), bigramStat('he')],
    });
    expect(targets.keys).toEqual(['e', 't']);
    expect(targets.bigrams).toEqual(['th', 'he']);
  });

  it('caps at the worst 5 of each', () => {
    const targets = extractWeakTargets({
      keyStats: ['e', 't', 'a', 'o', 'i', 'n', 's'].map(keyStat),
      bigramStats: ['th', 'he', 'in', 'er', 'an', 're'].map(bigramStat),
    });
    expect(targets.keys).toEqual(['e', 't', 'a', 'o', 'i']);
    expect(targets.bigrams).toEqual(['th', 'he', 'in', 'er', 'an']);
  });

  it('returns empty targets for a brand-new profile with no stats', () => {
    expect(extractWeakTargets({ keyStats: [], bigramStats: [] })).toEqual({ keys: [], bigrams: [] });
  });
});

describe('selectDrillPool', () => {
  it('keeps only words containing a weak key or bigram when enough match', () => {
    const words = [
      ...Array.from({ length: 25 }, (_, i) => `zeb${String(i)}`), // contain 'z'
      'apple',
      'grape',
      'stone',
      'river',
      'cloud',
    ];
    const pool = selectDrillPool({ keys: ['z'], bigrams: [] }, words);
    expect(pool.length).toBe(25);
    expect(pool.every((w) => w.includes('z'))).toBe(true);
  });

  it('matches on a weak bigram substring too', () => {
    const words = Array.from({ length: MIN_DRILL_POOL }, (_, i) => `th${String(i)}ing`).concat([
      'apple',
      'grape',
    ]);
    const pool = selectDrillPool({ keys: [], bigrams: ['th'] }, words);
    expect(pool.length).toBe(MIN_DRILL_POOL);
    expect(pool.every((w) => w.includes('th'))).toBe(true);
  });

  it('falls back to the full list when fewer than MIN_DRILL_POOL words match', () => {
    const words = ['queen', 'quiet', 'quilt', 'apple', 'grape', 'stone', 'river', 'cloud'];
    const pool = selectDrillPool({ keys: ['q'], bigrams: [] }, words);
    expect(pool).toEqual(words); // only 3 of 8 match - well under the threshold
  });

  it('falls back to the full list for empty targets', () => {
    const words = ['apple', 'grape', 'stone'];
    expect(selectDrillPool({ keys: [], bigrams: [] }, words)).toEqual(words);
  });
});

describe('generateDrillText', () => {
  it('produces exactly `count` words', () => {
    const text = generateDrillText(50, { keys: ['e'], bigrams: [] });
    expect(text.split(' ')).toHaveLength(50);
  });

  it('is deterministic with a seeded rng', () => {
    // A stubbed rng always drawing index 0 samples the same pool word every time.
    const rng = () => 0;
    const targets = { keys: ['q'], bigrams: [] }; // sparse enough that selectDrillPool falls back to COMMON_WORDS
    const pool = selectDrillPool(targets);
    const first = pool[0];
    expect(first).toBeDefined();
    const text = generateDrillText(5, targets, rng);
    expect(text).toBe(Array.from({ length: 5 }, () => first).join(' '));
  });

  it('emits canonical text the engine accepts', () => {
    const text = generateDrillText(200, { keys: ['e', 't'], bigrams: ['th', 'he'] });
    expect(text).not.toMatch(/\s{2,}|^\s|\s$|[^\S ]/);
    expect(() => parsePassage(text)).not.toThrow();
    expect(parsePassage(text).words).toHaveLength(200);
  });

  it('rejects a non-positive or non-integer count', () => {
    const targets = { keys: [], bigrams: [] };
    expect(() => generateDrillText(0, targets)).toThrow();
    expect(() => generateDrillText(-5, targets)).toThrow();
    expect(() => generateDrillText(3.5, targets)).toThrow();
  });
});
