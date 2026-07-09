import { describe, expect, it } from 'vitest';

import { proposeExcerpts, splitParagraphs, splitSentences } from '../lib/propose.ts';

describe('splitParagraphs', () => {
  it('splits on blank lines and collapses whitespace', () => {
    expect(splitParagraphs('one\nline.\n\n  two   words.  ')).toEqual(['one line.', 'two words.']);
  });
});

describe('splitSentences', () => {
  it('splits at sentence terminators, keeping trailing quotes', () => {
    expect(splitSentences('He ran. She stayed! Why? "Yes," he said.')).toEqual([
      'He ran.',
      'She stayed!',
      'Why?',
      '"Yes," he said.',
    ]);
  });
});

describe('proposeExcerpts', () => {
  // Three sentences that together land in the 140-450 char, 25-80 word window.
  const prose = [
    'The lamp threw a narrow cone of amber light across the desk and left the corners of the room in a warm, uncertain dark.',
    'He read the letter twice, folded it along its old creases, and set it down beside the cooling cup of coffee.',
    'Outside, the rain had thinned to a fine mist that blurred the streetlights into soft, trembling coins of gold.',
  ].join(' ');

  it('proposes at least one in-range, sentence-aligned, normalized candidate', () => {
    const [top] = proposeExcerpts(prose);
    expect(top).toBeDefined();
    expect(top!.charCount).toBeGreaterThanOrEqual(140);
    expect(top!.charCount).toBeLessThanOrEqual(450);
    expect(top!.wordCount).toBeGreaterThanOrEqual(25);
    expect(top!.text.endsWith('.')).toBe(true);
    expect(['warmup', 'standard', 'hard', 'brutal']).toContain(top!.band);
  });

  it('flags dialogue (quotation marks) in a candidate', () => {
    const dialogue = [
      '"You will never understand what it cost me," she said, turning away from the window and the grey light.',
      '"I have spent my whole life trying to explain it to men exactly like you, and every one of them has failed."',
    ].join(' ');
    const [top] = proposeExcerpts(dialogue);
    expect(top?.hasDialogue).toBe(true);
  });

  it('returns nothing when no window fits the length window', () => {
    expect(proposeExcerpts('Too short. Still short.')).toEqual([]);
  });

  it('respects the limit', () => {
    expect(proposeExcerpts(prose, { limit: 1 }).length).toBeLessThanOrEqual(1);
  });
});
