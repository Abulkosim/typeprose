import type { Passage, ProfileStats } from '@typeprose/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PROFILE_STORAGE_KEY } from '../src/lib/profile';
import { useModeStore } from '../src/settings/mode';
import { COMPLETION_HOLD_MS, resetTypingStore, useTypingStore } from '../src/stage/typingStore';

function makePassage(id: number, text: string): Passage {
  return {
    id,
    text,
    charCount: text.length,
    wordCount: text.split(' ').length,
    difficulty: 30,
    band: 'standard',
    themes: ['aphorisms'],
    language: 'en',
    work: { slug: 'work', title: 'A Work', translator: null, pubYear: 1900 },
    author: { slug: 'author', name: 'An Author', era: null },
  };
}

/** A minimal but schema-valid ProfileStats fixture (Batch C §2.2 drill tests). */
function makeStats(overrides: Partial<ProfileStats> = {}): ProfileStats {
  return {
    totals: { tests: 5, timeTypedMs: 100000 },
    bestWpm: null,
    avgWpmLast10: null,
    avgAccuracy: null,
    avgConsistency: null,
    punctuationTaxAvgPct: null,
    perAuthor: [],
    history: [],
    keyStats: [{ key: 'e', occurrences: 10, errors: 5, errorRate: 50, avgLatencyMs: 200 }],
    bigramStats: [],
    dailyStreak: { current: 0, best: 0, completedToday: false },
    ...overrides,
  };
}

/** Pre-seed `typeprose.profileId` so `ensureProfileId` resolves without a POST /profiles call. */
function installProfileStorage(profileId: string): void {
  const store = new Map<string, string>([[PROFILE_STORAGE_KEY, profileId]]);
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage;
}

let fetchedUrls: string[] = [];

/** Stub global fetch: each call serves the next queued JSON body (or rejects on Error). */
function installFetch(responses: (Passage | ProfileStats | Error)[]): void {
  let call = 0;
  vi.stubGlobal('fetch', (input: RequestInfo | URL): Promise<Response> => {
    fetchedUrls.push(String(input));
    const next = responses[Math.min(call, responses.length - 1)];
    call += 1;
    if (next === undefined || next instanceof Error) {
      return Promise.reject(next ?? new Error('no response queued'));
    }
    return Promise.resolve(
      new Response(JSON.stringify(next), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
}

beforeEach(() => {
  resetTypingStore();
  // Default to prose so the passage-fetch tests are unaffected by mode leakage.
  useModeStore.getState().setMode('prose');
  useModeStore.getState().setWordCount(200);
  // Reset the punctuation/numbers toggles too (Batch C §2.3) - both persist,
  // so a prior test leaving one on would otherwise leak here.
  useModeStore.getState().setPunctuation(false);
  useModeStore.getState().setNumbers(false);
  fetchedUrls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('typingStore.loadNext', () => {
  it('loads a passage into a fresh idle engine', async () => {
    installFetch([makePassage(1, 'it is')]);
    await useTypingStore.getState().loadNext();
    const s = useTypingStore.getState();
    expect(s.phase).toBe('typing');
    expect(s.test).toMatchObject({ kind: 'passage', passage: { id: 1 } });
    expect(s.snapshot?.status).toBe('idle');
    expect(s.snapshot?.words).toHaveLength(2);
    expect(s.recentIds).toEqual([1]);
    expect(fetchedUrls[0]).toBe('/api/v1/passages/next');
  });

  it('excludes recently seen passage ids on subsequent fetches', async () => {
    installFetch([makePassage(1, 'it is'), makePassage(2, 'so it goes')]);
    await useTypingStore.getState().loadNext();
    await useTypingStore.getState().loadNext();
    expect(fetchedUrls[1]).toBe('/api/v1/passages/next?exclude=1');
    expect(useTypingStore.getState().recentIds).toEqual([1, 2]);
  });

  it('enters a quiet error phase when the fetch fails', async () => {
    installFetch([new Error('network down')]);
    await useTypingStore.getState().loadNext();
    const s = useTypingStore.getState();
    expect(s.phase).toBe('error');
    expect(s.errorMessage).not.toBeNull();
    expect(s.engine).toBeNull();
  });

  it('abandons a completed run and resets the restarted flag', async () => {
    installFetch([makePassage(1, 'it is'), makePassage(2, 'so it goes')]);
    await useTypingStore.getState().loadNext();
    useTypingStore.getState().restart(); // no keystrokes yet - not marked
    useTypingStore.getState().typeChar('i', 0);
    useTypingStore.getState().restart(); // started - marked
    expect(useTypingStore.getState().restarted).toBe(true);
    await useTypingStore.getState().loadNext();
    expect(useTypingStore.getState().restarted).toBe(false);
  });

  it('generates a local word set (no fetch) when the mode is words', async () => {
    installFetch([makePassage(1, 'unused')]);
    useModeStore.getState().setMode('words');
    useModeStore.getState().setWordCount(25);
    await useTypingStore.getState().loadNext();
    const s = useTypingStore.getState();
    expect(s.phase).toBe('typing');
    expect(s.test).toMatchObject({ kind: 'words', count: 25 });
    const test = s.test;
    if (test?.kind === 'words') {
      expect(test.text.split(' ')).toHaveLength(25);
      expect(test.text).not.toMatch(/\s{2,}|^\s|\s$/); // canonical
    }
    expect(fetchedUrls).toHaveLength(0); // word mode never hits the API to load
    expect(s.recentIds).toEqual([]); // word runs don't touch recentIds
  });

  it('applies the punctuation toggle: first char uppercase, last char a terminal (Batch C §2.3)', async () => {
    installFetch([makePassage(1, 'unused')]);
    useModeStore.getState().setMode('words');
    useModeStore.getState().setWordCount(25);
    useModeStore.getState().setPunctuation(true);
    await useTypingStore.getState().loadNext();
    const s = useTypingStore.getState();
    const test = s.test;
    expect(test).toMatchObject({ kind: 'words', punctuation: true, numbers: false });
    if (test?.kind === 'words') {
      expect(test.text[0]).toBe(test.text[0]?.toUpperCase());
      expect(test.text.at(-1)).toMatch(/[.!?]/);
      expect(test.text.split(' ')).toHaveLength(25);
    }
  });
});

describe('typingStore.loadById', () => {
  it('loads the requested passage by id', async () => {
    installFetch([makePassage(7, 'so it goes')]);
    await useTypingStore.getState().loadById(7);
    const s = useTypingStore.getState();
    expect(s.phase).toBe('typing');
    expect(s.test).toMatchObject({ kind: 'passage', passage: { id: 7 } });
    expect(s.snapshot?.status).toBe('idle');
    expect(fetchedUrls[0]).toBe('/api/v1/passages/7');
  });

  it('switches to prose mode', async () => {
    installFetch([makePassage(7, 'so it goes')]);
    useModeStore.getState().setMode('words');
    await useTypingStore.getState().loadById(7);
    expect(useModeStore.getState().mode).toBe('prose');
  });

  it('enters a quiet error phase when the fetch fails', async () => {
    installFetch([new Error('network down')]);
    await useTypingStore.getState().loadById(999);
    const s = useTypingStore.getState();
    expect(s.phase).toBe('error');
    expect(s.errorMessage).not.toBeNull();
  });
});

describe('typingStore.loadDrill', () => {
  afterEach(() => {
    // @ts-expect-error - tearing down the test-only global.
    delete globalThis.localStorage;
  });

  it('loads a weak-key drill word run and switches to words mode', async () => {
    installProfileStorage('profile-1');
    installFetch([makeStats()]);
    useModeStore.getState().setMode('prose');
    useModeStore.getState().setWordCount(25);
    await useTypingStore.getState().loadDrill();
    const s = useTypingStore.getState();
    expect(s.phase).toBe('typing');
    expect(s.test).toMatchObject({ kind: 'words', drill: true, count: 25 });
    expect(useModeStore.getState().mode).toBe('words');
    expect(fetchedUrls[0]).toBe('/api/v1/profiles/profile-1/stats');
    const test = s.test;
    if (test?.kind === 'words') {
      expect(test.text.split(' ')).toHaveLength(25);
      expect(test.text).not.toMatch(/\s{2,}|^\s|\s$/); // canonical
    }
  });

  it('still yields a plain word run when the stats fetch fails', async () => {
    installProfileStorage('profile-2');
    installFetch([new Error('network down')]);
    useModeStore.getState().setWordCount(50);
    await useTypingStore.getState().loadDrill();
    const s = useTypingStore.getState();
    expect(s.phase).toBe('typing'); // falls through to an empty-target word run, not an error
    expect(s.test).toMatchObject({ kind: 'words', drill: true, count: 50 });
  });
});

describe('typingStore.loadTimed (§2.3)', () => {
  const TIMED_PROFILE = '11111111-1111-4111-8111-111111111111';

  it('loads a fixed-window run, switches to timed mode, and ends on the countdown', async () => {
    vi.useFakeTimers();
    installProfileStorage(TIMED_PROFILE);
    installFetch([new Error('submit ignored')]); // fire-and-forget submit, result unused here
    await useTypingStore.getState().loadTimed(30);

    const test = useTypingStore.getState().test;
    expect(test?.kind).toBe('timed');
    if (test?.kind === 'timed') {
      expect(test.seconds).toBe(30);
      expect(test.durationMs).toBe(30_000);
    }
    expect(useModeStore.getState().mode).toBe('timed');

    // The first keystroke starts the run and arms the countdown.
    const store = useTypingStore.getState();
    store.typeChar('t', 0);
    store.typeChar('h', 100);
    store.typeChar('e', 200);
    expect(useTypingStore.getState().phase).toBe('typing');

    // The countdown fires, then the completion hold cuts to the result.
    vi.advanceTimersByTime(30_000);
    vi.advanceTimersByTime(COMPLETION_HOLD_MS);
    const s = useTypingStore.getState();
    expect(s.phase).toBe('complete');
    expect(s.completedRun?.durationOverrideMs).toBe(30_000);
    expect(s.completedRun?.stats.durationMs).toBe(30_000);
  });

  it('hard-stops input at the window boundary', async () => {
    vi.useFakeTimers();
    installProfileStorage(TIMED_PROFILE);
    installFetch([new Error('submit ignored')]);
    await useTypingStore.getState().loadTimed(15);

    const store = useTypingStore.getState();
    store.typeChar('t', 0); // starts the run
    store.typeChar('h', 15_000); // at the boundary: ignored, ends the run instead
    vi.advanceTimersByTime(COMPLETION_HOLD_MS);
    const s = useTypingStore.getState();
    expect(s.phase).toBe('complete');
    expect(s.completedRun?.durationOverrideMs).toBe(15_000);
  });
});

describe('typingStore typing flow', () => {
  it('applies keystrokes synchronously and derives the snapshot', async () => {
    installFetch([makePassage(1, 'it is')]);
    await useTypingStore.getState().loadNext();
    const store = useTypingStore.getState();
    store.typeChar('i', 1000);
    store.typeChar('x', 1100); // wrong
    store.backspace(1200, false);
    store.typeChar('t', 1300);
    const snap = useTypingStore.getState().snapshot;
    expect(snap?.status).toBe('running');
    expect(snap?.words[0]?.typed).toBe('it');
    expect(snap?.words[0]?.states).toEqual(['correct', 'corrected']);
    expect(useTypingStore.getState().getLiveStats()?.accuracy).toBeCloseTo(66.67, 2);
  });

  it('holds 300ms after completion before entering the complete phase', async () => {
    vi.useFakeTimers();
    installFetch([makePassage(1, 'it is')]);
    await useTypingStore.getState().loadNext();
    const store = useTypingStore.getState();
    store.typeChar('i', 0);
    store.typeChar('t', 500);
    store.commitSpace(1000);
    store.typeChar('i', 1500);
    store.typeChar('s', 2000);
    expect(useTypingStore.getState().snapshot?.status).toBe('complete');
    expect(useTypingStore.getState().phase).toBe('typing'); // still holding
    vi.advanceTimersByTime(COMPLETION_HOLD_MS);
    const s = useTypingStore.getState();
    expect(s.phase).toBe('complete');
    // (5 chars incl. the space) * 60 / 2s / 5 = 30.00 (§7.3)
    expect(s.completedRun?.stats.wpm).toBeCloseTo(30, 2);
    expect(s.completedRun?.stats.accuracy).toBe(100);
    expect(s.completedRun?.log.events).toHaveLength(5);
    expect(s.completedRun?.restarted).toBe(false);
  });

  it('ignores input outside the typing phase and non-engine chars', async () => {
    installFetch([makePassage(1, 'it is')]);
    await useTypingStore.getState().loadNext();
    const store = useTypingStore.getState();
    store.typeChar('🙂', 0); // non-BMP: skipped, engine still idle
    store.typeChar(' ', 0); // space routed only via commitSpace
    expect(useTypingStore.getState().snapshot?.status).toBe('idle');
    store.commitSpace(0); // space never starts the timer
    expect(useTypingStore.getState().snapshot?.status).toBe('idle');
  });

  it('esc restart rebuilds the engine for the same passage and marks the run', async () => {
    installFetch([makePassage(1, 'it is')]);
    await useTypingStore.getState().loadNext();
    useTypingStore.getState().typeChar('i', 0);
    useTypingStore.getState().restart();
    const s = useTypingStore.getState();
    expect(s.phase).toBe('typing');
    expect(s.test).toMatchObject({ kind: 'passage', passage: { id: 1 } });
    expect(s.snapshot?.status).toBe('idle');
    expect(s.snapshot?.words[0]?.typed).toBe('');
    expect(s.restarted).toBe(true);
    expect(fetchedUrls).toHaveLength(1); // no refetch on restart
  });
});
