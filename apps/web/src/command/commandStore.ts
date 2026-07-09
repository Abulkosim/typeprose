import { create } from 'zustand';

/**
 * Open/closed state for the Esc command palette (Phase 3, plan §10.3). Kept in
 * its own tiny store so the typing stage can read it (and bail on its own key
 * handling) without prop plumbing, the same pattern as the caps-lock flag.
 */
interface CommandPaletteState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useCommandStore = create<CommandPaletteState>()((set, get) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set({ isOpen: !get().isOpen }),
}));

/** Reset store state. Test helper only. */
export function resetCommandStore(): void {
  useCommandStore.setState({ isOpen: false });
}
