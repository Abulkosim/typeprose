import { z } from 'zod';

/**
 * Account-claim DTOs (Phase 3, plan §10.3). A magic-link flow: request a link
 * for an email, then verify the emailed token to claim (and merge) the profile.
 */

/** POST /profiles/:id/claim body. */
export const claimRequestSchema = z.object({
  email: z.email(),
});
export type ClaimRequest = z.infer<typeof claimRequestSchema>;

/** POST /profiles/:id/claim response (202): the address the link went to. */
export const claimRequestResponseSchema = z.object({
  email: z.email(),
});
export type ClaimRequestResponse = z.infer<typeof claimRequestResponseSchema>;

/** POST /claim/verify body. */
export const claimVerifyRequestSchema = z.object({
  token: z.string().min(1),
});
export type ClaimVerifyRequest = z.infer<typeof claimVerifyRequestSchema>;

/**
 * POST /claim/verify response: the canonical profile id to adopt (may differ
 * from the requesting profile if the email was already claimed and this
 * profile's results were merged into it) and its display name.
 */
export const claimVerifyResponseSchema = z.object({
  profileId: z.uuid(),
  displayName: z.string(),
});
export type ClaimVerifyResponse = z.infer<typeof claimVerifyResponseSchema>;
