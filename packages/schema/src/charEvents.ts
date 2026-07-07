import { z } from 'zod';

/** Wire format version for the keystroke log (plan §7.5). */
export const CHAR_EVENTS_VERSION = 1;

/** Hard cap on the number of events in one log (plan §7.5). */
export const MAX_CHAR_EVENTS = 6000;

/** Hard cap on the serialized (JSON, UTF-8) size of one log (plan §7.5). */
export const MAX_CHAR_EVENTS_BYTES = 64 * 1024;

/** Event codes: what happened at character index `i` (plan §7.5). */
export const CharEventCode = {
  AddCorrect: 0,
  AddIncorrect: 1,
  Delete: 2,
  AddExtra: 3,
  SpaceCommit: 4,
} as const;

export type CharEventCodeValue = (typeof CharEventCode)[keyof typeof CharEventCode];

/**
 * One keystroke event as a compact tuple `[t, i, c]`:
 * - `t` = ms since first keystroke (int, monotonic non-decreasing across the log)
 * - `i` = character index in the passage the event applies to (int, >= 0)
 * - `c` = event code 0..4 (see {@link CharEventCode})
 */
export const charEventSchema = z.tuple([
  z.int().nonnegative(),
  z.int().nonnegative(),
  z.int().min(0).max(4),
]);

export type CharEvent = z.infer<typeof charEventSchema>;

/**
 * The full keystroke log wire format v1 (plan §7.5).
 * Caps encoded as refinements: <= 6000 events, <= 64KB serialized,
 * timestamps monotonic non-decreasing.
 */
export const charEventsSchema = z
  .object({
    v: z.literal(CHAR_EVENTS_VERSION),
    events: z.array(charEventSchema).max(MAX_CHAR_EVENTS),
  })
  .superRefine((log, ctx) => {
    let prev = 0;
    for (const [idx, event] of log.events.entries()) {
      const t = event[0];
      if (t < prev) {
        ctx.addIssue({
          code: 'custom',
          message: `event timestamps must be monotonic non-decreasing (event ${idx}: ${t} < ${prev})`,
          path: ['events', idx, 0],
        });
        return;
      }
      prev = t;
    }
    const bytes = new TextEncoder().encode(JSON.stringify(log)).length;
    if (bytes > MAX_CHAR_EVENTS_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: `serialized charEvents must be <= ${MAX_CHAR_EVENTS_BYTES} bytes (got ${bytes})`,
        path: ['events'],
      });
    }
  });

export type CharEvents = z.infer<typeof charEventsSchema>;
