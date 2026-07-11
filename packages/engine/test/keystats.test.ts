import { describe, expect, it } from 'vitest';
import { aggregateKeyStats, MIN_OCCURRENCES, type KeyStatsRun } from '../src/index.ts';
import { log } from './helpers.ts';

// Errored words must not be the last word: filling the final word's slots (even
// incorrectly) completes the run, so corrections happen on a non-final word.

/** 'aa bb' typed cleanly; slot 1 of 'aa' has a 100ms first-attempt latency. */
const perfectAA = log([
  [0, 0, 0], // a
  [100, 1, 0], // a  (latency 100)
  [200, 2, 4], // space
  [300, 3, 0], // b
  [400, 4, 0], // b
]);

/** 'aa bb' where slot 1 of 'aa' is first hit wrong (t50), deleted, corrected. */
const errorAA = log([
  [0, 0, 0], // a
  [50, 1, 1], // wrong into slot 1 (latency 50, one error touch)
  [100, 1, 2], // delete slot 1
  [150, 1, 0], // a corrected
  [200, 2, 4], // space
  [300, 3, 0], // b
  [400, 4, 0], // b
]);

function runs(text: string, ...logs: (typeof perfectAA)[]): KeyStatsRun[] {
  return logs.map((l) => ({ passageText: text, log: l }));
}

describe('aggregateKeyStats', () => {
  it('aggregates occurrences, errors, error rate and mean latency per key', () => {
    // 4 clean runs + 1 with a corrected error, all on 'aa bb'.
    const data = aggregateKeyStats(runs('aa bb', perfectAA, perfectAA, perfectAA, perfectAA, errorAA));
    const a = data.keys.find((k) => k.key === 'a');
    // 5 runs × 2 'a' slots = 10 first-attempt occurrences; one wrong keypress.
    // latencies at slot 1: four × 100 + one × 50 = 450 / 5 samples = 90.
    expect(a).toEqual({ key: 'a', occurrences: 10, errors: 1, errorRate: 10, avgLatencyMs: 90 });
  });

  it('aggregates bigrams as the transition into the second char', () => {
    const data = aggregateKeyStats(runs('aa bb', perfectAA, perfectAA, perfectAA, perfectAA, errorAA));
    const aa = data.bigrams.find((b) => b.bigram === 'aa');
    // one 'aa' transition per run (slot 1), 5 total, one erroneous.
    expect(aa).toEqual({ bigram: 'aa', occurrences: 5, errors: 1, errorRate: 20, avgLatencyMs: 90 });
  });

  it(`drops keys and bigrams below MIN_OCCURRENCES (${MIN_OCCURRENCES})`, () => {
    // 4 clean runs → key 'a' has 8 occurrences (kept), bigram 'aa' has 4 (dropped).
    const data = aggregateKeyStats(runs('aa bb', perfectAA, perfectAA, perfectAA, perfectAA));
    expect(data.keys.find((k) => k.key === 'a')?.occurrences).toBe(8);
    expect(data.bigrams.find((b) => b.bigram === 'aa')).toBeUndefined();
  });

  it('excludes spaces from keys and does not form bigrams across words', () => {
    const clean = log([
      [0, 0, 0], // a
      [100, 1, 0], // b
      [200, 2, 4], // space commit
      [300, 3, 0], // c
      [400, 4, 0], // d
    ]);
    const data = aggregateKeyStats(runs('ab cd', ...Array<typeof clean>(5).fill(clean)));
    expect(data.keys.some((k) => k.key === ' ')).toBe(false);
    // 'ab' and 'cd' are within-word bigrams; 'bc' would cross the space → excluded.
    expect(data.bigrams.map((b) => b.bigram).sort()).toEqual(['ab', 'cd']);
  });

  it('ranks worst first by error rate then latency', () => {
    // 'xy z': x always clean, y always wrong-then-corrected → y has the higher rate.
    const l = log([
      [0, 0, 0], // x clean
      [50, 1, 1], // y wrong
      [100, 1, 2], // delete
      [150, 1, 0], // y corrected
      [200, 2, 4], // space
      [250, 3, 0], // z → completes
    ]);
    const data = aggregateKeyStats(runs('xy z', ...Array<typeof l>(5).fill(l)));
    expect(data.keys[0]?.key).toBe('y');
    expect(data.keys[0]?.errorRate).toBeGreaterThan(data.keys[1]?.errorRate ?? 0);
  });

  it('skips runs whose stored log fails to replay', () => {
    const bad = log([[0, 9, 0]]); // index 9 is out of range for 'aa bb'
    const data = aggregateKeyStats(
      runs('aa bb', perfectAA, perfectAA, perfectAA, perfectAA, errorAA).concat({
        passageText: 'aa bb',
        log: bad,
      }),
    );
    // the good runs still aggregate as before.
    expect(data.keys.find((k) => k.key === 'a')?.occurrences).toBe(10);
  });

  it('returns empty arrays for no runs', () => {
    expect(aggregateKeyStats([])).toEqual({ keys: [], bigrams: [] });
  });

  it('avgLatencyMs is null when only the run-opening char is sampled', () => {
    // Single-char passages: the only attempt is the first keypress (no latency).
    const single = log([[0, 0, 0]]);
    const data = aggregateKeyStats(runs('a', ...Array<typeof single>(5).fill(single)));
    const a = data.keys.find((k) => k.key === 'a');
    expect(a?.occurrences).toBe(5);
    expect(a?.avgLatencyMs).toBeNull();
  });
});
