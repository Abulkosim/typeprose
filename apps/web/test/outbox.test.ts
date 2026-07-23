import type { CharEvents, PostResultsResponse, RunStats } from '@typeprose/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_ATTEMPTS,
  OUTBOX_CAP,
  OUTBOX_STORAGE_KEY,
  OUTBOX_VERSION,
  enqueueResult,
  flushOutbox,
  outboxCount,
  shouldQueue,
  type PendingResult,
} from '../src/lib/outbox';
import { PROFILE_STORAGE_KEY } from '../src/lib/profile';

const STATS: RunStats = { wpm: 60, rawWpm: 65, accuracy: 97.5, consistency: 80, durationMs: 12000 };
const EVENTS: CharEvents = { v: 1, events: [[0, 0, 0]] };

function prosePending(passageId: number): PendingResult {
  return { mode: 'prose', passageId, clientStats: STATS, charEvents: EVENTS };
}

const RESPONSE: PostResultsResponse = {
  id: 1,
  serverStats: STATS,
  clientMatch: true,
  isNewBest: false,
  previousBestWpm: null,
  isNewPassageBest: false,
  previousPassageBestWpm: null,
  dailyStreak: null,
};

/** localStorage stub pre-seeded with a profile id so ensureProfileId never POSTs. */
function installStorage(): Map<string, string> {
  const store = new Map<string, string>([[PROFILE_STORAGE_KEY, 'profile-1']]);
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage;
  return store;
}

type QueuedResponse = { status: number } | Error;
let postedBodies: unknown[] = [];

/** Stub fetch: each call consumes the next queued outcome (default 201 + valid body). */
function installFetch(outcomes: QueuedResponse[]): void {
  let call = 0;
  vi.stubGlobal('fetch', (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const outcome = outcomes[call] ?? { status: 201 };
    call += 1;
    if (outcome instanceof Error) return Promise.reject(outcome);
    if (typeof init?.body === 'string') postedBodies.push(JSON.parse(init.body));
    return Promise.resolve(
      new Response(JSON.stringify(RESPONSE), {
        status: outcome.status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
}

let store: Map<string, string>;

beforeEach(() => {
  store = installStorage();
  postedBodies = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  // @ts-expect-error - tearing down the test-only global.
  delete globalThis.localStorage;
});

function storedEntries(): { attempts: number; payload: PendingResult }[] {
  const raw = store.get(OUTBOX_STORAGE_KEY);
  if (raw === undefined) return [];
  return (JSON.parse(raw) as { entries: { attempts: number; payload: PendingResult }[] }).entries;
}

describe('enqueueResult', () => {
  it('queues entries and reports the count', () => {
    expect(enqueueResult(prosePending(1))).toBe(true);
    expect(enqueueResult(prosePending(2))).toBe(true);
    expect(outboxCount()).toBe(2);
  });

  it('drops the oldest entry beyond the cap', () => {
    for (let i = 1; i <= OUTBOX_CAP + 2; i += 1) enqueueResult(prosePending(i));
    const entries = storedEntries();
    expect(entries).toHaveLength(OUTBOX_CAP);
    expect(entries[0]?.payload).toMatchObject({ passageId: 3 }); // 1 and 2 evicted
  });

  it('returns false when storage is unavailable', () => {
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: () => undefined,
    } as unknown as Storage;
    expect(enqueueResult(prosePending(1))).toBe(false);
  });
});

describe('flushOutbox', () => {
  it('replays oldest-first and clears the queue on success', async () => {
    enqueueResult(prosePending(1));
    enqueueResult(prosePending(2));
    installFetch([]);
    await flushOutbox(0);
    expect(outboxCount()).toBe(0);
    expect(postedBodies).toEqual([
      expect.objectContaining({ mode: 'prose', passageId: 1, profileId: 'profile-1' }),
      expect.objectContaining({ mode: 'prose', passageId: 2, profileId: 'profile-1' }),
    ]);
  });

  it('stops the sweep on a network failure, keeping the entry with an attempt mark', async () => {
    enqueueResult(prosePending(1));
    enqueueResult(prosePending(2));
    installFetch([new TypeError('network down')]);
    await flushOutbox(0);
    const entries = storedEntries();
    expect(entries).toHaveLength(2); // nothing lost, second never attempted
    expect(entries[0]?.attempts).toBe(1);
    expect(entries[1]?.attempts).toBe(0);
  });

  it('drops a terminally rejected (4xx) entry and continues with the rest', async () => {
    enqueueResult(prosePending(1)); // will 400 (e.g. the passage was deleted)
    enqueueResult(prosePending(2));
    installFetch([{ status: 400 }, { status: 201 }]);
    await flushOutbox(0);
    expect(outboxCount()).toBe(0); // the 400 dropped, the rest submitted
    expect(postedBodies).toEqual([
      expect.objectContaining({ passageId: 1 }),
      expect.objectContaining({ passageId: 2 }),
    ]);
  });

  it('prunes entries that exhausted their attempts without submitting them', async () => {
    enqueueResult(prosePending(1));
    const raw = store.get(OUTBOX_STORAGE_KEY) ?? '';
    const parsed = JSON.parse(raw) as { v: number; entries: { attempts: number }[] };
    for (const entry of parsed.entries) entry.attempts = MAX_ATTEMPTS;
    store.set(OUTBOX_STORAGE_KEY, JSON.stringify(parsed));
    installFetch([]);
    await flushOutbox(0);
    expect(outboxCount()).toBe(0);
    expect(postedBodies).toEqual([]);
  });

  it('ignores storage written by a future outbox version', async () => {
    store.set(
      OUTBOX_STORAGE_KEY,
      JSON.stringify({ v: OUTBOX_VERSION + 1, entries: [{ bogus: true }] }),
    );
    installFetch([]);
    await flushOutbox(0);
    expect(postedBodies).toEqual([]);
  });
});

describe('shouldQueue', () => {
  const httpError = (status: number): Error =>
    new Error(`POST /results failed with status ${String(status)}`);

  it('queues network-level failures and retryable statuses', () => {
    expect(shouldQueue(new TypeError('fetch failed'))).toBe(true);
    expect(shouldQueue(httpError(429))).toBe(true);
    expect(shouldQueue(httpError(408))).toBe(true);
    expect(shouldQueue(httpError(500))).toBe(true);
    expect(shouldQueue(httpError(503))).toBe(true);
  });

  it('refuses to queue payloads the server has terminally rejected', () => {
    expect(shouldQueue(httpError(400))).toBe(false);
    expect(shouldQueue(httpError(404))).toBe(false);
    expect(shouldQueue(httpError(422))).toBe(false);
  });
});
