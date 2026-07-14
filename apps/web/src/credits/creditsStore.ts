import { create } from 'zustand';

/**
 * Open/closed state for the "roll credits" title sequence. Its own tiny store
 * - the same pattern as the command palette's - so the palette's Esc handler
 * and the typing stage's document key handler can bail while the sequence is
 * up without prop plumbing.
 */
interface CreditsState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useCreditsStore = create<CreditsState>()((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

/** Reset store state. Test helper only. */
export function resetCreditsStore(): void {
  useCreditsStore.setState({ isOpen: false });
}
