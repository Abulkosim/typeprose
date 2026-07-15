import { describe, expect, it } from 'vitest';

import { CREDIT_CARDS, CREDITS_HOLD_MS, CREDITS_MS_PER_CHAR } from '../src/credits/credits';

describe('credit cards', () => {
  it('opens on the wordmark and ends on a single final card', () => {
    expect(CREDIT_CARDS[0]?.title).toBe('typeprose');
    const finals = CREDIT_CARDS.filter((c) => c.final === true);
    expect(finals).toHaveLength(1);
    expect(CREDIT_CARDS[CREDIT_CARDS.length - 1]?.final).toBe(true);
  });

  it('every card has a typable lowercase title', () => {
    for (const card of CREDIT_CARDS) {
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.title).toBe(card.title.toLowerCase());
    }
  });

  it('titles stay unique (they key the frame-counter dots)', () => {
    const titles = CREDIT_CARDS.map((c) => c.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('the whole sequence stays brief - under half a minute unattended', () => {
    const totalMs = CREDIT_CARDS.reduce(
      (sum, c) => sum + c.title.length * CREDITS_MS_PER_CHAR + CREDITS_HOLD_MS,
      0,
    );
    expect(totalMs).toBeLessThan(30_000);
  });
});
