import { passageSyncResponseSchema, type PassageSyncResponse } from '@typeprose/schema';

/**
 * localStorage persistence for the synced corpus (offline prose, lib/passages.ts).
 * The whole corpus is ~150KB of JSON at the current ~100-passage scale - small
 * enough for localStorage and the hand-rolled `typeprose.*` idiom used by every
 * other persisted setting; revisit (IndexedDB) if the corpus grows ~10x.
 *
 * Reads re-validate through the shared schema, so a corrupt or stale-shaped
 * entry degrades to "no corpus" (today's online-only behavior), never a crash.
 * No in-memory memo: reads only happen on fetch-failure fallbacks and library
 * derivation, and a fresh read stays correct across tabs.
 */
export const CORPUS_STORAGE_KEY = 'typeprose.corpus';

/** Bump to discard stored corpora whose shape predates a schema change. */
export const CORPUS_VERSION = 1;

export function readCorpus(): PassageSyncResponse | null {
  try {
    const raw = localStorage.getItem(CORPUS_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { v, ...data } = parsed as { v?: unknown };
    if (v !== CORPUS_VERSION) return null;
    return passageSyncResponseSchema.parse(data);
  } catch {
    return null;
  }
}

export function writeCorpus(data: PassageSyncResponse): void {
  try {
    localStorage.setItem(CORPUS_STORAGE_KEY, JSON.stringify({ v: CORPUS_VERSION, ...data }));
  } catch {
    // Quota/private mode: offline prose just isn't available this session.
  }
}
