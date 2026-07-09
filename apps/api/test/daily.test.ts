import { describe, expect, it } from 'vitest';

import { utcDateKey } from '../src/passages/daily.ts';

describe('utcDateKey', () => {
  it('is the UTC calendar date as YYYY-MM-DD', () => {
    expect(utcDateKey(new Date('2026-07-09T13:45:00Z'))).toBe('2026-07-09');
  });

  it('rolls over at UTC midnight, not local midnight', () => {
    // 23:30 in a +02:00 zone is already the next UTC day.
    expect(utcDateKey(new Date('2026-07-09T23:30:00+02:00'))).toBe('2026-07-09');
    expect(utcDateKey(new Date('2026-07-09T22:30:00Z'))).toBe('2026-07-09');
    expect(utcDateKey(new Date('2026-07-10T00:30:00Z'))).toBe('2026-07-10');
  });
});
