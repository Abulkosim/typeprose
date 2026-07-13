import {
  createEngine,
  type EngineSnapshot,
  type RunStats,
  type TypingEngine,
} from '@prosetype/engine';
import type { Passage, PostResultsResponse } from '@prosetype/schema';
import { create } from 'zustand';

import {
  fetchDailyPassage,
  fetchNextPassage,
  submitResult,
  submitWordResult,
  type PassageQuery,
} from '../lib/api';
import { ensureProfileId } from '../lib/profile';
import { pushRecent } from '../lib/recent';
import { generateWordText } from '../lib/words';
import { useModeStore } from '../settings/mode';
import type { CompletedRun } from '../result/ResultView';

/** §9.3 completion: hold the finished passage briefly, then cut to the result. */
export const COMPLETION_HOLD_MS = 300;

export type StagePhase = 'loading' | 'error' | 'typing' | 'complete';

/**
 * The active test: either a curated corpus passage ('prose', keyed on a server
 * id for submission + attribution) or a generated random-word set ('words').
 * Both expose the canonical `text` the engine consumes.
 */
export type ActiveTest =
  | { kind: 'passage'; passage: Passage }
  | { kind: 'words'; text: string; count: number };

/** The engine input for a test, regardless of kind. */
function testText(test: ActiveTest): string {
  return test.kind === 'passage' ? test.passage.text : test.text;
}

/** Result-submission state (§9.5). Only 'not-saved' surfaces in the UI. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'not-saved';

/**
 * Personal-best info for the just-submitted run, straight from the server's
 * POST /results response. Arrives after `saveStatus` becomes 'saved' - the
 * submission is fire-and-forget and often resolves after the result view is
 * already showing, so the result view reads this reactively from the store
 * rather than as a prop frozen at completion time.
 */
export interface BestInfo {
  isNewBest: boolean;
  previousBestWpm: number | null;
  isNewPassageBest: boolean;
  previousPassageBestWpm: number | null;
}

/**
 * Thin zustand store wrapping the engine (plan §3). The engine is the source
 * of truth: input handlers append to it synchronously (with the
 * `performance.now()` captured in the DOM handler) and React renders from the
 * derived `snapshot`. Nothing here does stat math of its own.
 */
interface TypingState {
  phase: StagePhase;
  /** The active test (prose passage or generated word set), or null before load. */
  test: ActiveTest | null;
  /** The live engine - mutated in place; never render from it directly. */
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
  /** Personal-best info for the current run, populated once the submission resolves. */
  bestInfo: BestInfo | null;
  /** Active library filter (§9.1); reused across Tab so a pick "sticks". */
  filter: PassageQuery;
  /** Up to the last 20 passage ids, excluded from the next fetch (plan §8). */
  recentIds: readonly number[];
  /**
   * Tab: abandon the current run and start a new one. With no filter it follows
   * the persisted mode - a fresh word set in word mode, else a random passage
   * reusing the current filter so a library pick persists across Tab. A filter
   * argument (a library pick) always forces prose and replaces the active filter.
   */
  loadNext: (filter?: PassageQuery) => Promise<void>;
  /** Load the deterministic passage of the day (§10.3); forces prose mode. */
  loadDaily: () => Promise<void>;
  /** Esc: restart the same passage from scratch. */
  restart: () => void;
  typeChar: (char: string, timestampMs: number) => void;
  commitSpace: (timestampMs: number) => void;
  backspace: (timestampMs: number, wholeWord: boolean) => void;
  setCapsLock: (on: boolean) => void;
  /** Live §7.3 stats for the HUD (display only - never used for stat math). */
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
 * Shared load flow for loadNext/loadDaily: guard concurrent loads, invalidate
 * any in-flight submission, reset to a fresh idle engine on success or a quiet
 * error phase on failure. `resolveTest` decides which test (a fetched passage or
 * a locally generated word set). Only passage runs update `recentIds`.
 */
async function loadInto(
  set: (partial: Partial<TypingState>) => void,
  get: () => TypingState,
  nextFilter: PassageQuery,
  resolveTest: () => Promise<ActiveTest>,
): Promise<void> {
  if (inFlight) return; // one load at a time (also guards StrictMode's double effect)
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
    bestInfo: null,
    filter: nextFilter,
  });
  try {
    const test = await resolveTest();
    const engine = createEngine(testText(test));
    set({
      phase: 'typing',
      test,
      engine,
      snapshot: engine.getSnapshot(),
      recentIds:
        test.kind === 'passage' ? pushRecent(get().recentIds, test.passage.id) : get().recentIds,
    });
  } catch {
    set({ phase: 'error', test: null, errorMessage: 'could not load a test' });
  } finally {
    inFlight = false;
  }
}

/** Submit a finished run fire-and-forget with one retry (§9.5). */
async function submitCompletedRun(
  test: ActiveTest,
  run: CompletedRun,
  token: number,
  set: (partial: Partial<TypingState>) => void,
): Promise<void> {
  const attempt = (): Promise<PostResultsResponse> =>
    ensureProfileId().then((profileId) =>
      test.kind === 'passage'
        ? submitResult({
            profileId,
            passageId: test.passage.id,
            clientStats: run.stats,
            charEvents: run.log,
          })
        : submitWordResult({
            profileId,
            text: test.text,
            clientStats: run.stats,
            charEvents: run.log,
          }),
    );
  try {
    let response: PostResultsResponse;
    try {
      response = await attempt();
    } catch {
      response = await attempt(); // one retry (§9.5)
    }
    if (token === submitToken) {
      set({
        saveStatus: 'saved',
        bestInfo: {
          isNewBest: response.isNewBest,
          previousBestWpm: response.previousBestWpm,
          isNewPassageBest: response.isNewPassageBest,
          previousPassageBestWpm: response.previousPassageBestWpm,
        },
      });
    }
  } catch {
    if (token === submitToken) set({ saveStatus: 'not-saved' });
  }
}

export const useTypingStore = create<TypingState>()((set, get) => ({
  phase: 'loading',
  test: null,
  engine: null,
  snapshot: null,
  completedRun: null,
  errorMessage: null,
  restarted: false,
  capsLock: false,
  saveStatus: 'idle',
  bestInfo: null,
  filter: {},
  recentIds: [],

  loadNext: async (filter?: PassageQuery) => {
    // An explicit filter (a library/band pick) always forces prose and sticks.
    if (filter !== undefined) {
      useModeStore.getState().setMode('prose');
      await loadInto(set, get, filter, async () => ({
        kind: 'passage',
        passage: await fetchNextPassage(get().recentIds, filter),
      }));
      return;
    }
    // No filter: follow the persisted mode.
    const { mode, wordCount } = useModeStore.getState();
    if (mode === 'words') {
      await loadInto(set, get, {}, () =>
        Promise.resolve({ kind: 'words', text: generateWordText(wordCount), count: wordCount }),
      );
      return;
    }
    const nextFilter = get().filter;
    await loadInto(set, get, nextFilter, async () => ({
      kind: 'passage',
      passage: await fetchNextPassage(get().recentIds, nextFilter),
    }));
  },

  loadDaily: async () => {
    // The daily is a prose passage; switch to prose and clear the filter so a
    // later bare Tab loads a normal random passage rather than a word set.
    useModeStore.getState().setMode('prose');
    await loadInto(set, get, {}, async () => ({ kind: 'passage', passage: await fetchDailyPassage() }));
  },

  restart: () => {
    const { test, snapshot } = get();
    if (test === null) return;
    submitToken += 1; // invalidate any in-flight submission for the abandoned run
    clearHold();
    const engine = createEngine(testText(test));
    set({
      phase: 'typing',
      engine,
      snapshot: engine.getSnapshot(),
      completedRun: null,
      saveStatus: 'idle',
      bestInfo: null,
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
      const test = get().test;
      // Submit as soon as the run finishes (§9.5, fire-and-forget), before the
      // result view even appears; the token guards against a stale resolution.
      // Prose runs submit against their passage id; word runs against their text.
      if (test !== null) {
        set({ saveStatus: 'saving' });
        void submitCompletedRun(test, completedRun, submitToken, set);
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
    test: null,
    engine: null,
    snapshot: null,
    completedRun: null,
    errorMessage: null,
    restarted: false,
    capsLock: false,
    saveStatus: 'idle',
    bestInfo: null,
    filter: {},
    recentIds: [],
  });
}
