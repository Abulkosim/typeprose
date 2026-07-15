import type { CharEvent, CharEvents } from '@typeprose/schema';
import type { EngineSnapshot, EngineStatus } from './engine.ts';
import { MalformedLogError } from './errors.ts';
import { parsePassage, type ParsedPassage } from './passage.ts';
import { wordSnapshotOf, type WordSnapshot } from './snapshot.ts';
import { applyEvent, createRunState, type RunState, type WordRunState } from './state.ts';

/**
 * Drives a stored §7.5 charEvents log against a virtual clock, for the
 * "watch replay" result-view action (plan §3.2/§9.3). Reuses the exact
 * reducer ({@link applyEvent}) the live `TypingEngine` and the pure
 * `replayEvents` share, so a snapshot taken after `advanceTo(Infinity)` is
 * identical to the live engine's own final snapshot for the same inputs.
 *
 * Known cosmetic limit: the wire log carries no typed characters, so
 * replayed incorrect slots show the target char (`Word.tsx` already renders
 * incorrect slots this way) and replayed extras render as the reducer's
 * blank-ish placeholder char - acceptable, extras are rare.
 */
export class ReplayEngine {
  readonly passageText: string;
  readonly #passage: ParsedPassage;
  readonly #events: readonly CharEvent[];
  #state: RunState;
  #cursor = 0;
  #wordSnapshots: (WordSnapshot | null)[];

  /** @throws InvalidPassageError | MalformedLogError */
  constructor(passageText: string, log: CharEvents) {
    this.#passage = parsePassage(passageText);
    this.passageText = this.#passage.text;
    if ((log.v as number) !== 1) {
      throw new MalformedLogError(`unsupported charEvents version ${String(log.v)}`);
    }
    this.#events = log.events.map((e): CharEvent => [e[0], e[1], e[2]]);
    this.#state = createRunState(this.#passage);
    this.#wordSnapshots = new Array<WordSnapshot | null>(this.#passage.words.length).fill(null);
  }

  /** Timestamp of the last event (0 for an empty log). */
  get durationMs(): number {
    const last = this.#events[this.#events.length - 1];
    return last === undefined ? 0 : last[0];
  }

  /** True once every event in the log has been applied. */
  get done(): boolean {
    return this.#cursor >= this.#events.length;
  }

  /**
   * Apply every unapplied event with `t <= tMs`, in log order.
   *
   * @returns true iff at least one event was applied.
   * @throws MalformedLogError subclasses if the stored log cannot be replayed
   *   (same family {@link applyEvent} throws for a live/pure replay).
   */
  advanceTo(tMs: number): boolean {
    let applied = false;
    while (this.#cursor < this.#events.length) {
      const event = this.#events[this.#cursor] as CharEvent;
      if (event[0] > tMs) break;
      const result = applyEvent(this.#passage, this.#state, event);
      this.#wordSnapshots[result.wordIndex] = null; // invalidate the touched word
      this.#cursor += 1;
      applied = true;
    }
    return applied;
  }

  /**
   * Render snapshot, same shape `PassageBoard` consumes from the live
   * engine. `status`: 'idle' before any event has been applied, 'complete'
   * once the log is exhausted and the run actually completed, 'running'
   * otherwise (including the defensive case of an exhausted log that never
   * reached completion - a real log always ends with the completing
   * keystroke, but a hand-built one might not).
   */
  getSnapshot(): EngineSnapshot {
    const ws = this.#activeWordState();
    const status: EngineStatus =
      this.#cursor === 0 ? 'idle' : this.done && this.#state.completedAtT !== null ? 'complete' : 'running';
    return {
      status,
      passageText: this.passageText,
      words: this.#passage.words.map((_, wi) => this.#wordSnapshot(wi)),
      activeWordIndex: this.#state.activeWord,
      activeCharIndex: ws.typed.length + ws.extras.length,
      startedAtMs: this.#cursor === 0 ? null : 0,
      completedAtMs: this.#state.completedAtT,
      eventCount: this.#state.eventCount,
    };
  }

  /** Reset to the pre-first-event state (for "watch again"). */
  restart(): void {
    this.#state = createRunState(this.#passage);
    this.#cursor = 0;
    this.#wordSnapshots = new Array<WordSnapshot | null>(this.#passage.words.length).fill(null);
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
 * Create a replay driver for a stored charEvents log.
 *
 * @throws InvalidPassageError | MalformedLogError
 */
export function createReplayEngine(passageText: string, log: CharEvents): ReplayEngine {
  return new ReplayEngine(passageText, log);
}
