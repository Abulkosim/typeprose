import {
  claimRequestSchema,
  claimVerifyRequestSchema,
  renameProfileRequestSchema,
  type GetProfileResponse,
} from '@typeprose/schema';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Mailer } from '../mail/mailer.ts';
import { utcDateKey } from '../passages/daily.ts';
import { CLAIM_TOKEN_TTL_MS, generateClaimToken } from '../profiles/claim.ts';
import type { ProfileInfo, ProfileRepository } from '../profiles/repository.ts';
import { effectiveDailyStreak } from '../profiles/streak.ts';
import type { ResultRepository } from '../results/repository.ts';
import { buildProfileStats } from '../results/stats.ts';
import { sendBadRequest, sendBadRequestMessage, sendNotFound } from './http.ts';

/** Most recent results returned in the stats history list (plan §8: "last 50"). */
export const STATS_HISTORY_LIMIT = 50;

const idParamsSchema = z.object({ id: z.uuid() });

/** Shape the stored profile fields into the wire response (§3.1). */
function toProfileResponse(profile: ProfileInfo): GetProfileResponse {
  return {
    id: profile.id,
    displayName: profile.displayName,
    claimed: profile.email !== null,
    email: profile.email,
  };
}

export interface ProfileRoutesOptions {
  profiles: ProfileRepository;
  results: ResultRepository;
  /** Transport for claim magic links (§10.3). */
  mailer: Mailer;
  /** Web origin the magic link points at (the /claim page). */
  webOrigin: string;
}

/**
 * POST /profiles (create anon profile) and GET /profiles/:id/stats
 * (aggregates + history), plan §8. Registered under the /api/v1 prefix.
 */
export async function profileRoutes(
  app: FastifyInstance,
  opts: ProfileRoutesOptions,
): Promise<void> {
  const { profiles, results, mailer, webOrigin } = opts;

  app.post('/profiles', async (_request, reply) => {
    const id = await profiles.create();
    return reply.code(201).send({ id });
  });

  // POST /profiles/:id/claim (§10.3): issue an email magic link for this
  // profile. Rate-limited tighter than the global default to deter mailbombing.
  app.post(
    '/profiles/:id/claim',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const params = idParamsSchema.safeParse(request.params);
      if (!params.success) {
        return sendBadRequest(reply, params.error);
      }
      const body = claimRequestSchema.safeParse(request.body);
      if (!body.success) {
        return sendBadRequest(reply, body.error);
      }
      if (!(await profiles.exists(params.data.id))) {
        return sendNotFound(reply, `Profile ${params.data.id} not found`);
      }
      const token = generateClaimToken();
      await profiles.createClaimToken({
        token,
        profileId: params.data.id,
        email: body.data.email,
        expiresAt: new Date(Date.now() + CLAIM_TOKEN_TTL_MS),
      });
      const url = `${webOrigin}/claim?token=${encodeURIComponent(token)}`;
      await mailer.sendClaimLink({ email: body.data.email, url });
      return reply.code(202).send({ email: body.data.email });
    },
  );

  // POST /claim/verify (§10.3): consume a magic link and claim/merge the profile.
  app.post('/claim/verify', async (request, reply) => {
    const body = claimVerifyRequestSchema.safeParse(request.body);
    if (!body.success) {
      return sendBadRequest(reply, body.error);
    }
    const outcome = await profiles.verifyClaim(body.data.token, new Date());
    if (outcome.status === 'invalid') {
      return sendBadRequestMessage(reply, 'Invalid or expired claim token');
    }
    return { profileId: outcome.profileId, displayName: outcome.displayName };
  });

  // GET /profiles/:id (§3.1 account management): the requesting client's own
  // profile info, for the /account page.
  app.get('/profiles/:id', async (request, reply) => {
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return sendBadRequest(reply, parsed.error);
    }
    const profile = await profiles.get(parsed.data.id);
    if (profile === null) {
      return sendNotFound(reply, `Profile ${parsed.data.id} not found`);
    }
    return toProfileResponse(profile);
  });

  // PATCH /profiles/:id (§3.1): rename the display name shown on the leaderboard.
  app.patch('/profiles/:id', async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendBadRequest(reply, params.error);
    }
    const body = renameProfileRequestSchema.safeParse(request.body);
    if (!body.success) {
      return sendBadRequest(reply, body.error);
    }
    const ok = await profiles.setDisplayName(params.data.id, body.data.displayName);
    if (!ok) {
      return sendNotFound(reply, `Profile ${params.data.id} not found`);
    }
    const profile = await profiles.get(params.data.id);
    if (profile === null) {
      return sendNotFound(reply, `Profile ${params.data.id} not found`);
    }
    return toProfileResponse(profile);
  });

  // DELETE /profiles/:id (§3.1): permanently delete a profile and its data.
  app.delete('/profiles/:id', async (request, reply) => {
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return sendBadRequest(reply, parsed.error);
    }
    const ok = await profiles.deleteProfile(parsed.data.id);
    if (!ok) {
      return sendNotFound(reply, `Profile ${parsed.data.id} not found`);
    }
    return reply.code(204).send();
  });

  app.get('/profiles/:id/stats', async (request, reply) => {
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return sendBadRequest(reply, parsed.error);
    }
    const { id } = parsed.data;
    if (!(await profiles.exists(id))) {
      return sendNotFound(reply, `Profile ${id} not found`);
    }
    const [aggregates, recent, streak] = await Promise.all([
      results.aggregatesForProfile(id),
      results.recentForProfile(id, STATS_HISTORY_LIMIT),
      profiles.getDailyStreak(id),
    ]);
    return buildProfileStats(
      aggregates,
      recent,
      effectiveDailyStreak(streak, utcDateKey(new Date())),
    );
  });
}
