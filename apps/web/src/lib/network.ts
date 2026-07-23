import { create } from 'zustand';

/**
 * Connectivity state for quiet UI hints (the "offline" tag in the bottom bar
 * and offline-aware error copy). `navigator.onLine` can lie behind captive
 * portals, so this is never used for correctness - fetch failure is the real
 * signal everywhere - only for honest labeling.
 */
interface NetworkState {
  online: boolean;
}

export const useNetworkStore = create<NetworkState>()(() => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
}));

/** App-start hook (main.tsx), mirroring initTheme/initMusic. */
export function initNetwork(): void {
  window.addEventListener('online', () => {
    useNetworkStore.setState({ online: true });
  });
  window.addEventListener('offline', () => {
    useNetworkStore.setState({ online: false });
  });
}
