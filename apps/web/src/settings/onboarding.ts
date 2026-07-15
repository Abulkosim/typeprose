/**
 * First-run guidance flags (a first-time visitor sees no tutorial otherwise).
 * Each hint is shown once, ever, then permanently dismissed via localStorage -
 * mirroring the hand-rolled persistence style of theme/sound/mode.
 */
const TYPING_HINT_KEY = 'typeprose.seenTypingHint';
const RESULT_HINT_KEY = 'typeprose.seenResultHint';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function setFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Private mode: the hint may reappear next session - harmless.
  }
}

/** The stage hint ("type the passage below..."), shown until the first keystroke ever. */
export function hasSeenTypingHint(): boolean {
  return readFlag(TYPING_HINT_KEY);
}

export function markSeenTypingHint(): void {
  setFlag(TYPING_HINT_KEY);
}

/** The one-line stats pointer on the first-ever result view. */
export function hasSeenResultHint(): boolean {
  return readFlag(RESULT_HINT_KEY);
}

export function markSeenResultHint(): void {
  setFlag(RESULT_HINT_KEY);
}
