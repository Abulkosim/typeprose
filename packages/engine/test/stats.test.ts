import { describe, expect, it } from 'vitest';
import { computePerSecondRawWpm, computeStats, createEngine, kogasa } from '../src/index.ts';
import { log } from './helpers.ts';

describe('kogasa (verified against monkeytype packages/util/src/numbers.ts)', () => {
  it('kogasa(0) = 100 (perfectly even pace)', () => {
    expect(kogasa(0)).toBe(100);
  });

  it('matches reference values of 100 * (1 - tanh(cov + cov^3/3 + cov^5/5))', () => {
    expect(kogasa(1 / 11)).toBeCloseTo(90.90909164082048, 10);
    expect(kogasa(1 / 3)).toBeCloseTo(66.67302527754342, 10);
    expect(kogasa(0.5)).toBeCloseTo(50.1042832075367, 10);
  });
});

describe('consistency = kogasa(cov of per-1-second raw wpm buckets)', () => {
  // 'abcde fghij': 6 raw keypresses in second 0 (5 chars + space), 5 in
  // second 1 → buckets [72, 60] raw wpm; mean 66, population stddev 6,
  // cov = 1/11 → kogasa(1/11) = 90.909... → 90.91 rounded.
  const text = 'abcde fghij';
  const bucketed = log([
    [0, 0, 0],
    [100, 1, 0],
    [200, 2, 0],
    [300, 3, 0],
    [400, 4, 0],
    [999, 5, 4],
    [1000, 6, 0],
    [1200, 7, 0],
    [1400, 8, 0],
    [1600, 9, 0],
    [1800, 10, 0],
  ]);

  it('computes the crafted two-bucket example exactly', () => {
    const stats = computeStats(text, bucketed);
    expect(stats.consistency).toBe(90.91);
    expect(stats.durationMs).toBe(1800);
  });

  it('exposes the same buckets as the wpm-over-time series', () => {
    expect(computePerSecondRawWpm(text, bucketed)).toEqual([72, 60]);
  });

  it('a run typed at a perfectly even pace has consistency 100', () => {
    // 'abcd efghi': 5 keypresses in each of the two seconds → buckets [60, 60].
    const stats = computeStats(
      'abcd efghi',
      log([
        [0, 0, 0],
        [200, 1, 0],
        [400, 2, 0],
        [600, 3, 0],
        [800, 4, 4],
        [1000, 5, 0],
        [1200, 6, 0],
        [1400, 7, 0],
        [1600, 8, 0],
        [1800, 9, 0],
      ]),
    );
    expect(stats.consistency).toBe(100);
  });

  it('a sub-second run has a single bucket and consistency 100', () => {
    const stats = computeStats(
      'ab',
      log([
        [0, 0, 0],
        [500, 1, 0],
      ]),
    );
    expect(stats.consistency).toBe(100);
    expect(
      computePerSecondRawWpm(
        'ab',
        log([
          [0, 0, 0],
          [500, 1, 0],
        ]),
      ),
    ).toEqual([24]);
  });
});

describe('accuracy', () => {
  it('defaults to 100 when there are no keypresses (empty log)', () => {
    const stats = computeStats('abc def', log([]));
    expect(stats).toEqual({ wpm: 0, rawWpm: 0, accuracy: 100, consistency: 100, durationMs: 0 });
  });

  it('defaults to 100 on an idle engine', () => {
    const engine = createEngine('abc def');
    expect(engine.getStats()).toEqual({
      wpm: 0,
      rawWpm: 0,
      accuracy: 100,
      consistency: 100,
      durationMs: 0,
    });
  });

  it('backspaces are not keypresses', () => {
    const engine = createEngine('ab');
    engine.addChar('x', 0);
    engine.backspace(100);
    engine.backspace(150); // no-op at position 0 of first word
    engine.addChar('a', 200);
    engine.addChar('b', 300);
    // keypresses: x(bad), a, b → 2/3
    expect(engine.getStats().accuracy).toBeCloseTo(200 / 3, 2);
  });
});

describe('wpm numerator (charsInCorrectWords + correctSpaces)', () => {
  it('counts the space after each fully-correct word, none after the last', () => {
    // 'ab cd ef' typed perfectly in 6s: 8 chars = (2+1)+(2+1)+2
    const text = 'ab cd ef';
    const engine = createEngine(text);
    [...text].forEach((ch, k) => {
      const ts = Math.round((k * 6000) / 7);
      if (ch === ' ') engine.commitSpace(ts);
      else engine.addChar(ch, ts);
    });
    expect(engine.getStats().wpm).toBeCloseTo((8 / 5) * (60000 / 6000), 2); // 16.00
  });

  it('an uncommitted mid-run word does not count toward wpm yet', () => {
    const engine = createEngine('ab cd');
    engine.addChar('a', 0);
    engine.addChar('b', 1000); // 'ab' fully typed but not committed
    expect(engine.getStats().wpm).toBe(0);
    engine.commitSpace(2000);
    expect(engine.getStats().wpm).toBeGreaterThan(0);
  });

  it('live stats equal the pure replay at every step', () => {
    const text = 'ab cd';
    const engine = createEngine(text);
    const steps: Array<() => void> = [
      () => engine.addChar('a', 0),
      () => engine.addChar('x', 200),
      () => engine.backspace(400),
      () => engine.addChar('b', 600),
      () => engine.commitSpace(800),
      () => engine.addChar('c', 1000),
      () => engine.addChar('d', 1200),
    ];
    for (const step of steps) {
      step();
      expect(engine.getStats()).toEqual(computeStats(text, engine.getLog()));
    }
    expect(engine.status).toBe('complete');
  });
});
