import { addDaysToUtcDateKey } from '../passages/daily.ts';

/**
 * Pure daily-passage streak logic (Batch C §2.1). Kept free of DB access so it
 * is unit-testable with plain fixtures; the repository only stores/reads the
 * three `profiles` columns and calls these functions.
 */
export interface DailyStreakState {
  current: number;
  best: number;
  /** UTC date key ('YYYY-MM-DD') of the last daily completion, or null. */
  lastDate: string | null;
}

/**
 * Advance the streak for a daily completion on `todayKey`:
 * - Same day as the last completion: no-op (`extended: false`) - a same-day
 *   retype never inflates the streak.
 * - Last completion was yesterday: the streak continues (`current + 1`).
 * - Anything else (never completed, or a gap of 2+ days): reset to 1.
 * `best` and `lastDate` are always kept current on an extension.
 */
export function advanceDailyStreak(
  prev: DailyStreakState,
  todayKey: string,
): { state: DailyStreakState; extended: boolean } {
  if (prev.lastDate === todayKey) {
    return { state: prev, extended: false };
  }
  const yesterday = addDaysToUtcDateKey(todayKey, -1);
  const current = prev.lastDate === yesterday ? prev.current + 1 : 1;
  return {
    state: { current, best: Math.max(prev.best, current), lastDate: todayKey },
    extended: true,
  };
}

/**
 * The streak as it should display "right now" for `todayKey`, without
 * recording a completion (lazy reset): a streak stays visible through
 * yesterday (so it doesn't visually vanish before today's run lands) but
 * reads 0 once a day has been skipped.
 */
export function effectiveDailyStreak(
  state: DailyStreakState,
  todayKey: string,
): { current: number; best: number; completedToday: boolean } {
  const completedToday = state.lastDate === todayKey;
  const yesterday = addDaysToUtcDateKey(todayKey, -1);
  const stillLive = completedToday || state.lastDate === yesterday;
  return { current: stillLive ? state.current : 0, best: state.best, completedToday };
}

/** The state whose `lastDate` is later (a null `lastDate` is always earliest). */
function laterFirst(a: DailyStreakState, b: DailyStreakState): [DailyStreakState, DailyStreakState] {
  if (a.lastDate === null) return [b, a];
  if (b.lastDate === null) return [a, b];
  return a.lastDate >= b.lastDate ? [a, b] : [b, a];
}

/**
 * Merge two profiles' streak state on a claim (§10.3, Batch C §2.1): the
 * profile with the later `lastDate` wins as the base. Equal dates (both
 * completed the same day) take the larger `current` rather than double
 * counting. When the loser's chain ends exactly where the winner's began
 * (`loser.lastDate === winner.lastDate - winner.current` days), the two are
 * the same run split across profiles and are joined by addition; otherwise
 * the winner's `current` stands alone. `best` is always the max across both
 * inputs and the merged result.
 */
export function mergeDailyStreaks(a: DailyStreakState, b: DailyStreakState): DailyStreakState {
  const [winner, loser] = laterFirst(a, b);
  let current: number;
  if (winner.lastDate !== null && winner.lastDate === loser.lastDate) {
    current = Math.max(winner.current, loser.current);
  } else if (
    winner.lastDate !== null &&
    loser.lastDate === addDaysToUtcDateKey(winner.lastDate, -winner.current)
  ) {
    current = winner.current + loser.current;
  } else {
    current = winner.current;
  }
  return { current, best: Math.max(a.best, b.best, current), lastDate: winner.lastDate };
}
