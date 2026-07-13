import { describe, expect, it } from 'vitest';
import { addDaysToUtcDateKey } from '../src/passages/daily.ts';
import {
  advanceDailyStreak,
  effectiveDailyStreak,
  mergeDailyStreaks,
  type DailyStreakState,
} from '../src/profiles/streak.ts';

const NEVER: DailyStreakState = { current: 0, best: 0, lastDate: null };

describe('advanceDailyStreak', () => {
  it('starts a first-ever streak at 1', () => {
    const { state, extended } = advanceDailyStreak(NEVER, '2026-07-10');
    expect(extended).toBe(true);
    expect(state).toEqual({ current: 1, best: 1, lastDate: '2026-07-10' });
  });

  it('extends a streak by 1 when the last completion was yesterday', () => {
    const prev: DailyStreakState = { current: 3, best: 5, lastDate: '2026-07-09' };
    const { state, extended } = advanceDailyStreak(prev, '2026-07-10');
    expect(extended).toBe(true);
    expect(state).toEqual({ current: 4, best: 5, lastDate: '2026-07-10' });
  });

  it('is a no-op on a same-day retype (never inflates the streak)', () => {
    const prev: DailyStreakState = { current: 3, best: 5, lastDate: '2026-07-10' };
    const { state, extended } = advanceDailyStreak(prev, '2026-07-10');
    expect(extended).toBe(false);
    expect(state).toEqual(prev);
  });

  it('resets to 1 after a gap, preserving best', () => {
    const prev: DailyStreakState = { current: 5, best: 5, lastDate: '2026-07-01' };
    const { state, extended } = advanceDailyStreak(prev, '2026-07-10');
    expect(extended).toBe(true);
    expect(state).toEqual({ current: 1, best: 5, lastDate: '2026-07-10' });
  });

  it('raises best when a new streak exceeds the old one', () => {
    const prev: DailyStreakState = { current: 2, best: 2, lastDate: '2026-07-09' };
    const { state } = advanceDailyStreak(prev, '2026-07-10');
    expect(state.best).toBe(3);
  });
});

describe('effectiveDailyStreak', () => {
  it('reads the stored current when completed today', () => {
    const state: DailyStreakState = { current: 4, best: 6, lastDate: '2026-07-10' };
    expect(effectiveDailyStreak(state, '2026-07-10')).toEqual({
      current: 4,
      best: 6,
      completedToday: true,
    });
  });

  it('keeps the streak visible when the last completion was yesterday', () => {
    const state: DailyStreakState = { current: 4, best: 6, lastDate: '2026-07-09' };
    expect(effectiveDailyStreak(state, '2026-07-10')).toEqual({
      current: 4,
      best: 6,
      completedToday: false,
    });
  });

  it('lazily resets current to 0 once a day has been skipped', () => {
    const state: DailyStreakState = { current: 4, best: 6, lastDate: '2026-07-01' };
    expect(effectiveDailyStreak(state, '2026-07-10')).toEqual({
      current: 0,
      best: 6,
      completedToday: false,
    });
  });

  it('reads zero for a profile that has never completed a daily', () => {
    expect(effectiveDailyStreak(NEVER, '2026-07-10')).toEqual({
      current: 0,
      best: 0,
      completedToday: false,
    });
  });
});

describe('mergeDailyStreaks', () => {
  it('takes the real streak over one that never started', () => {
    const real: DailyStreakState = { current: 3, best: 5, lastDate: '2026-07-10' };
    expect(mergeDailyStreaks(NEVER, real)).toEqual(real);
    expect(mergeDailyStreaks(real, NEVER)).toEqual(real);
  });

  it('the later lastDate wins when the gap is non-contiguous', () => {
    const older: DailyStreakState = { current: 2, best: 2, lastDate: '2026-07-05' };
    const newer: DailyStreakState = { current: 1, best: 1, lastDate: '2026-07-10' };
    expect(mergeDailyStreaks(older, newer)).toEqual({ current: 1, best: 2, lastDate: '2026-07-10' });
  });

  it('takes the max current on equal dates rather than double-counting', () => {
    const a: DailyStreakState = { current: 2, best: 4, lastDate: '2026-07-10' };
    const b: DailyStreakState = { current: 6, best: 6, lastDate: '2026-07-10' };
    expect(mergeDailyStreaks(a, b)).toEqual({ current: 6, best: 6, lastDate: '2026-07-10' });
  });

  it('joins two contiguous chains split across profiles', () => {
    // winner's streak of 3 started on 07-08 (10 - 3 days); loser's chain ends
    // exactly there, so the two are one continuous run.
    const winner: DailyStreakState = { current: 3, best: 3, lastDate: '2026-07-10' };
    const loser: DailyStreakState = { current: 4, best: 4, lastDate: '2026-07-07' };
    expect(mergeDailyStreaks(winner, loser)).toEqual({ current: 7, best: 7, lastDate: '2026-07-10' });
  });

  it('best is the max across both inputs and the merged current', () => {
    const winner: DailyStreakState = { current: 1, best: 20, lastDate: '2026-07-10' };
    const loser: DailyStreakState = { current: 1, best: 1, lastDate: '2026-07-01' };
    expect(mergeDailyStreaks(winner, loser).best).toBe(20);
  });
});

describe('addDaysToUtcDateKey', () => {
  it('crosses a month boundary', () => {
    expect(addDaysToUtcDateKey('2026-07-31', 1)).toBe('2026-08-01');
  });

  it('crosses a year boundary', () => {
    expect(addDaysToUtcDateKey('2025-12-31', 1)).toBe('2026-01-01');
  });

  it('handles a leap-year February', () => {
    expect(addDaysToUtcDateKey('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysToUtcDateKey('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('handles a non-leap-year February', () => {
    expect(addDaysToUtcDateKey('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('supports negative offsets', () => {
    expect(addDaysToUtcDateKey('2026-01-01', -1)).toBe('2025-12-31');
  });
});
