import type { Passage } from '@prosetype/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

let fetchedUrls: string[] = [];

/** Stub global fetch: each call serves the next passage (or rejects on Error). */
function installFetch(responses: (Passage | Error)[]): void {
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
    expect(s.passage?.id).toBe(1);
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
    useTypingStore.getState().restart(); // no keystrokes yet, not marked
    useTypingStore.getState().typeChar('i', 0);
    useTypingStore.getState().restart(); // started, marked
    expect(useTypingStore.getState().restarted).toBe(true);
    await useTypingStore.getState().loadNext();
    expect(useTypingStore.getState().restarted).toBe(false);
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
    expect(s.passage?.id).toBe(1);
    expect(s.snapshot?.status).toBe('idle');
    expect(s.snapshot?.words[0]?.typed).toBe('');
    expect(s.restarted).toBe(true);
    expect(fetchedUrls).toHaveLength(1); // no refetch on restart
  });
});
