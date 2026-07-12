import type { CharEvent, CharEvents } from '@prosetype/schema';
import { describe, expect, it } from 'vitest';
import {
  EngineError,
  EventAfterCompletionError,
  IndexOutOfRangeError,
  InvalidEventError,
  MalformedLogError,
  NonMonotonicTimestampError,
  UnknownEventCodeError,
  computeStats,
} from '../src/index.ts';
import { log, mulberry32, randomPassage, randomRun } from './helpers.ts';

// passage 'ab cd': a=0 b=1 space=2 c=3 d=4
const TEXT = 'ab cd';

describe('malformed logs throw typed errors', () => {
  it('non-monotonic timestamps → NonMonotonicTimestampError', () => {
    const bad = log([
      [0, 0, 0],
      [100, 1, 0],
      [50, 2, 4],
    ]);
    expect(() => computeStats(TEXT, bad)).toThrow(NonMonotonicTimestampError);
  });

  it('out-of-range index → IndexOutOfRangeError', () => {
    expect(() => computeStats(TEXT, log([[0, 99, 0]]))).toThrow(IndexOutOfRangeError);
    expect(() => computeStats(TEXT, log([[0, 5, 0]]))).toThrow(IndexOutOfRangeError);
    expect(() => computeStats(TEXT, log([[0, -1, 0]]))).toThrow(IndexOutOfRangeError);
  });

  it('events after completion → EventAfterCompletionError', () => {
    const bad = log([
      [0, 0, 0],
      [100, 1, 0],
      [200, 2, 4],
      [300, 3, 0],
      [400, 4, 0], // run completes here
      [500, 0, 0],
    ]);
    expect(() => computeStats(TEXT, bad)).toThrow(EventAfterCompletionError);
  });

  it('unknown event codes → UnknownEventCodeError', () => {
    expect(() => computeStats(TEXT, log([[0, 0, 5]]))).toThrow(UnknownEventCodeError);
    expect(() => computeStats(TEXT, log([[0, 0, -1]]))).toThrow(UnknownEventCodeError);
    expect(() => computeStats(TEXT, log([[0, 0, 1.5]]))).toThrow(UnknownEventCodeError);
  });

  it('unknown wire version → MalformedLogError', () => {
    const bad = { v: 2, events: [] } as unknown as CharEvents;
    expect(() => computeStats(TEXT, bad)).toThrow(MalformedLogError);
  });

  it('first event with t != 0 → InvalidEventError', () => {
    expect(() => computeStats(TEXT, log([[10, 0, 0]]))).toThrow(InvalidEventError);
  });

  it('non-integer or negative timestamps → InvalidEventError', () => {
    expect(() =>
      computeStats(
        TEXT,
        log([
          [0, 0, 0],
          [10.5, 1, 0],
        ]),
      ),
    ).toThrow(InvalidEventError);
    expect(() => computeStats(TEXT, log([[-1, 0, 0]]))).toThrow(InvalidEventError);
  });

  it('state-inconsistent events → InvalidEventError', () => {
    // add at the wrong slot
    expect(() => computeStats(TEXT, log([[0, 1, 0]]))).toThrow(InvalidEventError);
    // delete with nothing typed
    expect(() => computeStats(TEXT, log([[0, 0, 2]]))).toThrow(InvalidEventError);
    // space-commit on an empty word
    expect(() => computeStats(TEXT, log([[0, 2, 4]]))).toThrow(InvalidEventError);
    // add-extra while the word is incomplete
    expect(() => computeStats(TEXT, log([[0, 2, 3]]))).toThrow(InvalidEventError);
    // space-commit on the last word
    expect(() =>
      computeStats(
        TEXT,
        log([
          [0, 0, 0],
          [100, 1, 0],
          [200, 2, 4],
          [300, 3, 0],
          [400, 4, 4],
        ]),
      ),
    ).toThrow(EngineError);
    // backspace crossing into a fully-correct committed word
    expect(() =>
      computeStats(
        TEXT,
        log([
          [0, 0, 0],
          [100, 1, 0],
          [200, 2, 4],
          [300, 2, 2],
        ]),
      ),
    ).toThrow(InvalidEventError);
    // add-incorrect claiming the over-cap form without the extras being full
    expect(() =>
      computeStats(
        TEXT,
        log([
          [0, 0, 0],
          [100, 1, 0],
          [200, 2, 1],
        ]),
      ),
    ).toThrow(InvalidEventError);
  });

  it('all malformed-log errors are EngineError and MalformedLogError instances', () => {
    const cases: CharEvents[] = [
      log([
        [0, 0, 0],
        [100, 1, 0],
        [50, 2, 4],
      ]),
      log([[0, 99, 0]]),
      log([[0, 0, 5]]),
      log([[10, 0, 0]]),
      log([[0, 1, 0]]),
    ];
    for (const bad of cases) {
      try {
        computeStats(TEXT, bad);
        expect.unreachable('expected a throw');
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError);
        expect(err).toBeInstanceOf(MalformedLogError);
      }
    }
  });
});

describe('fuzzed corruption of valid logs (seeded)', () => {
  it('replay either succeeds or throws a typed EngineError - never anything else', () => {
    let threw = 0;
    for (let seed = 1; seed <= 150; seed += 1) {
      const rng = mulberry32(seed * 0x27d4eb2f);
      const text = randomPassage(rng);
      const events = randomRun(text, rng)
        .getLog()
        .events.map((e): CharEvent => [e[0], e[1], e[2]]);
      if (events.length === 0) continue;

      const pick = Math.floor(rng() * events.length);
      const target = events[pick] as CharEvent;
      const mutation = Math.floor(rng() * 7);
      if (mutation === 0)
        target[0] = Math.max(0, target[0] - 100_000); // break monotonicity
      else if (mutation === 1)
        target[1] = 999; // out of range
      else if (mutation === 2) target[1] = -2;
      else if (mutation === 3)
        target[2] = 5 + Math.floor(rng() * 10); // unknown code
      else if (mutation === 4) {
        const last = events[events.length - 1] as CharEvent;
        events.push([last[0] + 100, 0, 0]); // event after completion
      } else if (mutation === 5) {
        // swap two events
        const other = Math.floor(rng() * events.length);
        const a = events[pick] as CharEvent;
        events[pick] = events[other] as CharEvent;
        events[other] = a;
      } else {
        events.splice(pick, 1); // drop an event
      }

      try {
        const stats = computeStats(text, { v: 1, events });
        expect(Number.isFinite(stats.wpm)).toBe(true); // corruption happened to stay valid
      } catch (err) {
        threw += 1;
        expect(err, `seed ${seed} mutation ${mutation}`).toBeInstanceOf(EngineError);
      }
    }
    expect(threw).toBeGreaterThan(50); // the fuzz genuinely exercises the error paths
  });
});
