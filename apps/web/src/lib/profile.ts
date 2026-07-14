import { postProfile } from './api';

/** localStorage key for the anonymous profile uuid (plan §9.2). */
export const PROFILE_STORAGE_KEY = 'prosetype.profileId';

let pending: Promise<string> | null = null;

function readStored(): string | null {
  try {
    const value = localStorage.getItem(PROFILE_STORAGE_KEY);
    return value !== null && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Adopt a specific profile id (Phase 3, §10.3): after an account claim/merge
 * the canonical id may differ from the anonymous one, so persist the new id and
 * clear any memoized create so later reads use it.
 */
export function setProfileId(id: string): void {
  pending = null;
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, id);
  } catch {
    // Private mode: the id still applies for the session.
  }
}

/**
 * Read the stored profile id without creating one (Batch D, §3.1 account
 * management). Passive call sites - like the /account page and the header's
 * claimed-state label - must not conjure a profile just by rendering.
 */
export function getStoredProfileId(): string | null {
  return readStored();
}

/**
 * Forget the local profile id (§3.1): used by "sign out" on /account. The next
 * ensureProfileId() call creates a fresh anonymous profile.
 */
export function clearProfileId(): void {
  pending = null;
  try {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    // Private mode: nothing was persisted to clear.
  }
}

/**
 * Resolve the anonymous profile id (plan §9.2): return the one in localStorage,
 * or create one via POST /profiles and persist it. The in-flight promise is
 * memoized so concurrent callers (submission + stats) share one create; a
 * failed create is not cached, so the next call retries.
 */
export function ensureProfileId(): Promise<string> {
  const stored = readStored();
  if (stored !== null) return Promise.resolve(stored);
  if (pending !== null) return pending;
  pending = postProfile()
    .then((id) => {
      try {
        localStorage.setItem(PROFILE_STORAGE_KEY, id);
      } catch {
        // Non-persistent storage (private mode): keep using the id this session.
      }
      pending = null;
      return id;
    })
    .catch((err: unknown) => {
      pending = null;
      throw err;
    });
  return pending;
}
