import { describe, expect, it } from 'vitest';
import { computeStats, createEngine } from '../src/index.ts';
import { typeEvenly } from './helpers.ts';

// Plan §7.4 worked examples, encoded verbatim. Exact to 2 decimals.

describe('Example A (perfect run)', () => {
  // passage `it was a dark night` (19 chars incl. 4 spaces). Typed perfectly,
  // first keystroke to last spanning exactly 4.000s.
  const text = 'it was a dark night';

  it('wpm = 19 * 60 / 4 / 5 = 57.00, rawWpm = 57.00, accuracy = 100', () => {
    const engine = typeEvenly(createEngine(text), text, 4000);
    expect(engine.status).toBe('complete');
    const stats = engine.getStats();
    expect(stats.wpm).toBeCloseTo(57.0, 2);
    expect(stats.rawWpm).toBeCloseTo(57.0, 2);
    expect(stats.accuracy).toBeCloseTo(100, 2);
    expect(stats.durationMs).toBe(4000);
  });

  it('replay reproduces the live stats from the log alone', () => {
    const engine = typeEvenly(createEngine(text), text, 4000);
    expect(computeStats(text, engine.getLog())).toEqual(engine.getStats());
  });
});

describe('Example B (one corrected error)', () => {
  // Same passage, same 4.000s. The `k` in `dark` was first typed as `l`, then
  // backspaced and corrected. Keypresses: 19 correct + 1 incorrect = 20
  // (backspace not counted).
  const text = 'it was a dark night';

  function run() {
    const engine = createEngine(text);
    type Op = ['char', string] | ['space'] | ['backspace'];
    const ops: Op[] = [];
    for (const ch of 'it was a dar') ops.push(ch === ' ' ? ['space'] : ['char', ch]);
    ops.push(['char', 'l'], ['backspace'], ['char', 'k'], ['space']);
    for (const ch of 'night') ops.push(['char', ch]);
    // 21 ops (20 keypresses + 1 backspace) evenly over exactly 4.000s.
    ops.forEach((op, k) => {
      const ts = k * 200;
      if (op[0] === 'char') engine.addChar(op[1], ts);
      else if (op[0] === 'space') engine.commitSpace(ts);
      else engine.backspace(ts);
    });
    return engine;
  }

  it('accuracy = 100 * 19/20 = 95.00, wpm = 57.00, rawWpm = 60.00', () => {
    const engine = run();
    expect(engine.status).toBe('complete');
    const stats = engine.getStats();
    expect(stats.accuracy).toBeCloseTo(95.0, 2);
    expect(stats.wpm).toBeCloseTo(57.0, 2); // all words end fully correct
    expect(stats.rawWpm).toBeCloseTo(60.0, 2); // 20 * 60 / 4 / 5
    expect(stats.durationMs).toBe(4000);
  });

  it('the corrected char keeps its original incorrect keypress in accuracy', () => {
    const engine = run();
    // 'dark' ends fully correct (the k is `corrected`), yet accuracy < 100.
    const dark = engine.getSnapshot().words[3];
    expect(dark?.states).toEqual(['correct', 'correct', 'correct', 'corrected']);
    expect(dark?.committedCorrect).toBe(true);
    expect(engine.getStats().accuracy).toBeCloseTo(95.0, 2);
  });

  it('replay reproduces the live stats from the log alone', () => {
    const engine = run();
    expect(computeStats(text, engine.getLog())).toEqual(engine.getStats());
  });
});

describe('Example C (skipped word)', () => {
  // passage `the old man`, typed `the` `ol<space>` `man`, total 3.000s.
  const text = 'the old man';

  function run() {
    // 10 keypresses evenly over exactly 3.000s; the space after 'ol' is early.
    return typeEvenly(createEngine(text), 'the ol man', 3000);
  }

  it('wpm = 7 * 60 / 3 / 5 = 28.00, rawWpm = 10 * 60 / 3 / 5 = 40.00', () => {
    const engine = run();
    expect(engine.status).toBe('complete');
    const stats = engine.getStats();
    expect(stats.wpm).toBeCloseTo(28.0, 2);
    expect(stats.rawWpm).toBeCloseTo(40.0, 2);
    expect(stats.durationMs).toBe(3000);
  });

  it("'old' committed incomplete: 'd' is missed and the word is incorrect", () => {
    const engine = run();
    const old = engine.getSnapshot().words[1];
    expect(old?.states).toEqual(['correct', 'correct', 'missed']);
    expect(old?.committed).toBe(true);
    expect(old?.committedCorrect).toBe(false);
  });

  it('the early space is an incorrect keypress (accuracy 9/10 = 90.00)', () => {
    expect(run().getStats().accuracy).toBeCloseTo(90.0, 2);
  });

  it('replay reproduces the live stats from the log alone', () => {
    const engine = run();
    expect(computeStats(text, engine.getLog())).toEqual(engine.getStats());
  });
});
