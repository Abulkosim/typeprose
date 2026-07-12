import type { RunStats } from '@prosetype/engine';
import type { Passage } from '@prosetype/schema';
import { describe, expect, it } from 'vitest';

import { cardFilename, formatAttribution } from '../src/lib/shareCard';

function passage(overrides: Partial<Passage['work'] & Passage['author']> = {}): Passage {
  return {
    id: 1,
    text: 'x',
    charCount: 1,
    wordCount: 1,
    difficulty: 30,
    band: 'standard',
    themes: [],
    language: 'en',
    work: {
      slug: 'crime-and-punishment',
      title: 'Crime and Punishment',
      translator: 'translator' in overrides ? (overrides.translator ?? null) : 'Constance Garnett',
      pubYear: 1914,
    },
    author: { slug: overrides.slug ?? 'dostoevsky', name: 'Fyodor Dostoevsky', era: 'russian' },
  };
}

describe('formatAttribution', () => {
  it('includes the translator when present', () => {
    expect(formatAttribution(passage())).toBe(
      '- Fyodor Dostoevsky, Crime and Punishment, trans. Constance Garnett',
    );
  });

  it('omits the translator clause when null', () => {
    expect(formatAttribution(passage({ translator: null }))).toBe(
      '- Fyodor Dostoevsky, Crime and Punishment',
    );
  });
});

describe('cardFilename', () => {
  it('is slug + rounded wpm', () => {
    const stats = { wpm: 91.6 } as RunStats;
    expect(cardFilename(passage({ slug: 'woolf' }), stats)).toBe('prosetype-woolf-92wpm.png');
  });
});
