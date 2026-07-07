import { InvalidPassageError } from './errors.ts';

/** One word of the passage, with its position in the passage string. */
export interface PassageWord {
  /** The word's text (never contains a space). */
  readonly text: string;
  /** Passage index of the word's first character. */
  readonly start: number;
  /**
   * Index one past the word's last character. For every word but the last this
   * is the index of the space that follows the word.
   */
  readonly end: number;
}

/** A passage parsed into words (plan §7.2: split on single spaces). */
export interface ParsedPassage {
  readonly text: string;
  readonly length: number;
  readonly words: readonly PassageWord[];
}

/**
 * Parse canonical passage text (§6.2 shape: single spaces only, no
 * leading/trailing whitespace, no newlines) into indexed words.
 *
 * @throws InvalidPassageError if the text is empty or not canonical.
 */
export function parsePassage(text: string): ParsedPassage {
  if (typeof text !== 'string' || text.length === 0) {
    throw new InvalidPassageError('passage text must be a non-empty string');
  }
  if (/[^\S ]/.test(text)) {
    throw new InvalidPassageError('passage text must not contain whitespace other than spaces');
  }
  if (text.startsWith(' ') || text.endsWith(' ') || text.includes('  ')) {
    throw new InvalidPassageError(
      'passage text must use single spaces with no leading/trailing whitespace',
    );
  }
  const words: PassageWord[] = [];
  let start = 0;
  for (const part of text.split(' ')) {
    words.push({ text: part, start, end: start + part.length });
    start += part.length + 1;
  }
  return { text, length: text.length, words };
}
