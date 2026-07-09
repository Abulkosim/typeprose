import {
  createEngine,
  type EngineSnapshot,
  type RunStats,
  type TypingEngine,
} from '@prosetype/engine';
import type { Passage } from '@prosetype/schema';
import { create } from 'zustand';

import { fetchDailyPassage, fetchNextPassage, submitResult, type PassageQuery } from '../lib/api';
import { ensureProfileId } from '../lib/profile';
import { pushRecent } from '../lib/recent';
import type { CompletedRun } from '../result/ResultView';

/** §9.3 completion: hold the finished passage briefly, then cut to the result. */
export const COMPLETION_HOLD_MS = 300;

export type StagePhase = 'loading' | 'error' | 'typing' | 'complete';

/** Result-submission state (§9.5). Only 'not-saved' surfaces in the UI. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'not-saved';

/**
 * Thin zustand store wrapping the engine (plan §3). The engine is the source
 * of truth: input handlers append to it synchronously (with the
 * `performance.now()` captured in the DOM handler) and React renders from the
 * derived `snapshot`. Nothing here does stat math of its own.
 */
interface TypingState {
  phase: StagePhase;
  passage: Passage | null;
  /** The live engine — mutated in place; never render from it directly. */
  engine: TypingEngine | null;
  /** Derived render state; replaced after every applied input. */
  snapshot: EngineSnapshot | null;
  completedRun: CompletedRun | null;
  errorMessage: string | null;
  /** True when the current run followed an esc-restart of the same passage (§7.1). */
  restarted: boolean;
  capsLock: boolean;
  /** Result-submission state for the current run (§9.5). */
  saveStatus: SaveStatus;
  /** Active library filter (§9.1); reused across Tab so a pick "sticks". */
  filter: PassageQuery;
  /** Up to the last 20 passage ids, excluded from the next fetch (plan §8). */
  recentIds: readonly number[];
  /**
   * Tab: abandon the current run and fetch a new random passage. An optional
   * filter replaces the active one (a library pick); omitting it reuses the
   * current filter so the pick persists across Tab.
   */
  loadNext: (filter?: PassageQuery) => Promise<void>;
  /** Load the deterministic passage of the day (§10.3). */
  loadDaily: () => Promise<void>;
  /** Esc: restart the same passage from scratch. */
  restart: () => void;
  typeChar: (char: string, timestampMs: number) => void;
  commitSpace: (timestampMs: number) => void;
  backspace: (timestampMs: number, wholeWord: boolean) => void;
  setCapsLock: (on: boolean) => void;
  /** Live §7.3 stats for the HUD (display only — never used for stat math). */
  getLiveStats: () => RunStats | null;
}

let inFlight = false;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
/**
 * Invalidation token for in-flight submissions: loading/restarting a run bumps
 * it so a late submit resolution can't set a stale save status on a run the
 * user already left.
 */
let submitToken = 0;

function clearHold(): void {
  if (holdTimer !== null) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
}

/**
 * Shared passage-load flow for loadNext/loadDaily: guard concurrent fetches,
 * invalidate any in-flight submission, reset to a fresh idle engine on success
 * or a quiet error phase on failure. `fetchPassage` decides which passage.
 */
async function loadInto(
  set: (partial: Partial<TypingState>) => void,
  get: () => TypingState,
  nextFilter: PassageQuery,
  fetchPassage: () => Promise<Passage>,
): Promise<void> {
  if (inFlight) return; // one fetch at a time (also guards StrictMode's double effect)
  inFlight = true;
  submitToken += 1; // invalidate any in-flight submission for the old run
  clearHold();
  set({
    phase: 'loading',
    engine: null,
    snapshot: null,
    completedRun: null,
    errorMessage: null,
    restarted: false,
    saveStatus: 'idle',
    filter: nextFilter,
  });
  try {
    const passage = await fetchPassage();
    const engine = createEngine(passage.text);
    set({
      phase: 'typing',
      passage,
      engine,
      snapshot: engine.getSnapshot(),
      recentIds: pushRecent(get().recentIds, passage.id),
    });
  } catch {
    set({ phase: 'error', passage: null, errorMessage: 'could not load a passage' });
  } finally {
    inFlight = false;
  }
}

/** Submit a finished run fire-and-forget with one retry (§9.5). */
async function submitCompletedRun(
  passageId: number,
  run: CompletedRun,
  token: number,
  set: (partial: Partial<TypingState>) => void,
): Promise<void> {
  const attempt = (): Promise<unknown> =>
    ensureProfileId().then((profileId) =>
      submitResult({
        profileId,
        passageId,
        clientStats: run.stats,
        charEvents: run.log,
      }),
    );
  try {
    try {
      await attempt();
    } catch {
      await attempt(); // one retry (§9.5)
    }
    if (token === submitToken) set({ saveStatus: 'saved' });
  } catch {
    if (token === submitToken) set({ saveStatus: 'not-saved' });
  }
}

export const useTypingStore = create<TypingState>()((set, get) => ({
  phase: 'loading',
  passage: null,
  engine: null,
  snapshot: null,
  completedRun: null,
  errorMessage: null,
  restarted: false,
  capsLock: false,
  saveStatus: 'idle',
  filter: {},
  recentIds: [],

  loadNext: async (filter?: PassageQuery) => {
    const nextFilter = filter ?? get().filter;
    await loadInto(set, get, nextFilter, () => fetchNextPassage(get().recentIds, nextFilter));
  },

  loadDaily: async () => {
    // Clearing the filter so a later bare Tab loads a normal random passage.
    await loadInto(set, get, {}, () => fetchDailyPassage());
  },

  restart: () => {
    const { passage, snapshot } = get();
    if (passage === null) return;
    submitToken += 1; // invalidate any in-flight submission for the abandoned run
    clearHold();
    const engine = createEngine(passage.text);
    set({
      phase: 'typing',
      engine,
      snapshot: engine.getSnapshot(),
      completedRun: null,
      saveStatus: 'idle',
      // Mark restarted only when a run of this passage had actually started.
      restarted: get().restarted || (snapshot !== null && snapshot.status !== 'idle'),
    });
  },

  typeChar: (char, timestampMs) => {
    const { engine, phase } = get();
    if (engine === null || phase !== 'typing') return;
    // Engine chars are single UTF-16 code units; non-BMP input (emoji etc.)
    // can never be correct against an ASCII passage and is skipped.
    if (char.length !== 1 || char === ' ') return;
    engine.addChar(char, timestampMs);
    const snapshot = engine.getSnapshot();
    set({ snapshot });
    if (snapshot.status === 'complete' && holdTimer === null) {
      const completedRun: CompletedRun = {
        stats: engine.getStats(),
        log: engine.getLog(),
        restarted: get().restarted,
      };
      const passageId = get().passage?.id;
      // Submit as soon as the run finishes (§9.5, fire-and-forget), before the
      // result view even appears; the token guards against a stale resolution.
      if (passageId !== undefined) {
        set({ saveStatus: 'saving' });
        void submitCompletedRun(passageId, completedRun, submitToken, set);
      }
      holdTimer = setTimeout(() => {
        holdTimer = null;
        set({ phase: 'complete', completedRun });
      }, COMPLETION_HOLD_MS);
    }
  },

  commitSpace: (timestampMs) => {
    const { engine, phase } = get();
    if (engine === null || phase !== 'typing') return;
    engine.commitSpace(timestampMs);
    set({ snapshot: engine.getSnapshot() });
  },

  backspace: (timestampMs, wholeWord) => {
    const { engine, phase } = get();
    if (engine === null || phase !== 'typing') return;
    engine.backspace(timestampMs, { wholeWord });
    set({ snapshot: engine.getSnapshot() });
  },

  setCapsLock: (on) => {
    if (get().capsLock !== on) set({ capsLock: on });
  },

  getLiveStats: () => get().engine?.getStats() ?? null,
}));

/** Reset module-level timers/flags and store state. Test helper only. */
export function resetTypingStore(): void {
  clearHold();
  inFlight = false;
  submitToken += 1;
  useTypingStore.setState({
    phase: 'loading',
    passage: null,
    engine: null,
    snapshot: null,
    completedRun: null,
    errorMessage: null,
    restarted: false,
    capsLock: false,
    saveStatus: 'idle',
    filter: {},
    recentIds: [],
  });
}
