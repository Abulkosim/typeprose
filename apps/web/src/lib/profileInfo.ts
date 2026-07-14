import { create } from 'zustand';

import { fetchProfile } from './api';
import { getStoredProfileId } from './profile';

/**
 * The claimed-state summary shown on /account and the header's account label
 * (Batch D, §3.1 account management).
 */
export interface ProfileInfo {
  displayName: string | null;
  claimed: boolean;
  email: string | null;
}

interface ProfileInfoState {
  info: ProfileInfo | null;
  /**
   * Reload from the stored profile id. Uses getStoredProfileId(), never
   * ensureProfileId() - a passive refresh (header mount, page load) must not
   * conjure a profile that wouldn't otherwise exist. No stored id, or a fetch
   * failure (e.g. the profile was just deleted), both resolve to `info: null`.
   */
  refresh: () => Promise<void>;
}

export const useProfileStore = create<ProfileInfoState>()((set) => ({
  info: null,
  refresh: async () => {
    const id = getStoredProfileId();
    if (id === null) {
      set({ info: null });
      return;
    }
    try {
      const profile = await fetchProfile(id);
      set({
        info: { displayName: profile.displayName, claimed: profile.claimed, email: profile.email },
      });
    } catch {
      set({ info: null });
    }
  },
}));
