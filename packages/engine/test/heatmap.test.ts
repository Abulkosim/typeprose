import { describe, expect, it } from 'vitest';
import { computeHeatmap, computePerSecondRawWpm, createEngine } from '../src/index.ts';
import { log } from './helpers.ts';

describe('computeHeatmap (§7.6)', () => {
  // 'ab, cd': a=0 b=1 ,=2 space=3 c=4 d=5
  const text = 'ab, cd';
  const perfect = log([
    [0, 0, 0],
    [120, 1, 0],
    [300, 2, 0],
    [380, 3, 4],
    [500, 4, 0],
    [620, 5, 0],
  ]);

  it('computes per-char inter-key intervals, first char excluded', () => {
    const heatmap = computeHeatmap(text, perfect);
    expect(heatmap.perChar.map((c) => c.interKeyMs)).toEqual([null, 120, 180, 80, 120, 120]);
  });

  it('normalizes latency log-scaled and clamped at the run p95', () => {
    const heatmap = computeHeatmap(text, perfect);
    // p95 of [80, 120, 120, 120, 180] is 180 → the ',' maxes out at heat 1.
    expect(heatmap.perChar[2]?.heat).toBe(1);
    expect(heatmap.perChar[0]?.heat).toBeNull();
    expect(heatmap.perChar[1]?.heat).toBeCloseTo(Math.log1p(120) / Math.log1p(180), 12);
  });

  it('clamps outlier latencies to the run p95 (heat never exceeds 1)', () => {
    // 21-char word → 20 latency samples: 19 spread 105..195ms plus one 5000ms
    // outlier. p95 = sorted[ceil(0.95*20)-1] = sorted[18] = 195, so the
    // outlier clamps to the same heat as the slowest ordinary char.
    const longText = 'abcdefghijklmnopqrstu';
    const events: [number, number, number][] = [];
    let t = 0;
    for (let i = 0; i < 21; i += 1) {
      events.push([t, i, 0]);
      t += i === 19 ? 5000 : 100 + (i + 1) * 5;
    }
    const heatmap = computeHeatmap(longText, log(events));
    for (const c of heatmap.perChar.slice(1)) {
      expect(c.heat).toBeGreaterThanOrEqual(0);
      expect(c.heat).toBeLessThanOrEqual(1);
    }
    expect(heatmap.perChar[20]?.interKeyMs).toBe(5000);
    expect(heatmap.perChar[20]?.heat).toBe(1); // clamped at p95
    expect(heatmap.perChar[19]?.heat).toBe(1); // the p95 sample itself (195ms)
    expect(heatmap.perChar[1]?.heat).toBeLessThan(1);
  });

  it('counts error touches per character index', () => {
    // type 'a', wrong 'b', delete, correct 'b', commit, 'c', 'd'
    // 'ab cd': a=0 b=1 space=2 c=3 d=4
    const withError = log([
      [0, 0, 0],
      [100, 1, 1],
      [200, 1, 2],
      [300, 1, 0],
      [400, 2, 4],
      [500, 3, 0],
      [600, 4, 0],
    ]);
    const heatmap = computeHeatmap('ab cd', withError);
    expect(heatmap.perChar.map((c) => c.errorTouches)).toEqual([0, 1, 0, 0, 0]);
    // first-attempt latency is kept for the corrected char (the wrong press).
    expect(heatmap.perChar[1]?.interKeyMs).toBe(100);
  });

  it('attributes extras and over-cap presses to the word’s space index', () => {
    const engine = createEngine('ab cd');
    engine.addChar('a', 0);
    engine.addChar('b', 100);
    for (let k = 0; k < 10; k += 1) engine.addChar('z', 200 + k * 10); // 8 extras + 2 ignored
    const heatmap = computeHeatmap('ab cd', engine.getLog());
    expect(heatmap.perChar[2]?.errorTouches).toBe(10);
  });

  it('early space counts as an error touch on the space index', () => {
    const engine = createEngine('abc de');
    engine.addChar('a', 0);
    engine.commitSpace(100);
    const heatmap = computeHeatmap('abc de', engine.getLog());
    expect(heatmap.perChar.map((c) => c.errorTouches)).toEqual([0, 0, 0, 1, 0, 0]);
    // skipped chars were never typed → no latency sample
    expect(heatmap.perChar[1]?.interKeyMs).toBeNull();
    expect(heatmap.perChar[2]?.interKeyMs).toBeNull();
  });

  it('reports the three slowest words with times', () => {
    // 'aa bb cc dd' typed with word times 100, 400, 300, 200
    const t2 = 'aa bb cc dd';
    // indices: a0 a1 _2 b3 b4 _5 c6 c7 _8 d9 d10
    const events = log([
      [0, 0, 0],
      [100, 1, 0], // 'aa' → 100
      [200, 2, 4],
      [400, 3, 0],
      [800, 4, 0], // 'bb' → 200 + 400 = 600
      [900, 5, 4],
      [1000, 6, 0],
      [1300, 7, 0], // 'cc' → 100 + 300 = 400
      [1400, 8, 4],
      [1500, 9, 0],
      [1700, 10, 0], // 'dd' → 100 + 200 = 300
    ]);
    const heatmap = computeHeatmap(t2, events);
    expect(heatmap.slowestWords).toEqual([
      { wordIndex: 1, word: 'bb', ms: 600 },
      { wordIndex: 2, word: 'cc', ms: 400 },
      { wordIndex: 3, word: 'dd', ms: 300 },
    ]);
  });

  it('computes the punctuation tax as a percentage', () => {
    const heatmap = computeHeatmap(text, perfect);
    // punctuation: ',' = 180; letters: b 120, c 120, d 120 → +50%
    expect(heatmap.punctuationTaxPct).toBe(50);
  });

  it('punctuation tax is null when no punctuation was sampled', () => {
    const heatmap = computeHeatmap(
      'ab cd',
      log([
        [0, 0, 0],
        [100, 1, 0],
        [200, 2, 4],
        [300, 3, 0],
        [400, 4, 0],
      ]),
    );
    expect(heatmap.punctuationTaxPct).toBeNull();
  });

  it('an empty log yields an all-null heatmap', () => {
    const heatmap = computeHeatmap(text, log([]));
    expect(heatmap.perChar).toHaveLength(text.length);
    expect(heatmap.perChar.every((c) => c.interKeyMs === null && c.heat === null)).toBe(true);
    expect(heatmap.slowestWords).toEqual([]);
    expect(heatmap.punctuationTaxPct).toBeNull();
  });
});

describe('computePerSecondRawWpm', () => {
  it('returns an empty series for an empty log', () => {
    expect(computePerSecondRawWpm('ab cd', log([]))).toEqual([]);
  });

  it('matches the §7.5 bucket definition', () => {
    const engine = createEngine('ab cd');
    engine.addChar('a', 0);
    engine.addChar('b', 400);
    engine.commitSpace(900);
    engine.addChar('c', 1100);
    engine.addChar('d', 2050);
    expect(engine.status).toBe('complete');
    // buckets over 2050ms → 3; counts [3, 1, 1] → [36, 12, 12]
    expect(computePerSecondRawWpm('ab cd', engine.getLog())).toEqual([36, 12, 12]);
  });
});
