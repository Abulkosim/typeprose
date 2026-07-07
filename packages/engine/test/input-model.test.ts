import { describe, expect, it } from 'vitest';
import {
  InvalidInputError,
  InvalidPassageError,
  MAX_EXTRA_CHARS,
  computeStats,
  createEngine,
} from '../src/index.ts';

describe('lifecycle (§7.1)', () => {
  it('is idle on load; the timer starts at the first character keystroke', () => {
    const engine = createEngine('ab cd');
    expect(engine.status).toBe('idle');
    expect(engine.getSnapshot().startedAtMs).toBeNull();
    engine.addChar('a', 12345.6);
    expect(engine.status).toBe('running');
    expect(engine.getSnapshot().startedAtMs).toBe(12345.6);
    expect(engine.getLog().events[0]).toEqual([0, 0, 0]); // t normalized to 0
  });

  it('space and backspace while idle are no-ops and never start the timer', () => {
    const engine = createEngine('ab cd');
    engine.commitSpace(100);
    engine.backspace(200);
    engine.backspace(300, { wholeWord: true });
    expect(engine.status).toBe('idle');
    expect(engine.getLog().events).toHaveLength(0);
  });

  it('completes when the last word reaches target length, no trailing space', () => {
    const engine = createEngine('ab cd');
    engine.addChar('a', 0);
    engine.addChar('b', 100);
    engine.commitSpace(200);
    engine.addChar('c', 300);
    expect(engine.status).toBe('running');
    engine.addChar('d', 400);
    expect(engine.status).toBe('complete');
    expect(engine.getStats().durationMs).toBe(400);
    expect(engine.getSnapshot().completedAtMs).toBe(400);
  });

  it('completes regardless of correctness of the final character', () => {
    const engine = createEngine('ab cd');
    engine.addChar('a', 0);
    engine.addChar('b', 100);
    engine.commitSpace(200);
    engine.addChar('c', 300);
    engine.addChar('x', 400); // wrong final char still consumes the slot
    expect(engine.status).toBe('complete');
    // 'cd' is not fully correct → only 'ab' + its space count for wpm.
    const stats = engine.getStats();
    expect(stats.wpm).toBeCloseTo((3 / 5) * (60000 / 400), 2);
    expect(stats.durationMs).toBe(400);
  });

  it('input after completion is a no-op and appends nothing to the log', () => {
    const engine = createEngine('ab');
    engine.addChar('a', 0);
    engine.addChar('b', 50);
    expect(engine.status).toBe('complete');
    const before = engine.getLog().events.length;
    engine.addChar('x', 100);
    engine.commitSpace(150);
    engine.backspace(200);
    expect(engine.getLog().events).toHaveLength(before);
    expect(engine.status).toBe('complete');
  });

  it('single-word passage: no spaces, completes on the final char', () => {
    const engine = createEngine('hello');
    for (const [k, ch] of [...'hello'].entries()) {
      engine.commitSpace(k * 100 - 10); // no-op on the last (only) word
      engine.addChar(ch, k * 100);
    }
    expect(engine.status).toBe('complete');
    const stats = engine.getStats();
    expect(stats.durationMs).toBe(400);
    expect(stats.wpm).toBeCloseTo((5 / 5) * (60000 / 400), 2); // 150.00
    expect(stats.accuracy).toBe(100);
    expect(computeStats('hello', engine.getLog())).toEqual(stats);
  });
});

describe('space commits (§7.2)', () => {
  it('early space marks untyped chars missed and the word incorrect', () => {
    const engine = createEngine('abc de');
    engine.addChar('a', 0);
    engine.commitSpace(100);
    const word = engine.getSnapshot().words[0];
    expect(word?.states).toEqual(['correct', 'missed', 'missed']);
    expect(word?.committed).toBe(true);
    expect(word?.committedCorrect).toBe(false);
    expect(engine.getSnapshot().activeWordIndex).toBe(1);
  });

  it('space on an empty word is a no-op (nothing logged)', () => {
    const engine = createEngine('ab cd');
    engine.addChar('a', 0);
    engine.addChar('b', 100);
    engine.commitSpace(200);
    const before = engine.getLog().events.length;
    engine.commitSpace(300);
    engine.commitSpace(400);
    expect(engine.getLog().events).toHaveLength(before);
    expect(engine.getSnapshot().activeWordIndex).toBe(1);
  });

  it('space on the last word is a no-op', () => {
    const engine = createEngine('ab cd');
    engine.addChar('a', 0);
    engine.addChar('b', 100);
    engine.commitSpace(200);
    engine.addChar('c', 300);
    engine.commitSpace(350);
    expect(engine.status).toBe('running');
    expect(engine.getLog().events).toHaveLength(4);
  });
});

describe('extra characters (§7.2)', () => {
  function overfill() {
    const engine = createEngine('ab cd');
    engine.addChar('a', 0);
    engine.addChar('b', 100);
    for (let k = 0; k < MAX_EXTRA_CHARS + 2; k += 1) {
      engine.addChar('x', 200 + k * 50); // 8 extras + 2 over-cap presses
    }
    return engine;
  }

  it(`caps extras at +${MAX_EXTRA_CHARS} per word`, () => {
    const engine = overfill();
    const word = engine.getSnapshot().words[0];
    expect(word?.extras).toBe('x'.repeat(MAX_EXTRA_CHARS));
    expect(engine.getSnapshot().activeCharIndex).toBe(2 + MAX_EXTRA_CHARS);
  });

  it('over-cap keypresses are ignored for state but logged and counted incorrect', () => {
    const engine = overfill();
    const events = engine.getLog().events;
    // 2 slot adds, 8 add-extra (code 3), then 2 ignored presses as code 1.
    expect(events.map((e) => e[2])).toEqual([0, 0, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1]);
    // extras and over-cap presses target the word's space index.
    expect(events.slice(2).every((e) => e[1] === 2)).toBe(true);
    // accuracy: 2 correct, 8 extras + 2 ignored = 10 incorrect.
    expect(engine.getStats().accuracy).toBeCloseTo((100 * 2) / 12, 2);
  });

  it('over-cap presses do not count toward rawWpm; extras do', () => {
    const engine = overfill();
    const stats = engine.getStats();
    // raw chars = 2 slots + 8 extras = 10; the last (ignored) press is still
    // the last logged event, so the live duration is 650ms.
    expect(stats.durationMs).toBe(650);
    expect(stats.rawWpm).toBeCloseTo((10 / 5) * (60000 / 650), 2);
    expect(computeStats('ab cd', engine.getLog())).toEqual(stats);
  });

  it('extras delete before slot chars on backspace', () => {
    const engine = overfill();
    engine.backspace(1000);
    expect(engine.getSnapshot().words[0]?.extras).toBe('x'.repeat(MAX_EXTRA_CHARS - 1));
    expect(engine.getSnapshot().words[0]?.typed).toBe('ab');
  });

  it('a word committed with leftover extras is incorrect for wpm', () => {
    const engine = createEngine('ab cd');
    engine.addChar('a', 0);
    engine.addChar('b', 100);
    engine.addChar('z', 200); // one extra
    engine.commitSpace(300);
    engine.addChar('c', 400);
    engine.addChar('d', 500);
    expect(engine.status).toBe('complete');
    // only 'cd' (2 chars, final word: no space) counts.
    expect(engine.getStats().wpm).toBeCloseTo((2 / 5) * (60000 / 500), 2);
  });
});

describe('backspace rules (§7.2)', () => {
  it('is blocked at position 0 after a fully-correct previous word', () => {
    const engine = createEngine('ab cd');
    engine.addChar('a', 0);
    engine.addChar('b', 100);
    engine.commitSpace(200);
    const before = engine.getSnapshot();
    engine.backspace(300);
    const after = engine.getSnapshot();
    expect(engine.getLog().events).toHaveLength(3);
    expect(after.activeWordIndex).toBe(before.activeWordIndex);
    expect(after.activeCharIndex).toBe(0);
  });

  it('crosses into a previous word committed with errors, re-opening it', () => {
    const engine = createEngine('ab cd');
    engine.addChar('a', 0);
    engine.addChar('x', 100); // wrong
    engine.commitSpace(200);
    engine.backspace(300); // uncommit: back into 'ab'
    let snap = engine.getSnapshot();
    expect(snap.activeWordIndex).toBe(0);
    expect(snap.activeCharIndex).toBe(2); // caret after the typed input
    expect(snap.words[0]?.committed).toBe(false);
    engine.backspace(400); // delete 'x'
    engine.addChar('b', 500); // fix it → corrected
    snap = engine.getSnapshot();
    expect(snap.words[0]?.states).toEqual(['correct', 'corrected']);
    engine.commitSpace(600);
    expect(engine.getSnapshot().words[0]?.committedCorrect).toBe(true);
    engine.addChar('c', 700);
    engine.addChar('d', 800);
    expect(engine.status).toBe('complete');
    const stats = engine.getStats();
    // Both words end fully correct: 2 + 1 (space) + 2 = 5 chars.
    expect(stats.wpm).toBeCloseTo((5 / 5) * (60000 / 800), 2);
    // Keypresses: a, x(bad), space#1(bad: word had errors), b, space#2, c, d
    expect(stats.accuracy).toBeCloseTo((100 * 5) / 7, 2);
    expect(computeStats('ab cd', engine.getLog())).toEqual(stats);
  });

  it('is blocked again once the previous word is re-committed fully correct', () => {
    const engine = createEngine('ab cd');
    engine.addChar('a', 0);
    engine.addChar('x', 100);
    engine.commitSpace(200);
    engine.backspace(300);
    engine.backspace(400);
    engine.addChar('b', 500);
    engine.commitSpace(600);
    const before = engine.getLog().events.length;
    engine.backspace(700); // now blocked: previous word fully correct
    expect(engine.getLog().events).toHaveLength(before);
    expect(engine.getSnapshot().activeWordIndex).toBe(1);
  });

  it('un-misses skipped chars when re-opening a word', () => {
    const engine = createEngine('abc de');
    engine.addChar('a', 0);
    engine.commitSpace(100);
    expect(engine.getSnapshot().words[0]?.states).toEqual(['correct', 'missed', 'missed']);
    engine.backspace(200);
    expect(engine.getSnapshot().words[0]?.states).toEqual(['correct', 'pending', 'pending']);
    expect(engine.getSnapshot().activeCharIndex).toBe(1);
  });

  it('can cross back through multiple error-committed words', () => {
    const engine = createEngine('a b c');
    engine.addChar('x', 0); // wrong 'a'
    engine.commitSpace(100);
    engine.addChar('y', 200); // wrong 'b'
    engine.commitSpace(300);
    engine.backspace(400); // into 'b'
    engine.backspace(500); // delete 'y'
    engine.backspace(600); // into 'a'
    const snap = engine.getSnapshot();
    expect(snap.activeWordIndex).toBe(0);
    expect(snap.activeCharIndex).toBe(1);
  });

  it('Ctrl/Alt+Backspace clears the current word including extras', () => {
    const engine = createEngine('abc de');
    engine.addChar('a', 0);
    engine.addChar('b', 100);
    engine.addChar('c', 200);
    engine.addChar('z', 300); // extra
    engine.backspace(400, { wholeWord: true });
    const snap = engine.getSnapshot();
    expect(snap.words[0]?.typed).toBe('');
    expect(snap.words[0]?.extras).toBe('');
    expect(snap.words[0]?.states).toEqual(['pending', 'pending', 'pending']);
    expect(snap.activeCharIndex).toBe(0);
    // one delete event per cleared char, backspaces are not keypresses
    expect(engine.getLog().events.map((e) => e[2])).toEqual([0, 0, 0, 3, 2, 2, 2, 2]);
    expect(engine.getStats().accuracy).toBeCloseTo(75, 2); // 3 correct, 1 extra
  });

  it('Ctrl/Alt+Backspace on an empty word falls back to the crossing rule', () => {
    const engine = createEngine('ab cd');
    engine.addChar('a', 0);
    engine.addChar('x', 100);
    engine.commitSpace(200);
    engine.backspace(300, { wholeWord: true });
    expect(engine.getSnapshot().activeWordIndex).toBe(0); // stepped into 'ab' only
    expect(engine.getSnapshot().activeCharIndex).toBe(2);
  });

  it('a deleted-then-retyped char becomes corrected, not correct', () => {
    const engine = createEngine('ab');
    engine.addChar('x', 0);
    engine.backspace(100);
    engine.addChar('a', 200);
    expect(engine.getSnapshot().words[0]?.states[0]).toBe('corrected');
  });
});

describe('engine input validation', () => {
  it('rejects non-canonical passages', () => {
    expect(() => createEngine('')).toThrow(InvalidPassageError);
    expect(() => createEngine(' a')).toThrow(InvalidPassageError);
    expect(() => createEngine('a ')).toThrow(InvalidPassageError);
    expect(() => createEngine('a  b')).toThrow(InvalidPassageError);
    expect(() => createEngine('a\nb')).toThrow(InvalidPassageError);
    expect(() => createEngine('a\tb')).toThrow(InvalidPassageError);
  });

  it('rejects invalid addChar arguments', () => {
    const engine = createEngine('ab');
    expect(() => engine.addChar('', 0)).toThrow(InvalidInputError);
    expect(() => engine.addChar('ab', 0)).toThrow(InvalidInputError);
    expect(() => engine.addChar(' ', 0)).toThrow(InvalidInputError);
    expect(() => engine.addChar('a', Number.NaN)).toThrow(InvalidInputError);
  });

  it('clamps backwards caller timestamps to keep the log monotonic', () => {
    const engine = createEngine('abc');
    engine.addChar('a', 1000);
    engine.addChar('b', 1200);
    engine.addChar('c', 1100); // clock went backwards
    const times = engine.getLog().events.map((e) => e[0]);
    expect(times).toEqual([0, 200, 200]);
    expect(engine.status).toBe('complete');
  });
});

describe('snapshot identity for memoized rendering', () => {
  it('unchanged word snapshots keep reference identity across keystrokes', () => {
    const engine = createEngine('ab cd ef');
    engine.addChar('a', 0);
    const first = engine.getSnapshot();
    engine.addChar('b', 100);
    const second = engine.getSnapshot();
    expect(second.words[0]).not.toBe(first.words[0]); // active word changed
    expect(second.words[1]).toBe(first.words[1]); // untouched words stable
    expect(second.words[2]).toBe(first.words[2]);
  });
});
