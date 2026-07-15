import type { CharEvent, CharEvents } from '@typeprose/schema';
import { InvalidInputError } from './errors.ts';
import { parsePassage, type ParsedPassage } from './passage.ts';
import { statsFromState, type RunStats } from './replay.ts';
import { wordSnapshotOf, type WordSnapshot } from './snapshot.ts';
import {
  ADD_CORRECT,
  ADD_EXTRA,
  ADD_INCORRECT,
  DELETE,
  MAX_EXTRA_CHARS,
  SPACE_COMMIT,
  applyEvent,
  createRunState,
  type RunState,
  type WordRunState,
} from './state.ts';

/** Lifecycle per plan §7.1: idle until the first character keystroke. */
export type EngineStatus = 'idle' | 'running' | 'complete';

export type { WordSnapshot };

export interface EngineSnapshot {
  readonly status: EngineStatus;
  readonly passageText: string;
  readonly words: readonly WordSnapshot[];
  readonly activeWordIndex: number;
  /** Caret position within the active word: typed slots + extras. */
  readonly activeCharIndex: number;
  /** Caller-clock timestamp of the first character keystroke (null while idle). */
  readonly startedAtMs: number | null;
  /** Caller-clock timestamp of the completing keystroke (null until complete). */
  readonly completedAtMs: number | null;
  readonly eventCount: number;
}

/**
 * The incremental typing engine (plan §7). The browser drives it
 * keystroke-by-keystroke; every operation appends §7.5 events to the log, and
 * live stats are derived from the exact same reducer state a pure replay of
 * that log produces.
 *
 * Timestamps are caller-clock milliseconds (`performance.now()`); the engine
 * normalizes them to integer ms since the first character keystroke and
 * clamps them monotonic non-decreasing.
 */
export class TypingEngine {
  readonly passageText: string;
  readonly #passage: ParsedPassage;
  readonly #state: RunState;
  readonly #events: CharEvent[] = [];
  #firstTimestampMs: number | null = null;
  #completedAtMs: number | null = null;
  readonly #wordSnapshots: (WordSnapshot | null)[];

  /** @throws InvalidPassageError on empty or non-canonical passage text. */
  constructor(passageText: string) {
    this.#passage = parsePassage(passageText);
    this.passageText = this.#passage.text;
    this.#state = createRunState(this.#passage);
    this.#wordSnapshots = new Array<WordSnapshot | null>(this.#passage.words.length).fill(null);
  }

  get status(): EngineStatus {
    if (this.#state.completedAtT !== null) return 'complete';
    return this.#firstTimestampMs === null ? 'idle' : 'running';
  }

  /**
   * Type one printable character (never a space - route space through
   * {@link commitSpace}). Starts the timer on the first call (§7.1). Beyond a
   * word's length appends `extra` chars capped at +8; keypresses past the cap
   * are ignored but still logged and counted as incorrect (§7.2). Completes
   * the run when the last word's typed length reaches its target length,
   * regardless of correctness (§7.1). No-op once complete.
   *
   * @throws InvalidInputError on a non-single-character or space argument.
   */
  addChar(char: string, timestampMs: number): void {
    if (typeof char !== 'string' || char.length !== 1) {
      throw new InvalidInputError('addChar expects a single character');
    }
    if (char === ' ') {
      throw new InvalidInputError('space must go through commitSpace()');
    }
    this.#checkTimestamp(timestampMs);
    if (this.status === 'complete') return;
    if (this.#firstTimestampMs === null) this.#firstTimestampMs = timestampMs; // timer starts now
    const t = this.#normalize(timestampMs);
    const word = this.#activePassageWord();
    const ws = this.#activeWordState();
    const slots = ws.typed.length;
    let event: CharEvent;
    if (slots < word.text.length) {
      const target = this.passageText[word.start + slots];
      event = [t, word.start + slots, char === target ? ADD_CORRECT : ADD_INCORRECT];
    } else if (ws.extras.length < MAX_EXTRA_CHARS) {
      event = [t, word.end, ADD_EXTRA];
    } else {
      event = [t, word.end, ADD_INCORRECT]; // over-cap: ignored but counted incorrect
    }
    this.#apply(event, char);
    if (this.#state.completedAtT !== null) this.#completedAtMs = timestampMs;
  }

  /**
   * Press space: commits the current word and advances (§7.2); untyped
   * characters become `missed`. No-ops: while idle (space never starts the
   * timer), on an empty word, on the last word, and once complete.
   */
  commitSpace(timestampMs: number): void {
    this.#checkTimestamp(timestampMs);
    if (this.status !== 'running') return;
    const wi = this.#state.activeWord;
    if (wi === this.#passage.words.length - 1) return; // no trailing space in quote mode
    const ws = this.#activeWordState();
    if (ws.typed.length + ws.extras.length === 0) return;
    const word = this.#activePassageWord();
    this.#apply([this.#normalize(timestampMs), word.end, SPACE_COMMIT]);
  }

  /**
   * Press backspace. Always allowed within the current word (extras first);
   * crossing into the previous word is allowed only if that word was
   * committed with errors (a fully correct previous word makes this a no-op).
   * `wholeWord` (Ctrl/Alt+Backspace) clears the current word's typed input;
   * on an empty word it falls back to the single-step crossing rule. Never a
   * keypress for accuracy. No-op while idle or complete.
   */
  backspace(timestampMs: number, opts?: { wholeWord?: boolean }): void {
    this.#checkTimestamp(timestampMs);
    if (this.status !== 'running') return;
    const t = this.#normalize(timestampMs);
    const word = this.#activePassageWord();
    const ws = this.#activeWordState();
    const slots = ws.typed.length;
    const extras = ws.extras.length;

    if (opts?.wholeWord === true && slots + extras > 0) {
      for (let k = 0; k < extras; k += 1) this.#apply([t, word.end, DELETE]);
      for (let s = slots - 1; s >= 0; s -= 1) this.#apply([t, word.start + s, DELETE]);
      return;
    }
    if (extras > 0) {
      this.#apply([t, word.end, DELETE]);
      return;
    }
    if (slots > 0) {
      this.#apply([t, word.start + slots - 1, DELETE]);
      return;
    }
    const wi = this.#state.activeWord;
    const prev = wi > 0 ? this.#state.words[wi - 1] : undefined;
    const prevWord = wi > 0 ? this.#passage.words[wi - 1] : undefined;
    if (prev !== undefined && prevWord !== undefined && prev.committed && !prev.committedCorrect) {
      this.#apply([t, prevWord.end, DELETE]); // uncommit: re-open the error word
    }
    // else: previous word fully correct (or none) → no-op, nothing logged
  }

  /** The §7.5 wire-format log (a defensive copy; safe to serialize/submit). */
  getLog(): CharEvents {
    const events: CharEvent[] = this.#events.map((e) => [e[0], e[1], e[2]]);
    return { v: 1, events };
  }

  /**
   * Live §7.3 stats. Identical by construction to
   * `computeStats(passageText, getLog())`: both derive from the same reducer.
   * While idle: 0 wpm/raw, accuracy 100, consistency 100, durationMs 0.
   */
  getStats(): RunStats {
    return statsFromState(this.#passage, this.#state);
  }

  /**
   * Render snapshot. The top-level object and `words` array are fresh per
   * call, but unchanged {@link WordSnapshot} entries keep reference identity.
   */
  getSnapshot(): EngineSnapshot {
    const ws = this.#activeWordState();
    return {
      status: this.status,
      passageText: this.passageText,
      words: this.#passage.words.map((_, wi) => this.#wordSnapshot(wi)),
      activeWordIndex: this.#state.activeWord,
      activeCharIndex: ws.typed.length + ws.extras.length,
      startedAtMs: this.#firstTimestampMs,
      completedAtMs: this.#completedAtMs,
      eventCount: this.#state.eventCount,
    };
  }

  #checkTimestamp(timestampMs: number): void {
    if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs)) {
      throw new InvalidInputError('timestampMs must be a finite number');
    }
  }

  /** Integer ms since first keystroke, clamped monotonic non-decreasing. */
  #normalize(timestampMs: number): number {
    const first = this.#firstTimestampMs ?? timestampMs;
    return Math.max(this.#state.lastT, Math.max(0, Math.round(timestampMs - first)));
  }

  #apply(event: CharEvent, typedChar?: string): void {
    const result = applyEvent(this.#passage, this.#state, event, typedChar);
    this.#events.push(event);
    this.#wordSnapshots[result.wordIndex] = null; // invalidate the touched word
  }

  #activePassageWord(): ParsedPassage['words'][number] {
    return this.#passage.words[this.#state.activeWord] as ParsedPassage['words'][number];
  }

  #activeWordState(): WordRunState {
    return this.#state.words[this.#state.activeWord] as WordRunState;
  }

  #wordSnapshot(wi: number): WordSnapshot {
    const cached = this.#wordSnapshots[wi];
    if (cached !== null && cached !== undefined) return cached;
    const word = this.#passage.words[wi] as ParsedPassage['words'][number];
    const ws = this.#state.words[wi] as WordRunState;
    const snapshot = wordSnapshotOf(word, ws, wi);
    this.#wordSnapshots[wi] = snapshot;
    return snapshot;
  }
}

/**
 * Create an incremental engine for a passage (plan §7.1 lifecycle).
 *
 * @throws InvalidPassageError on empty or non-canonical passage text.
 */
export function createEngine(passageText: string): TypingEngine {
  return new TypingEngine(passageText);
}
