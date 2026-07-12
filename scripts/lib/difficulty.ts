/**
 * Difficulty scoring per plan §6.4. Pure functions only.
 *
 *   raw = 1.5 * avgWordLength
 *       + 3.0 * punctuationCharsPer100Chars
 *       + 0.5 * percentWordsOfLength8Plus
 *       + 0.9 * avgSentenceLengthInWords
 *   difficulty = clamp(raw, 0, 100)
 *
 * Weights are the FROZEN calibration of 2026-07-07 (plan §6.4 says the listed
 * weights are "starting weights only - after seeding, calibrate ... then
 * freeze"). The original §6.4 starting weights (2.0 / 2.5 / 0.4 / 0.2) are
 * superseded: they compressed the 30-passage seed corpus into 17.6–38.4
 * (26 warmup / 4 standard / 0 hard / 0 brutal) because avg word length is
 * nearly constant across real prose (~3.7–4.9) while the discriminating
 * features - sentence length and punctuation density - were under-weighted.
 * The frozen weights spread the seed corpus 5 / 14 / 7 / 4 across bands.
 * Band thresholds are unchanged: warmup < 30 ≤ standard < 45 ≤ hard < 60 ≤ brutal.
 */

export const BANDS = ['warmup', 'standard', 'hard', 'brutal'] as const;
export type Band = (typeof BANDS)[number];

/** Punctuation characters of the §6.2 canonical set. */
const PUNCTUATION_RE = /[.,;:!?'"()-]/g;

/**
 * Frozen calibration weights (2026-07-07) - do not tune without re-running
 * the seed-corpus calibration; plan §6.4's starting weights are superseded.
 */
const WEIGHT_AVG_WORD_LENGTH = 1.5;
const WEIGHT_PUNCTUATION_PER_100_CHARS = 3.0;
const WEIGHT_PERCENT_WORDS_LENGTH_8_PLUS = 0.5;
const WEIGHT_AVG_SENTENCE_LENGTH_WORDS = 0.9;

export interface DifficultyBreakdown {
  avgWordLength: number;
  punctuationPer100Chars: number;
  percentWordsLength8Plus: number;
  avgSentenceLengthWords: number;
  /** clamp(raw, 0, 100), rounded to 2 decimals (numeric(5,2) in Postgres). */
  score: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Compute the difficulty breakdown for normalized (§6.2-canonical) text.
 * Word length counts letters/digits only - punctuation weight is already
 * carried by the punctuation term. Sentence count = number of `.!?` runs
 * (minimum 1).
 */
export function computeDifficulty(text: string): DifficultyBreakdown {
  if (text.length === 0) throw new Error('computeDifficulty requires non-empty text');

  const words = text.split(' ');
  const wordCount = words.length;
  const letterLengths = words.map((word) => word.replace(/[^A-Za-z0-9]/g, '').length);

  const avgWordLength = letterLengths.reduce((a, b) => a + b, 0) / wordCount;
  const punctuationCount = (text.match(PUNCTUATION_RE) ?? []).length;
  const punctuationPer100Chars = (punctuationCount / text.length) * 100;
  const longWordCount = letterLengths.filter((n) => n >= 8).length;
  const percentWordsLength8Plus = (longWordCount / wordCount) * 100;
  const sentenceCount = Math.max(1, (text.match(/[.!?]+/g) ?? []).length);
  const avgSentenceLengthWords = wordCount / sentenceCount;

  const raw =
    WEIGHT_AVG_WORD_LENGTH * avgWordLength +
    WEIGHT_PUNCTUATION_PER_100_CHARS * punctuationPer100Chars +
    WEIGHT_PERCENT_WORDS_LENGTH_8_PLUS * percentWordsLength8Plus +
    WEIGHT_AVG_SENTENCE_LENGTH_WORDS * avgSentenceLengthWords;

  return {
    avgWordLength,
    punctuationPer100Chars,
    percentWordsLength8Plus,
    avgSentenceLengthWords,
    score: round2(clamp(raw, 0, 100)),
  };
}

/** Band thresholds per §6.4: warmup < 30 ≤ standard < 45 ≤ hard < 60 ≤ brutal. */
export function bandForScore(score: number): Band {
  if (score < 30) return 'warmup';
  if (score < 45) return 'standard';
  if (score < 60) return 'hard';
  return 'brutal';
}

/** Apply a curator `band_override` from the YAML when present. */
export function resolveBand(score: number, override?: Band): Band {
  return override ?? bandForScore(score);
}
