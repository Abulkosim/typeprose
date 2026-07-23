import type { PassageSummaryItem } from '@typeprose/schema';
import { create } from 'zustand';

import { addFavorite, fetchFavorites, removeFavorite } from './api';
import { localSummariesByIds } from './passages';
import { ensureProfileId, getStoredProfileId } from './profile';

/**
 * Per-profile favorites (§3.3). The `ids` set is the source of truth for the
 * result-view star (instant, optimistic); `items` caches the passage summaries
 * for the library's favorites section. Reads are passive (getStoredProfileId -
 * viewing a result must not conjure a profile); starring is an explicit action
 * so `toggle` may create one via ensureProfileId.
 */

/**
 * localStorage mirror of the favorite ids (in favorite order, newest first)
 * from the last successful fetch, so the library's favorites section still
 * lists offline - summaries come from the synced corpus. The server stays the
 * source of truth; offline star/unstar keeps its fail-and-revert behavior.
 */
const FAVORITES_STORAGE_KEY = 'typeprose.favoriteIds';

function persistFavoriteIds(items: PassageSummaryItem[]): void {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(items.map((p) => p.id)));
  } catch {
    // Private mode: favorites just aren't listed offline.
  }
}

function readMirroredFavorites(): PassageSummaryItem[] | null {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'number')) return null;
    return localSummariesByIds(parsed);
  } catch {
    return null;
  }
}
interface FavoritesState {
  ids: ReadonlySet<number>;
  items: PassageSummaryItem[] | null;
  loaded: boolean;
  /** Load favorites for the stored profile; a no-op profile-wise when none exists. */
  load: () => Promise<void>;
  /** Star/unstar a passage, optimistic with revert-on-failure. */
  toggle: (passageId: number) => Promise<void>;
}

export const useFavoritesStore = create<FavoritesState>()((set, get) => ({
  ids: new Set(),
  items: null,
  loaded: false,

  load: async () => {
    const id = getStoredProfileId();
    if (id === null) {
      set({ ids: new Set(), items: [], loaded: true });
      return;
    }
    try {
      const items = await fetchFavorites(id);
      persistFavoriteIds(items);
      set({ ids: new Set(items.map((p) => p.id)), items, loaded: true });
    } catch {
      // Offline: serve the mirrored ids with summaries from the synced corpus.
      const mirrored = readMirroredFavorites();
      if (mirrored !== null && mirrored.length > 0) {
        set({ ids: new Set(mirrored.map((p) => p.id)), items: mirrored, loaded: true });
      } else {
        set({ loaded: true });
      }
    }
  },

  toggle: async (passageId: number) => {
    const wasFavorite = get().ids.has(passageId);
    const next = new Set(get().ids);
    if (wasFavorite) next.delete(passageId);
    else next.add(passageId);
    set({ ids: next }); // optimistic - the star flips immediately
    try {
      const profileId = await ensureProfileId();
      if (wasFavorite) await removeFavorite(profileId, passageId);
      else await addFavorite(profileId, passageId);
      // Refresh the cached summaries so the library section stays authoritative.
      const items = await fetchFavorites(profileId);
      persistFavoriteIds(items);
      set({ ids: new Set(items.map((p) => p.id)), items });
    } catch {
      // Revert the optimistic flip on failure.
      const reverted = new Set(get().ids);
      if (wasFavorite) reverted.add(passageId);
      else reverted.delete(passageId);
      set({ ids: reverted });
    }
  },
}));
