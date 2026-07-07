import { describe, expect, it } from 'vitest';
import {
  MAX_CHAR_EVENTS,
  MAX_CHAR_EVENTS_BYTES,
  charEventsSchema,
  type CharEvent,
} from '../src/index.ts';

function validLog(): { v: 1; events: CharEvent[] } {
  return {
    v: 1,
    events: [
      [0, 0, 0], // 'i' correct
      [130, 1, 0], // 't' correct
      [240, 2, 1], // wrong char at index 2
      [360, 2, 2], // delete it
      [470, 2, 0], // retype correct
      [590, 2, 4], // space-commit
    ],
  };
}

describe('charEventsSchema', () => {
  it('accepts a valid event log', () => {
    const result = charEventsSchema.safeParse(validLog());
    expect(result.success).toBe(true);
  });

  it('accepts equal (non-decreasing) consecutive timestamps', () => {
    const log = {
      v: 1,
      events: [
        [0, 0, 0],
        [100, 1, 0],
        [100, 2, 0],
      ],
    };
    expect(charEventsSchema.safeParse(log).success).toBe(true);
  });

  it('rejects non-monotonic timestamps', () => {
    const log = {
      v: 1,
      events: [
        [0, 0, 0],
        [500, 1, 0],
        [200, 2, 0],
      ],
    };
    const result = charEventsSchema.safeParse(log);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/monotonic/);
    }
  });

  it(`rejects more than ${MAX_CHAR_EVENTS} events`, () => {
    const events: CharEvent[] = Array.from({ length: MAX_CHAR_EVENTS + 1 }, (_, k) => [k, k, 0]);
    const result = charEventsSchema.safeParse({ v: 1, events });
    expect(result.success).toBe(false);
  });

  it(`accepts exactly ${MAX_CHAR_EVENTS} events (within the byte cap)`, () => {
    // Compact events so 6000 of them stay under the 64KB serialized cap.
    const events: CharEvent[] = Array.from({ length: MAX_CHAR_EVENTS }, () => [0, 0, 0]);
    expect(JSON.stringify({ v: 1, events }).length).toBeLessThanOrEqual(MAX_CHAR_EVENTS_BYTES);
    const result = charEventsSchema.safeParse({ v: 1, events });
    expect(result.success).toBe(true);
  });

  it('rejects logs over the serialized byte cap', () => {
    // 6000 events with huge timestamps: each tuple serializes to ~30 bytes > 64KB total.
    const events: CharEvent[] = Array.from({ length: MAX_CHAR_EVENTS }, (_, k) => [
      1_000_000_000 + k,
      1_000_000 + k,
      0,
    ]);
    const serialized = JSON.stringify({ v: 1, events });
    expect(serialized.length).toBeGreaterThan(MAX_CHAR_EVENTS_BYTES);
    const result = charEventsSchema.safeParse({ v: 1, events });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/bytes/);
    }
  });

  it('rejects unknown wire versions', () => {
    expect(charEventsSchema.safeParse({ v: 2, events: [] }).success).toBe(false);
  });

  it('rejects out-of-range event codes', () => {
    expect(charEventsSchema.safeParse({ v: 1, events: [[0, 0, 5]] }).success).toBe(false);
  });

  it('rejects negative character indices and non-integer timestamps', () => {
    expect(charEventsSchema.safeParse({ v: 1, events: [[0, -1, 0]] }).success).toBe(false);
    expect(charEventsSchema.safeParse({ v: 1, events: [[1.5, 0, 0]] }).success).toBe(false);
  });
});
