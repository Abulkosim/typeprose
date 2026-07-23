import type { CharEvents, RunStats } from '@typeprose/schema';

import { submitCustomResult, submitResult, submitTimedResult, submitWordResult } from './api';
import { ensureProfileId } from './profile';

/**
 * Offline result queue (plan: PWA/offline). A run whose submission fails is
 * queued here instead of dropped, and replayed when connectivity returns.
 * Entries mirror the POST /results mode shapes minus `profileId` - a first
 * run while offline has no profile yet, so identity is resolved at flush time
 * via ensureProfileId(), whose memoized create fires once back online.
 *
 * Dupe honesty: a flush whose 2xx response is lost can double-submit - the
 * same exposure class as the live path's blind one-retry. Bounded by
 * remove-on-success-immediately, the single-sweeper Web Lock, and drop-on-4xx;
 * a server idempotency key is deliberate future work.
 */

export const OUTBOX_STORAGE_KEY = 'typeprose.pendingResults';

/** Bump to discard queued entries whose shape predates a schema change. */
export const OUTBOX_VERSION = 1;

/** ×64KB worst-case charEvents ≈ 640KB, comfortably inside localStorage. */
export const OUTBOX_CAP = 10;

/** Entries older than this or retried more than MAX_ATTEMPTS times are dropped. */
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_ATTEMPTS = 10;

/** Spacing between replayed POSTs: the server allows 20/min; leave headroom for a live run's own submit. */
export const REPLAY_SPACING_MS = 3500;

/** A queued POST /results body, minus the flush-time `profileId`. */
export type PendingResult =
  | { mode: 'prose'; passageId: number; clientStats: RunStats; charEvents: CharEvents }
  | { mode: 'words'; text: string; clientStats: RunStats; charEvents: CharEvents }
  | { mode: 'custom'; text: string; clientStats: RunStats; charEvents: CharEvents }
  | {
      mode: 'timed';
      text: string;
      durationMs: number;
      clientStats: RunStats;
      charEvents: CharEvents;
    };

interface OutboxEntry {
  queuedAt: number;
  attempts: number;
  payload: PendingResult;
}

const MODES = ['prose', 'words', 'custom', 'timed'];

function isEntry(value: unknown): value is OutboxEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as { queuedAt?: unknown; attempts?: unknown; payload?: unknown };
  if (typeof entry.queuedAt !== 'number' || typeof entry.attempts !== 'number') return false;
  if (typeof entry.payload !== 'object' || entry.payload === null) return false;
  // Shallow shape check only - we wrote these ourselves and the server
  // revalidates every field; a corrupted body just 4xxes and is dropped.
  return MODES.includes((entry.payload as { mode?: unknown }).mode as string);
}

function readEntries(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return [];
    const { v, entries } = parsed as { v?: unknown; entries?: unknown };
    if (v !== OUTBOX_VERSION || !Array.isArray(entries)) return [];
    return entries.filter(isEntry);
  } catch {
    return [];
  }
}

function writeEntries(entries: OutboxEntry[]): boolean {
  try {
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify({ v: OUTBOX_VERSION, entries }));
    return true;
  } catch {
    return false; // quota/private mode - the run stays 'not saved', as today
  }
}

/** How many runs are waiting to sync (the stats page's offline note). */
export function outboxCount(): number {
  return readEntries().length;
}

/**
 * Queue a failed submission, oldest dropped beyond OUTBOX_CAP. Returns false
 * when storage is unavailable so the caller can fall back to 'not-saved'.
 */
export function enqueueResult(payload: PendingResult): boolean {
  const entries = readEntries();
  entries.push({ queuedAt: Date.now(), attempts: 0, payload });
  return writeEntries(entries.slice(Math.max(0, entries.length - OUTBOX_CAP)));
}

function isExpired(entry: OutboxEntry, now: number): boolean {
  return now - entry.queuedAt > MAX_AGE_MS || entry.attempts >= MAX_ATTEMPTS;
}

/**
 * The HTTP status a failed api.ts call carried, or null for network-level
 * failures (offline, DNS, aborted). api.ts throws `<label> failed with
 * status <n>` for every non-ok response - parsed rather than re-plumbed so
 * the fetch wrappers keep their single error shape.
 */
function statusFromError(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  const match = /failed with status (\d+)$/.exec(err.message);
  const status = match?.[1];
  return status === undefined ? null : Number(status);
}

/**
 * Whether a failed submission is worth queueing: network-level failures and
 * retryable statuses (408/429/5xx). A plain 4xx means the server will never
 * accept this payload - queueing it would just replay a guaranteed rejection.
 */
export function shouldQueue(err: unknown): boolean {
  const status = statusFromError(err);
  return status === null || status === 408 || status === 429 || status >= 500;
}

function submitPending(profileId: string, p: PendingResult): Promise<unknown> {
  const base = { profileId, clientStats: p.clientStats, charEvents: p.charEvents };
  switch (p.mode) {
    case 'prose':
      return submitResult({ ...base, passageId: p.passageId });
    case 'words':
      return submitWordResult({ ...base, text: p.text });
    case 'custom':
      return submitCustomResult({ ...base, text: p.text });
    case 'timed':
      return submitTimedResult({ ...base, text: p.text, durationMs: p.durationMs });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Replay the queue oldest-first, removing each entry the moment its POST
 * succeeds. A 4xx (bad payload, deleted passage/profile) is terminal - drop
 * and continue; anything else (network, 429, 5xx) marks the attempt and stops
 * the sweep - we're likely still offline and the next trigger retries.
 * Replay never touches the typing store: saveStatus/bestInfo belong to the
 * current run only.
 */
async function sweep(spacingMs: number): Promise<void> {
  const now = Date.now();
  let entries = readEntries().filter((e) => !isExpired(e, now));
  writeEntries(entries); // persist the expiry prune even if nothing submits
  let first = true;
  while (entries.length > 0) {
    const entry = entries[0];
    if (entry === undefined) break;
    if (!first) await sleep(spacingMs);
    first = false;
    try {
      const profileId = await ensureProfileId();
      await submitPending(profileId, entry.payload);
      entries = entries.slice(1);
      writeEntries(entries); // remove the moment it succeeds - never resubmit a 2xx
    } catch (err) {
      if (shouldQueue(err)) {
        // Likely still offline (or throttled); mark the attempt, stop the sweep.
        writeEntries([{ ...entry, attempts: entry.attempts + 1 }, ...entries.slice(1)]);
        break;
      }
      entries = entries.slice(1); // terminal 4xx - the server will never accept it
      writeEntries(entries);
    }
  }
}

let flushing = false;

/**
 * Flush the outbox, serialized across tabs via the Web Locks API (two tabs
 * replaying the same entry would double-submit). Where Locks is unavailable
 * the module-level flag still guards within the tab - the residual cross-tab
 * risk is the same class as the live path's blind retry.
 */
export async function flushOutbox(spacingMs: number = REPLAY_SPACING_MS): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
      await navigator.locks.request('typeprose.outbox', { ifAvailable: true }, async (lock) => {
        if (lock !== null) await sweep(spacingMs);
      });
    } else {
      await sweep(spacingMs);
    }
  } finally {
    flushing = false;
  }
}

/** App-start hook (main.tsx): replay now and whenever connectivity returns. */
export function initOutbox(): void {
  void flushOutbox();
  window.addEventListener('online', () => void flushOutbox());
}
