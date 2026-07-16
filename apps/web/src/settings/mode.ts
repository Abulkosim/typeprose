import { TIMED_SECONDS, type TimedSeconds } from '@typeprose/schema';
import { create } from 'zustand';

import { asWordCount, DEFAULT_WORD_COUNT, type WordCount } from '../lib/words';

/**
 * The test mode (a deliberate departure from the spec's single quote mode).
 * 'prose' is the default - the curated literary corpus; 'words' is the
 * Monkeytype-style random-word set; 'timed' (§2.3) is a fixed-window run over
 * the same word stream. All opted into via the command palette. The choice and
 * its presets persist, mirroring the theme/sound settings (hand-rolled
 * localStorage rather than a persist middleware).
 */
export type Mode = 'prose' | 'words' | 'timed';

export const MODE_STORAGE_KEY = 'typeprose.mode';
export const WORD_COUNT_STORAGE_KEY = 'typeprose.wordCount';
/** Batch C §2.3: word-mode punctuation/numbers toggles, persisted like everything else here. */
export const WORD_PUNCTUATION_STORAGE_KEY = 'typeprose.wordPunctuation';
export const WORD_NUMBERS_STORAGE_KEY = 'typeprose.wordNumbers';
/** Timed-mode window in seconds (§2.3). */
export const TIMED_SECONDS_STORAGE_KEY = 'typeprose.timedSeconds';

export const DEFAULT_TIMED_SECONDS: TimedSeconds = 60;

/** Narrow an arbitrary number to a known timed window, falling back to the default. */
export function asTimedSeconds(value: number): TimedSeconds {
  return (TIMED_SECONDS as readonly number[]).includes(value)
    ? (value as TimedSeconds)
    : DEFAULT_TIMED_SECONDS;
}

function readMode(): Mode {
  try {
    const raw = localStorage.getItem(MODE_STORAGE_KEY);
    return raw === 'words' || raw === 'timed' ? raw : 'prose';
  } catch {
    return 'prose';
  }
}

function readTimedSeconds(): TimedSeconds {
  try {
    const raw = localStorage.getItem(TIMED_SECONDS_STORAGE_KEY);
    return raw === null ? DEFAULT_TIMED_SECONDS : asTimedSeconds(Number(raw));
  } catch {
    return DEFAULT_TIMED_SECONDS;
  }
}

function persistTimedSeconds(seconds: TimedSeconds): void {
  try {
    localStorage.setItem(TIMED_SECONDS_STORAGE_KEY, String(seconds));
  } catch {
    // Private mode: applies this session, not remembered.
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
  /** Timed-mode window in seconds (§2.3). */
  timedSeconds: TimedSeconds;
  /** Word/timed-mode punctuation/numbers toggles (§2.3), off by default; drill runs never set these. */
  punctuation: boolean;
  numbers: boolean;
  setMode: (mode: Mode) => void;
  setWordCount: (count: WordCount) => void;
  setTimedSeconds: (seconds: TimedSeconds) => void;
  setPunctuation: (punctuation: boolean) => void;
  setNumbers: (numbers: boolean) => void;
}

export const useModeStore = create<ModeState>()((set) => ({
  mode: readMode(),
  wordCount: readWordCount(),
  timedSeconds: readTimedSeconds(),
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
  setTimedSeconds: (timedSeconds) => {
    persistTimedSeconds(timedSeconds);
    set({ timedSeconds });
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
