import { describe, expect, it } from 'vitest';

import { displayNameFromEmail, generateClaimToken } from '../src/profiles/claim.ts';

describe('displayNameFromEmail', () => {
  it('uses the local part before @', () => {
    expect(displayNameFromEmail('ada@example.com')).toBe('ada');
    expect(displayNameFromEmail('grace.hopper@navy.mil')).toBe('grace.hopper');
  });

  it('falls back to "reader" when the local part is empty', () => {
    expect(displayNameFromEmail('@example.com')).toBe('reader');
  });
});

describe('generateClaimToken', () => {
  it('produces distinct URL-safe tokens', () => {
    const a = generateClaimToken();
    const b = generateClaimToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThan(20);
  });
});
