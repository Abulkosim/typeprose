/**
 * Typed engine errors (plan §11: malformed logs must throw typed errors).
 *
 * Hierarchy:
 *   EngineError
 *   ├─ InvalidPassageError      : passage text is not canonical (§6.2 shape)
 *   ├─ InvalidInputError        : programmer error driving the live engine API
 *   └─ MalformedLogError        : a charEvents log cannot be replayed
 *      ├─ NonMonotonicTimestampError
 *      ├─ IndexOutOfRangeError
 *      ├─ EventAfterCompletionError
 *      ├─ UnknownEventCodeError
 *      └─ InvalidEventError     : event is inconsistent with the replayed state
 */
export class EngineError extends Error {
  override name = 'EngineError';
}

/** The passage text is empty or not in canonical single-spaced form. */
export class InvalidPassageError extends EngineError {
  override name = 'InvalidPassageError';
}

/** The live engine API was called with invalid arguments (programmer error). */
export class InvalidInputError extends EngineError {
  override name = 'InvalidInputError';
}

/** Base for all replay failures on a malformed charEvents log. */
export class MalformedLogError extends EngineError {
  override name = 'MalformedLogError';
}

/** Event timestamps decreased (must be monotonic non-decreasing). */
export class NonMonotonicTimestampError extends MalformedLogError {
  override name = 'NonMonotonicTimestampError';
}

/** An event's character index is outside the passage. */
export class IndexOutOfRangeError extends MalformedLogError {
  override name = 'IndexOutOfRangeError';
}

/** The log contains events after the run completed. */
export class EventAfterCompletionError extends MalformedLogError {
  override name = 'EventAfterCompletionError';
}

/** An event code is not one of 0..4. */
export class UnknownEventCodeError extends MalformedLogError {
  override name = 'UnknownEventCodeError';
}

/** An event is structurally valid but inconsistent with the replayed run state. */
export class InvalidEventError extends MalformedLogError {
  override name = 'InvalidEventError';
}
