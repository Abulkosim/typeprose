import type { Passage } from '@typeprose/schema';
import { describe, expect, it } from 'vitest';

import {
  deriveAuthors,
  deriveThemes,
  matchesFilter,
  openingOf,
  selectRandom,
  summariesByIds,
  toSummaries,
} from '../src/lib/corpus';

function makePassage(id: number, overrides: Partial<Passage> = {}): Passage {
  return {
    id,
    text: `passage number ${String(id)}`,
    charCount: 20,
    wordCount: 3,
    difficulty: 30,
    band: 'standard',
    themes: ['aphorisms'],
    language: 'en',
    work: { slug: 'work', title: 'A Work', translator: null, pubYear: 1900 },
    author: { slug: 'author', name: 'An Author', era: null },
    ...overrides,
  };
}

const dostoevsky = { slug: 'dostoevsky', name: 'Fyodor Dostoevsky', era: 'golden-age' };
const hammett = { slug: 'hammett', name: 'Dashiell Hammett', era: 'hardboiled' };

const CORPUS: Passage[] = [
  makePassage(1, { band: 'standard', themes: ['russian-soul'], author: dostoevsky }),
  makePassage(2, { band: 'warmup', themes: ['hardboiled'], author: hammett }),
  makePassage(3, { band: 'brutal', themes: ['russian-soul', 'gothic'], author: dostoevsky }),
];

describe('matchesFilter', () => {
  it('matches on band, theme, and author with AND semantics', () => {
    const p = CORPUS[0] as Passage;
    expect(matchesFilter(p, {})).toBe(true);
    expect(matchesFilter(p, { band: 'standard' })).toBe(true);
    expect(matchesFilter(p, { band: 'warmup' })).toBe(false);
    expect(matchesFilter(p, { theme: 'russian-soul' })).toBe(true);
    expect(matchesFilter(p, { theme: 'gothic' })).toBe(false);
    expect(matchesFilter(p, { author: 'dostoevsky' })).toBe(true);
    expect(matchesFilter(p, { author: 'dostoevsky', band: 'brutal' })).toBe(false);
  });
});

describe('selectRandom', () => {
  it('picks only among passages matching the filter', () => {
    const picked = selectRandom(CORPUS, { author: 'hammett' }, [], () => 0);
    expect(picked?.id).toBe(2);
  });

  it('excludes recently seen ids', () => {
    const picked = selectRandom(CORPUS, { author: 'dostoevsky' }, [1], () => 0);
    expect(picked?.id).toBe(3);
  });

  it('relaxes the exclude list rather than failing when it empties the pool', () => {
    // Online this would 404; offline a repeat beats a dead end.
    const picked = selectRandom(CORPUS, { author: 'hammett' }, [2], () => 0);
    expect(picked?.id).toBe(2);
  });

  it('returns null when nothing matches the filter at all', () => {
    expect(selectRandom(CORPUS, { band: 'hard' }, [])).toBeNull();
    expect(selectRandom([], {}, [])).toBeNull();
  });
});

describe('openingOf (parity with the API repository)', () => {
  it('returns short text untouched', () => {
    expect(openingOf('short text')).toBe('short text');
  });

  it('cuts at the last full word inside 60 chars and appends an ellipsis', () => {
    const text =
      'Pain and suffering are always inevitable for a large intelligence and a deep heart.';
    // Pinned to the exact output of `openingOf` in drizzle-repository.ts.
    expect(openingOf(text)).toBe('Pain and suffering are always inevitable for a large…');
    expect(openingOf(text).length).toBeLessThanOrEqual(61); // 60 + ellipsis
  });

  it('hard-cuts a single unbroken word', () => {
    const text = 'x'.repeat(80);
    expect(openingOf(text)).toBe(`${'x'.repeat(60)}…`);
  });
});

describe('toSummaries', () => {
  it('filters and orders by author name, work title, then id', () => {
    const summaries = toSummaries(CORPUS, {});
    expect(summaries.map((s) => s.id)).toEqual([2, 1, 3]); // Dashiell < Fyodor; then id
    expect(summaries[0]).toMatchObject({
      id: 2,
      band: 'warmup',
      work: { title: 'A Work' },
      author: { slug: 'hammett', name: 'Dashiell Hammett' },
    });
  });

  it('applies the query filter', () => {
    expect(toSummaries(CORPUS, { theme: 'gothic' }).map((s) => s.id)).toEqual([3]);
  });
});

describe('summariesByIds', () => {
  it('returns summaries in the given id order, dropping unknown ids', () => {
    expect(summariesByIds(CORPUS, [3, 99, 1]).map((s) => s.id)).toEqual([3, 1]);
  });
});

describe('deriveAuthors / deriveThemes', () => {
  it('counts passages per author, ordered by name', () => {
    expect(deriveAuthors(CORPUS)).toEqual([
      { slug: 'hammett', name: 'Dashiell Hammett', era: 'hardboiled', passageCount: 1 },
      { slug: 'dostoevsky', name: 'Fyodor Dostoevsky', era: 'golden-age', passageCount: 2 },
    ]);
  });

  it('counts passages per theme, ordered by theme', () => {
    expect(deriveThemes(CORPUS)).toEqual([
      { theme: 'gothic', passageCount: 1 },
      { theme: 'hardboiled', passageCount: 1 },
      { theme: 'russian-soul', passageCount: 2 },
    ]);
  });
});
