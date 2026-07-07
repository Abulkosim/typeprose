import { describe, expect, it } from 'vitest';

import { bandForScore, computeDifficulty, resolveBand } from '../lib/difficulty.ts';

describe('computeDifficulty', () => {
  it('computes the frozen-weight formula on a hand-worked example', () => {
    // "It was a dark night." — 20 chars, words [2,3,1,4,5] letters, 1 punct, 1 sentence.
    // raw = 1.5*3 + 3.0*(1/20*100) + 0.5*0 + 0.9*5 = 4.5 + 15 + 0 + 4.5 = 24
    const b = computeDifficulty('It was a dark night.');
    expect(b.avgWordLength).toBeCloseTo(3, 10);
    expect(b.punctuationPer100Chars).toBeCloseTo(5, 10);
    expect(b.percentWordsLength8Plus).toBeCloseTo(0, 10);
    expect(b.avgSentenceLengthWords).toBeCloseTo(5, 10);
    expect(b.score).toBe(24);
  });

  it('weights long words and punctuation density', () => {
    // 9 words; letters [12,3,9,3,10,9,7,7,6] = 66, + 3 punct (";", ",", ".")
    // + 8 spaces = 77 chars; 4 words >= 8 letters; 1 sentence terminator run.
    // raw = 1.5*(66/9) + 3.0*(3/77*100) + 0.5*(4/9*100) + 0.9*9
    //     = 11 + 11.6883... + 22.2222... + 8.1 = 53.0105... → 53.01
    const b = computeDifficulty(
      'Intelligence and suffering are inevitable; greatness demands sadness, always.',
    );
    expect(b.avgWordLength).toBeCloseTo(66 / 9, 10);
    expect(b.punctuationPer100Chars).toBeCloseTo(300 / 77, 10);
    expect(b.percentWordsLength8Plus).toBeCloseTo(400 / 9, 10);
    expect(b.avgSentenceLengthWords).toBeCloseTo(9, 10);
    expect(b.score).toBe(53.01);
  });

  it('counts a terminator-free passage as one sentence', () => {
    // raw = 1.5*3 + 0 + 0 + 0.9*5 = 9
    expect(computeDifficulty('it was a dark night').score).toBe(9);
  });

  it('clamps the score to 100', () => {
    // All punctuation: 3.0 * 100 per-100-chars alone exceeds the cap.
    expect(computeDifficulty('!!!!!!!!!!').score).toBe(100);
  });

  it('throws on empty text', () => {
    expect(() => computeDifficulty('')).toThrowError();
  });
});

describe('bandForScore', () => {
  it('applies warmup < 30 <= standard < 45 <= hard < 60 <= brutal', () => {
    expect(bandForScore(0)).toBe('warmup');
    expect(bandForScore(29.99)).toBe('warmup');
    expect(bandForScore(30)).toBe('standard');
    expect(bandForScore(44.99)).toBe('standard');
    expect(bandForScore(45)).toBe('hard');
    expect(bandForScore(59.99)).toBe('hard');
    expect(bandForScore(60)).toBe('brutal');
    expect(bandForScore(100)).toBe('brutal');
  });
});

describe('resolveBand', () => {
  it('uses the computed band when no override is given', () => {
    expect(resolveBand(19.5)).toBe('warmup');
  });

  it('prefers the curator band_override', () => {
    expect(resolveBand(19.5, 'brutal')).toBe('brutal');
    expect(resolveBand(75, 'warmup')).toBe('warmup');
  });
});
