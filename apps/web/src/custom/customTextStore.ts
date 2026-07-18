import { create } from 'zustand';

/**
 * Open/closed state for the custom-text dialog, in its own tiny store (the
 * commandStore pattern) so the typing stage and the palette can bail on their
 * own key handling while the dialog owns the keys.
 */
interface CustomTextDialogState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useCustomTextStore = create<CustomTextDialogState>()((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

/** Reset store state. Test helper only. */
export function resetCustomTextStore(): void {
  useCustomTextStore.setState({ isOpen: false });
}
