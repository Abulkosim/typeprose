import { create } from 'zustand';

import { asWordCount, DEFAULT_WORD_COUNT, type WordCount } from '../lib/words';

/**
 * The test mode (word mode, a deliberate departure from the spec's single quote
 * mode). 'prose' is the default - the curated literary corpus; 'words' is the
 * Monkeytype-style random-word set, opted into via the command palette. The
 * choice and the word-count preset persist, mirroring the theme/sound settings
 * (hand-rolled localStorage rather than a persist middleware).
 */
export type Mode = 'prose' | 'words';

export const MODE_STORAGE_KEY = 'typeprose.mode';
export const WORD_COUNT_STORAGE_KEY = 'typeprose.wordCount';
/** Batch C §2.3: word-mode punctuation/numbers toggles, persisted like everything else here. */
export const WORD_PUNCTUATION_STORAGE_KEY = 'typeprose.wordPunctuation';
export const WORD_NUMBERS_STORAGE_KEY = 'typeprose.wordNumbers';

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === 'words' ? 'words' : 'prose';
  } catch {
    return 'prose';
  }
}

function readWordCount(): WordCount {
  try {
    const raw = localStorage.getItem(WORD_COUNT_STORAGE_KEY);
    return raw === null ? DEFAULT_WORD_COUNT : asWordCount(Number(raw));
  } catch {
    return DEFAULT_WORD_COUNT;
  }
}

function persistMode(mode: Mode): void {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Private mode: the choice still applies this session, just isn't remembered.
  }
}

function persistWordCount(count: WordCount): void {
  try {
    localStorage.setItem(WORD_COUNT_STORAGE_KEY, String(count));
  } catch {
    // Private mode: applies this session, not remembered.
  }
}

/** Generic on/off flag reader, mirroring `readMode`'s try/catch-default shape. */
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'on';
  } catch {
    return false;
  }
}

/** Generic on/off flag writer, mirroring `persistMode`. */
function persistFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? 'on' : 'off');
  } catch {
    // Private mode: the choice still applies this session, just isn't remembered.
  }
}

interface ModeState {
  mode: Mode;
  wordCount: WordCount;
  /** Word-mode punctuation/numbers toggles (§2.3), off by default; drill runs never set these. */
  punctuation: boolean;
  numbers: boolean;
  setMode: (mode: Mode) => void;
  setWordCount: (count: WordCount) => void;
  setPunctuation: (punctuation: boolean) => void;
  setNumbers: (numbers: boolean) => void;
}

export const useModeStore = create<ModeState>()((set) => ({
  mode: readMode(),
  wordCount: readWordCount(),
  punctuation: readFlag(WORD_PUNCTUATION_STORAGE_KEY),
  numbers: readFlag(WORD_NUMBERS_STORAGE_KEY),
  setMode: (mode) => {
    persistMode(mode);
    set({ mode });
  },
  setWordCount: (wordCount) => {
    persistWordCount(wordCount);
    set({ wordCount });
  },
  setPunctuation: (punctuation) => {
    persistFlag(WORD_PUNCTUATION_STORAGE_KEY, punctuation);
    set({ punctuation });
  },
  setNumbers: (numbers) => {
    persistFlag(WORD_NUMBERS_STORAGE_KEY, numbers);
    set({ numbers });
  },
}));
