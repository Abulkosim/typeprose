import { create } from 'zustand';

/**
 * The two looks (Phase 3, plan §10.3): the default noir palette (§9.4) and a
 * light "matinee" palette. The active theme is a `data-theme` attribute on the
 * document element; Tailwind v4 tokens are `var(--color-*)`, so a `[data-theme]`
 * override block (styles.css) re-points them without touching any utility.
 */
export type Theme = 'noir' | 'matinee';

/** localStorage key for the persisted theme preference. */
export const THEME_STORAGE_KEY = 'typeprose.theme';

function readStored(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'matinee' ? 'matinee' : 'noir';
  } catch {
    return 'noir';
  }
}

/** Stamp the theme onto <html> so the CSS override block takes effect. */
function apply(theme: Theme): void {
  if (typeof document !== 'undefined') document.documentElement.dataset['theme'] = theme;
}

function persist(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode: theme still applies for the session, just isn't remembered.
  }
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()((set, get) => ({
  theme: readStored(),
  setTheme: (theme) => {
    apply(theme);
    persist(theme);
    set({ theme });
  },
  toggle: () => {
    get().setTheme(get().theme === 'noir' ? 'matinee' : 'noir');
  },
}));

/** Apply the persisted theme once at startup, before first paint. */
export function initTheme(): void {
  apply(useThemeStore.getState().theme);
}
