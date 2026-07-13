import { parsePassage } from '@prosetype/engine';
import { describe, expect, it } from 'vitest';

import {
  applyNumbers,
  applyPunctuation,
  asWordCount,
  COMMA_PROB,
  COMMON_WORDS,
  generateWordText,
  NUMBER_PROB,
  SENTENCE_END_PROB,
  WORD_COUNTS,
} from '../src/lib/words';

/** A deterministic Rng stub that always returns the same value - forces every probabilistic branch on or off. */
function constantRng(value: number): () => number {
  return () => value;
}

/** A seeded LCG so "seeded-rng determinism" tests don't depend on `Math.random`. */
function seededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x80000000;
  };
}

/** Replays a fixed sequence of rng() results, repeating the last value once exhausted. */
function sequenceRng(values: readonly number[]): () => number {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)] ?? 0;
    i += 1;
    return v;
  };
}

describe('generateWordText', () => {
  it('produces exactly `count` words drawn from the common-word list', () => {
    for (const count of WORD_COUNTS) {
      const words = generateWordText(count).split(' ');
      expect(words).toHaveLength(count);
      const known = new Set(COMMON_WORDS);
      expect(words.every((w) => known.has(w))).toBe(true);
    }
  });

  it('emits canonical text the engine accepts (no double/edge spaces)', () => {
    const text = generateWordText(200);
    expect(text).not.toMatch(/\s{2,}|^\s|\s$|[^\S ]/);
    // parsePassage throws on any non-canonical text; here it must not.
    expect(() => parsePassage(text)).not.toThrow();
    expect(parsePassage(text).words).toHaveLength(200);
  });

  it('rejects a non-positive or non-integer count', () => {
    expect(() => generateWordText(0)).toThrow();
    expect(() => generateWordText(-5)).toThrow();
    expect(() => generateWordText(3.5)).toThrow();
  });

  it('is deterministic for a seeded rng (same seed -> identical output)', () => {
    expect(generateWordText(50, {}, seededRng(42))).toBe(generateWordText(50, {}, seededRng(42)));
    // A different seed should (overwhelmingly likely) diverge.
    expect(generateWordText(50, {}, seededRng(42))).not.toBe(generateWordText(50, {}, seededRng(7)));
  });

  it('produces text that is canonical and every word a known word, digit, or punctuation-decorated word when both toggles are on', () => {
    const count = 200;
    const text = generateWordText(count, { punctuation: true, numbers: true }, seededRng(123));
    const words = text.split(' ');
    expect(words).toHaveLength(count);
    expect(text).not.toMatch(/\s{2,}|^\s|\s$|[^\S ]/); // canonical (§6.2)
    expect(() => parsePassage(text)).not.toThrow();
    expect(parsePassage(text).words).toHaveLength(count);

    const known = new Set(COMMON_WORDS);
    for (const word of words) {
      const stripped = word.replace(/[.,!?]+$/, '').toLowerCase();
      expect(known.has(stripped) || /^\d+$/.test(stripped)).toBe(true);
    }
  });
});

describe('applyNumbers', () => {
  it('replaces every word with a digit-only number when the rng forces the branch on', () => {
    const words = ['the', 'be', 'of', 'and', 'a'];
    const result = applyNumbers(words, constantRng(0));
    expect(result).toHaveLength(words.length);
    expect(result.every((w) => /^\d+$/.test(w))).toBe(true);
  });

  it('leaves every word untouched when the rng forces the branch off', () => {
    const words = ['the', 'be', 'of', 'and', 'a'];
    const result = applyNumbers(words, constantRng(NUMBER_PROB)); // >= NUMBER_PROB never triggers
    expect(result).toEqual(words);
  });
});

describe('applyPunctuation', () => {
  it('preserves the word count and never introduces a space (canonicality)', () => {
    const words = ['run', 'far', 'home', 'now'];
    const result = applyPunctuation(words, constantRng(1));
    expect(result).toHaveLength(words.length);
    expect(result.every((w) => !/\s/.test(w))).toBe(true);
  });

  it('capitalizes the first word and terminates the last word even when no other rolls succeed', () => {
    // rng() === 1 never satisfies `< SENTENCE_END_PROB` or `< COMMA_PROB`.
    const result = applyPunctuation(['run', 'far', 'home'], constantRng(1));
    expect(result).toEqual(['Run', 'far', 'home.']);
  });

  it('capitalizes the word following a sentence-ending terminal, and only appends punctuation word-finally', () => {
    // word0: both rolls fail (no suffix); word1: sentence-end succeeds -> terminal + capitalize next;
    // word2: capitalized by the previous terminal, both rolls then fail; word3 (last): always a period.
    const fail = SENTENCE_END_PROB; // rng() < SENTENCE_END_PROB is false when equal
    const rng = sequenceRng([
      fail, // word0 sentence-end: fail
      COMMA_PROB, // word0 comma: fail
      0, // word1 sentence-end: succeed
      0, // terminal pick -> '.'
      fail, // word2 sentence-end: fail
      COMMA_PROB, // word2 comma: fail
    ]);
    const result = applyPunctuation(['aa', 'bb', 'cc', 'dd'], rng);
    expect(result).toEqual(['Aa', 'bb.', 'Cc', 'dd.']);
  });

  it('appends a trailing comma when the sentence-end roll fails but the comma roll succeeds', () => {
    const rng = sequenceRng([
      SENTENCE_END_PROB, // word0 sentence-end: fail
      0, // word0 comma: succeed
      SENTENCE_END_PROB, // word1 sentence-end: fail (last word ignores both rolls anyway)
    ]);
    const result = applyPunctuation(['aa', 'bb'], rng);
    expect(result).toEqual(['Aa,', 'bb.']);
  });
});

describe('asWordCount', () => {
  it('passes through known presets and falls back to 200 otherwise', () => {
    expect(asWordCount(25)).toBe(25);
    expect(asWordCount(200)).toBe(200);
    expect(asWordCount(37)).toBe(200);
    expect(asWordCount(Number.NaN)).toBe(200);
  });
});
