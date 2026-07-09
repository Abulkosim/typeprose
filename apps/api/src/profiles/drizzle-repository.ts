import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { claimTokens, profiles, results } from '../db/schema.ts';
import { displayNameFromEmail } from './claim.ts';
import type { ClaimOutcome, ClaimTokenInput, ProfileRepository } from './repository.ts';

/** Drizzle-backed ProfileRepository. */
export function createDrizzleProfileRepository(db: Db): ProfileRepository {
  return {
    async create(): Promise<string> {
      const [row] = await db.insert(profiles).values({}).returning({ id: profiles.id });
      if (row === undefined) {
        throw new Error('profile insert returned no row');
      }
      return row.id;
    },

    async exists(id: string): Promise<boolean> {
      const rows = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.id, id))
        .limit(1);
      return rows.length > 0;
    },

    async createClaimToken(input: ClaimTokenInput): Promise<void> {
      await db.insert(claimTokens).values({
        token: input.token,
        profileId: input.profileId,
        email: input.email,
        expiresAt: input.expiresAt,
      });
    },

    async verifyClaim(token: string, now: Date): Promise<ClaimOutcome> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(claimTokens)
          .where(and(eq(claimTokens.token, token), isNull(claimTokens.usedAt)))
          .limit(1);
        if (row === undefined || row.expiresAt.getTime() <= now.getTime()) {
          return { status: 'invalid' };
        }
        await tx.update(claimTokens).set({ usedAt: now }).where(eq(claimTokens.token, token));

        const requesterId = row.profileId;
        const email = row.email;
        const [existing] = await tx
          .select({ id: profiles.id, displayName: profiles.displayName })
          .from(profiles)
          .where(eq(profiles.email, email))
          .limit(1);

        // Already claimed by a different profile → merge this one's results in.
        if (existing !== undefined && existing.id !== requesterId) {
          await tx
            .update(results)
            .set({ profileId: existing.id })
            .where(eq(results.profileId, requesterId));
          await tx.delete(claimTokens).where(eq(claimTokens.profileId, requesterId));
          await tx.delete(profiles).where(eq(profiles.id, requesterId));
          return {
            status: 'ok',
            profileId: existing.id,
            displayName: existing.displayName ?? displayNameFromEmail(email),
          };
        }

        // Otherwise the requesting profile becomes the owner of this email.
        const displayName = existing?.displayName ?? displayNameFromEmail(email);
        await tx
          .update(profiles)
          .set({ email, emailVerifiedAt: now, displayName })
          .where(eq(profiles.id, requesterId));
        return { status: 'ok', profileId: requesterId, displayName };
      });
    },
  };
}
