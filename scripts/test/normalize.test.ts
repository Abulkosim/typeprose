import { describe, expect, it } from 'vitest';

import { IllegalCharacterError, normalizeText } from '../lib/normalize.ts';

describe('normalizeText', () => {
  it('converts curly quotes to straight quotes', () => {
    const result = normalizeText('‘Tis “strange,” he said; ’twas so.');
    expect(result.text).toBe(`'Tis "strange," he said; 'twas so.`);
    expect(result.foldedWords).toEqual([]);
  });

  it('spaces tight em dashes into a spaced hyphen', () => {
    expect(normalizeText('heart\u2014and mind').text).toBe('heart - and mind');
  });

  it('collapses already-spaced em/en dashes to a single spaced hyphen', () => {
    expect(normalizeText('heart \u2014 and mind').text).toBe('heart - and mind');
    expect(normalizeText('1914 \u2013 1918').text).toBe('1914 - 1918');
  });

  it('converts ellipsis to three dots', () => {
    expect(normalizeText('and so… it ends').text).toBe('and so... it ends');
  });

  it('replaces exotic spaces and collapses whitespace runs', () => {
    expect(normalizeText('  a b c\nd\te  ').text).toBe('a b c d e');
  });

  it('folds accented Latin to ASCII and reports every folded word', () => {
    const result = normalizeText('a café näïve æon plain');
    expect(result.text).toBe('a cafe naive aeon plain');
    expect(result.foldedWords).toEqual([
      { original: 'café', folded: 'cafe' },
      { original: 'näïve', folded: 'naive' },
      { original: 'æon', folded: 'aeon' },
    ]);
    expect(result.foldedChars).toEqual(['é', 'ä', 'ï', 'æ']);
  });

  it('folds the exact mappings listed in the plan', () => {
    expect(normalizeText('é à ï æ œ').text).toBe('e a i ae oe');
  });

  it('fails loudly, naming the character, when a non-canonical character survives', () => {
    expect(() => normalizeText('price \u2014 40€')).toThrowError(IllegalCharacterError);
    expect(() => normalizeText('40€')).toThrowError(/"€" \(U\+20AC\)/);
  });

  it('names every distinct offending character once', () => {
    try {
      normalizeText('© 2026 № 5 ©');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalCharacterError);
      expect((error as IllegalCharacterError).characters).toEqual(['©', '№']);
    }
  });

  it('passes canonical text through untouched', () => {
    const text = `He said: "Well, then; go (if you must) - now!"`;
    expect(normalizeText(text).text).toBe(text);
  });
});
