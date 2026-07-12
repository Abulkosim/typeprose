import type { CharState, WordSnapshot } from '@prosetype/engine';
import { memo, type ReactElement } from 'react';

/** Registers/unregisters a char span for caret + line measurement. */
export type RegisterChar = (
  wordIndex: number,
  charIndex: number,
  el: HTMLSpanElement | null,
) => void;

/**
 * Char-state palette (§9.4): bone correct, smoke pending, blood incorrect.
 * Corrected = bone with a dim smoke underline; missed = smoke with a blood
 * underline; extras = blood at reduced opacity (classes in styles.css).
 */
const STATE_CLASS: Record<CharState, string> = {
  pending: 'text-smoke',
  correct: 'text-bone',
  incorrect: 'text-blood',
  corrected: 'char-corrected text-bone',
  missed: 'char-missed text-smoke',
  extra: 'text-blood/70',
};

/**
 * One passage word. Memoized on the engine's WordSnapshot, which keeps
 * reference identity while a word is untouched - so per keystroke only the
 * active (and, on commit/uncommit, the neighboring) word re-renders.
 * Incorrect slots keep showing the target character (in blood); what was
 * actually typed lives in the engine state for the log.
 */
export const Word = memo(function Word({
  word,
  registerChar,
}: {
  word: WordSnapshot;
  registerChar: RegisterChar;
}): ReactElement {
  const spans: ReactElement[] = [];
  for (let i = 0; i < word.target.length; i += 1) {
    const state = word.states[i] ?? 'pending';
    spans.push(
      <span
        key={i}
        ref={(el) => {
          registerChar(word.wordIndex, i, el);
        }}
        className={STATE_CLASS[state]}
      >
        {word.target[i]}
      </span>,
    );
  }
  const extraBase = word.target.length;
  for (let j = 0; j < word.extras.length; j += 1) {
    spans.push(
      <span
        key={extraBase + j}
        ref={(el) => {
          registerChar(word.wordIndex, extraBase + j, el);
        }}
        className={STATE_CLASS.extra}
      >
        {word.extras[j]}
      </span>,
    );
  }
  return <span className="inline-block">{spans}</span>;
});
