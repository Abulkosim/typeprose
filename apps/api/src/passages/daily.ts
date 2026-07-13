/**
 * The "passage of the day" (Phase 3, plan §10.3) is chosen deterministically
 * from a date key so every visitor gets the same passage on a given day and it
 * changes at UTC midnight. The key is just the UTC calendar date.
 */
export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

/**
 * Shift a UTC date key by `days` (may be negative), used by the daily-streak
 * logic (Batch C §2.1) to test contiguity (e.g. "is `lastDate` yesterday?")
 * without hand-rolling calendar math.
 */
export function addDaysToUtcDateKey(key: string, days: number): string {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDateKey(date);
}
