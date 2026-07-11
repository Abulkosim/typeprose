import { parsePassage } from '@prosetype/engine';
import { describe, expect, it } from 'vitest';

import { asWordCount, COMMON_WORDS, generateWordText, WORD_COUNTS } from '../src/lib/words';

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
});

describe('asWordCount', () => {
  it('passes through known presets and falls back to 200 otherwise', () => {
    expect(asWordCount(25)).toBe(25);
    expect(asWordCount(200)).toBe(200);
    expect(asWordCount(37)).toBe(200);
    expect(asWordCount(Number.NaN)).toBe(200);
  });
});
