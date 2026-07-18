import { describe, expect, it } from 'vitest';

import { parseCorpus } from '../lib/corpus.ts';
import { computeDifficulty, resolveBand } from '../lib/difficulty.ts';
import { normalizeText } from '@typeprose/engine';

/** Small fixture in the exact §5 curation format. */
const FIXTURE_YAML = `
- author: dostoevsky
  author_name: Fyodor Dostoevsky
  era: russian-golden-age
  work: crime-and-punishment
  title: Crime and Punishment
  translator: Constance Garnett
  pub_year: 1914
  source: 'gutenberg:2554'
  themes: [russian-soul]
  text: >
    Pain and suffering are always inevitable for a large intelligence and a
    deep heart. The really great men must, I think, have great sadness on
    earth.
- author: marcus-aurelius
  author_name: Marcus Aurelius
  work: meditations
  title: Meditations
  translator: George Long
  source: 'gutenberg:2680'
  themes: [aphorisms]
  band_override: warmup
  text: >
    Waste no more time arguing about what a good man should be. Be one.
`;

describe('parseCorpus', () => {
  it('parses the §5 curation format', () => {
    const entries = parseCorpus(FIXTURE_YAML);
    expect(entries).toHaveLength(2);
    const [first, second] = entries;
    expect(first?.author).toBe('dostoevsky');
    expect(first?.translator).toBe('Constance Garnett');
    expect(first?.pub_year).toBe(1914);
    expect(first?.themes).toEqual(['russian-soul']);
    expect(first?.language).toBe('en'); // defaulted
    expect(first?.band_override).toBeUndefined();
    expect(second?.band_override).toBe('warmup');
    expect(second?.era).toBeUndefined();
  });

  it('rejects unknown keys so curator typos fail loudly', () => {
    const yaml = FIXTURE_YAML.replace('band_override: warmup', 'band_overide: warmup');
    expect(() => parseCorpus(yaml)).toThrowError();
  });

  it('rejects entries missing required fields', () => {
    expect(() =>
      parseCorpus('- author: poe\n  author_name: Edgar Allan Poe\n  work: the-raven\n'),
    ).toThrowError();
  });

  it('rejects an invalid band_override value', () => {
    const yaml = FIXTURE_YAML.replace('band_override: warmup', 'band_override: nightmare');
    expect(() => parseCorpus(yaml)).toThrowError();
  });
});

describe('fixture end-to-end (normalize → difficulty → band)', () => {
  it('produces canonical single-line text from YAML folded scalars', () => {
    const entries = parseCorpus(FIXTURE_YAML);
    for (const entry of entries) {
      const { text } = normalizeText(entry.text);
      expect(text).not.toMatch(/\n/);
      expect(text).not.toMatch(/ {2}/);
      expect(text).toMatch(/^[A-Za-z0-9 .,;:!?'"()-]+$/);
    }
  });

  it('applies the band override from the fixture', () => {
    const entries = parseCorpus(FIXTURE_YAML);
    const aurelius = entries[1];
    expect(aurelius).toBeDefined();
    if (aurelius === undefined) return;
    const { text } = normalizeText(aurelius.text);
    const { score } = computeDifficulty(text);
    expect(resolveBand(score, aurelius.band_override)).toBe('warmup');
  });
});
