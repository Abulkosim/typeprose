import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { claimTokens, profiles, results } from '../db/schema.ts';
import { displayNameFromEmail } from './claim.ts';
import type { ClaimOutcome, ClaimTokenInput, ProfileRepository } from './repository.ts';
import { advanceDailyStreak, mergeDailyStreaks, type DailyStreakState } from './streak.ts';

/** The daily-streak columns, selected together wherever a profile row is read. */
const streakSelection = {
  dailyStreak: profiles.dailyStreak,
  dailyBestStreak: profiles.dailyBestStreak,
  lastDailyDate: profiles.lastDailyDate,
};

function streakOf(row: {
  dailyStreak: number;
  dailyBestStreak: number;
  lastDailyDate: string | null;
}): DailyStreakState {
  return { current: row.dailyStreak, best: row.dailyBestStreak, lastDate: row.lastDailyDate };
}

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
          .select({ id: profiles.id, displayName: profiles.displayName, ...streakSelection })
          .from(profiles)
          .where(eq(profiles.email, email))
          .limit(1);

        // Already claimed by a different profile → merge this one's results in.
        if (existing !== undefined && existing.id !== requesterId) {
          // Read the requester's streak before its row is deleted and fold it
          // into the canonical profile's (Batch C §2.1) - this is what lets a
          // claimed profile keep its streak across devices.
          const [requester] = await tx
            .select(streakSelection)
            .from(profiles)
            .where(eq(profiles.id, requesterId))
            .limit(1);
          const mergedStreak =
            requester === undefined
              ? streakOf(existing)
              : mergeDailyStreaks(streakOf(existing), streakOf(requester));

          await tx
            .update(results)
            .set({ profileId: existing.id })
            .where(eq(results.profileId, requesterId));
          await tx.delete(claimTokens).where(eq(claimTokens.profileId, requesterId));
          await tx.delete(profiles).where(eq(profiles.id, requesterId));
          await tx
            .update(profiles)
            .set({
              dailyStreak: mergedStreak.current,
              dailyBestStreak: mergedStreak.best,
              lastDailyDate: mergedStreak.lastDate,
            })
            .where(eq(profiles.id, existing.id));
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

    async getDailyStreak(profileId: string): Promise<DailyStreakState> {
      const [row] = await db
        .select(streakSelection)
        .from(profiles)
        .where(eq(profiles.id, profileId))
        .limit(1);
      return row === undefined ? { current: 0, best: 0, lastDate: null } : streakOf(row);
    },

    async recordDailyCompletion(
      profileId: string,
      todayKey: string,
    ): Promise<{ state: DailyStreakState; extended: boolean }> {
      return db.transaction(async (tx) => {
        // Row-locked so two concurrent submissions for the same profile can't
        // both read the pre-advance state and double-advance the streak.
        const [row] = await tx
          .select(streakSelection)
          .from(profiles)
          .where(eq(profiles.id, profileId))
          .for('update')
          .limit(1);
        if (row === undefined) {
          throw new Error(`profile ${profileId} not found`);
        }
        const { state, extended } = advanceDailyStreak(streakOf(row), todayKey);
        if (extended) {
          await tx
            .update(profiles)
            .set({
              dailyStreak: state.current,
              dailyBestStreak: state.best,
              lastDailyDate: state.lastDate,
            })
            .where(eq(profiles.id, profileId));
        }
        return { state, extended };
      });
    },
  };
}
