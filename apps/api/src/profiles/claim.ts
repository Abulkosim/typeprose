import { randomBytes } from 'node:crypto';

/**
 * Account-claim helpers (Phase 3, plan §10.3, email magic link). The link is a
 * short-lived, single-use token; verifying it claims the anonymous profile
 * (and merges into an existing one if that email was already claimed).
 */

/** Magic links expire 30 minutes after issue. */
export const CLAIM_TOKEN_TTL_MS = 30 * 60 * 1000;

/** A URL-safe random token (192 bits). */
export function generateClaimToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Default display name from an email's local part, e.g. "ada@x.io" → "ada". */
export function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0]?.trim() ?? '';
  return local.length > 0 ? local : 'reader';
}
