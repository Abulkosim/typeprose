/**
 * The "passage of the day" (Phase 3, plan §10.3) is chosen deterministically
 * from a date key so every visitor gets the same passage on a given day and it
 * changes at UTC midnight. The key is just the UTC calendar date.
 */
export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}
