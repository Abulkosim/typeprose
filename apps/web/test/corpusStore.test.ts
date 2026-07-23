import type { Passage, PassageSyncResponse } from '@typeprose/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CORPUS_STORAGE_KEY, CORPUS_VERSION, readCorpus, writeCorpus } from '../src/lib/corpusStore';

function makePassage(id: number): Passage {
  return {
    id,
    text: `passage number ${String(id)}`,
    charCount: 20,
    wordCount: 3,
    difficulty: 30,
    band: 'standard',
    themes: ['aphorisms'],
    language: 'en',
    work: { slug: 'work', title: 'A Work', translator: null, pubYear: 1900 },
    author: { slug: 'author', name: 'An Author', era: null },
  };
}

function makeSync(): PassageSyncResponse {
  return {
    syncedAt: '2026-07-23T10:00:00.000Z',
    dailyDateKey: '2026-07-23',
    dailyPassageId: 2,
    passages: [makePassage(1), makePassage(2)],
  };
}

/** Minimal localStorage stub for the node test env (theme.test.ts pattern). */
function installStorage(): Map<string, string> {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage;
  return store;
}

let store: Map<string, string>;

beforeEach(() => {
  store = installStorage();
});

afterEach(() => {
  // @ts-expect-error - tearing down the test-only global.
  delete globalThis.localStorage;
});

describe('corpusStore', () => {
  it('round-trips a sync payload through localStorage', () => {
    writeCorpus(makeSync());
    expect(readCorpus()).toEqual(makeSync());
  });

  it('returns null when nothing is stored', () => {
    expect(readCorpus()).toBeNull();
  });

  it('drops a stored corpus with a stale version marker', () => {
    writeCorpus(makeSync());
    const raw = store.get(CORPUS_STORAGE_KEY);
    store.set(
      CORPUS_STORAGE_KEY,
      (raw ?? '').replace(`"v":${String(CORPUS_VERSION)}`, `"v":${String(CORPUS_VERSION + 1)}`),
    );
    expect(readCorpus()).toBeNull();
  });

  it('degrades to null on corrupt JSON or a shape the schema rejects', () => {
    store.set(CORPUS_STORAGE_KEY, 'not json {');
    expect(readCorpus()).toBeNull();
    store.set(CORPUS_STORAGE_KEY, JSON.stringify({ v: CORPUS_VERSION, passages: 'nope' }));
    expect(readCorpus()).toBeNull();
  });
});
