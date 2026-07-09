/**
 * Data access for anonymous profiles (plan §4, §8, §9.2). Kept behind an
 * interface so route tests can substitute an in-memory stub (no live Postgres
 * in unit tests).
 */
/** A pending email-claim magic link to persist (Phase 3, §10.3). */
export interface ClaimTokenInput {
  token: string;
  profileId: string;
  email: string;
  expiresAt: Date;
}

/**
 * Result of verifying a claim token. `ok` carries the canonical profile id to
 * adopt (differs from the requester when an existing profile owned the email
 * and this one's results were merged in) and the display name.
 */
export type ClaimOutcome =
  | { status: 'ok'; profileId: string; displayName: string }
  | { status: 'invalid' };

export interface ProfileRepository {
  /** Create an anonymous profile; returns its generated uuid. */
  create(): Promise<string>;
  /** Whether a profile with this id exists. */
  exists(id: string): Promise<boolean>;
  /** Persist a pending claim magic link (§10.3). */
  createClaimToken(input: ClaimTokenInput): Promise<void>;
  /**
   * Verify a claim token and perform the claim/merge atomically (§10.3):
   * consume the token, set the email on its profile (or merge this profile's
   * results into the existing owner of that email), and return the canonical
   * profile. `now` is passed in for the expiry check (testability).
   */
  verifyClaim(token: string, now: Date): Promise<ClaimOutcome>;
}
