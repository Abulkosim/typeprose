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

export const MODE_STORAGE_KEY = 'prosetype.mode';
export const WORD_COUNT_STORAGE_KEY = 'prosetype.wordCount';

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

interface ModeState {
  mode: Mode;
  wordCount: WordCount;
  setMode: (mode: Mode) => void;
  setWordCount: (count: WordCount) => void;
}

export const useModeStore = create<ModeState>()((set) => ({
  mode: readMode(),
  wordCount: readWordCount(),
  setMode: (mode) => {
    persistMode(mode);
    set({ mode });
  },
  setWordCount: (wordCount) => {
    persistWordCount(wordCount);
    set({ wordCount });
  },
}));
