import { computeStats, MalformedLogError, type RunStats } from '@prosetype/engine';
import { postResultsRequestSchema, type Leaderboard } from '@prosetype/schema';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PassageRepository } from '../passages/repository.ts';
import type { ProfileRepository } from '../profiles/repository.ts';
import type { ResultRepository } from '../results/repository.ts';
import { sendBadRequest, sendBadRequestMessage, sendNotFound } from './http.ts';

/** POST /results sanity thresholds (plan §8). */
export const MIN_DURATION_MS = 3000;
export const MAX_PLAUSIBLE_WPM = 350;
/**
 * Upper bound on events per passage character before a log is "implausible"
 * for the passage length (plan §8). A real run adds each char once plus
 * corrections/backspaces/over-cap presses; 20×charCount + slack is generous
 * and well under the 6000-event wire cap.
 */
export const MAX_EVENTS_PER_CHAR = 20;
export const EVENT_COUNT_SLACK = 50;

/** Client/server agreement tolerance (plan §8): 2% relative or 1.0 absolute. */
function withinTolerance(server: number, client: number): boolean {
  return Math.abs(server - client) <= Math.max(1.0, 0.02 * Math.abs(server));
}

/** All four stats must agree within tolerance for client_match (plan §8). */
function statsMatch(server: RunStats, client: RunStats): boolean {
  return (
    withinTolerance(server.wpm, client.wpm) &&
    withinTolerance(server.rawWpm, client.rawWpm) &&
    withinTolerance(server.accuracy, client.accuracy) &&
    withinTolerance(server.consistency, client.consistency)
  );
}

export interface ResultRoutesOptions {
  profiles: ProfileRepository;
  passages: PassageRepository;
  results: ResultRepository;
}

/** Default and max leaderboard size (plan silent, boring bounds). */
export const DEFAULT_LEADERBOARD_LIMIT = 20;
export const MAX_LEADERBOARD_LIMIT = 100;

const leaderboardQuerySchema = z.object({
  passageId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(MAX_LEADERBOARD_LIMIT).default(DEFAULT_LEADERBOARD_LIMIT),
});

/**
 * POST /results (plan §8): validate, recompute stats server-side via the shared
 * engine, compare with the client's numbers, and persist the server-computed
 * values. Mismatches are stored and flagged (`client_match = false`), never
 * rejected, a mismatch may be a client bug, not cheating. Rate-limited to
 * 20/min (tighter than the global 100/min).
 */
export async function resultRoutes(app: FastifyInstance, opts: ResultRoutesOptions): Promise<void> {
  const { profiles, passages, results } = opts;

  // GET /leaderboard?passageId&limit (plan §10.3): each profile's best run.
  app.get('/leaderboard', async (request, reply) => {
    const parsed = leaderboardQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendBadRequest(reply, parsed.error);
    }
    const { passageId, limit } = parsed.data;
    const rows = await results.topResults({ passageId, limit });
    const board: Leaderboard = {
      passageId: passageId ?? null,
      entries: rows.map((row, index) => ({
        rank: index + 1,
        wpm: row.wpm,
        accuracy: row.accuracy,
        consistency: row.consistency,
        displayName: row.displayName,
        passageId: row.passageId,
        band: row.band,
        workTitle: row.workTitle,
        authorName: row.authorName,
        createdAt: row.createdAt.toISOString(),
      })),
    };
    return board;
  });

  app.post(
    '/results',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = postResultsRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, parsed.error);
      }
      const { profileId, passageId, clientStats, charEvents } = parsed.data;

      if (!(await profiles.exists(profileId))) {
        return sendNotFound(reply, `Profile ${profileId} not found`);
      }
      const passage = await passages.findById(passageId);
      if (passage === null) {
        return sendNotFound(reply, `Passage ${String(passageId)} not found`);
      }

      // Event count plausible for the passage length (plan §8 sanity check).
      const maxEvents = passage.charCount * MAX_EVENTS_PER_CHAR + EVENT_COUNT_SLACK;
      if (charEvents.events.length > maxEvents) {
        return sendBadRequestMessage(
          reply,
          `charEvents length ${String(charEvents.events.length)} is implausible for a ${String(passage.charCount)}-char passage`,
        );
      }

      // Recompute server-side from the log alone (the engine validates index
      // ranges and other semantics the wire schema cannot).
      let serverStats: RunStats;
      try {
        serverStats = computeStats(passage.text, charEvents);
      } catch (err) {
        if (err instanceof MalformedLogError) {
          return sendBadRequestMessage(reply, `charEvents did not replay: ${err.message}`);
        }
        throw err;
      }

      if (serverStats.durationMs < MIN_DURATION_MS) {
        return sendBadRequestMessage(
          reply,
          `run too short: ${String(serverStats.durationMs)}ms < ${String(MIN_DURATION_MS)}ms`,
        );
      }
      if (serverStats.wpm > MAX_PLAUSIBLE_WPM) {
        return sendBadRequestMessage(
          reply,
          `wpm ${String(serverStats.wpm)} exceeds the ${String(MAX_PLAUSIBLE_WPM)} plausibility ceiling`,
        );
      }

      const clientMatch = statsMatch(serverStats, clientStats);
      const id = await results.insert({
        profileId,
        passageId,
        wpm: serverStats.wpm,
        rawWpm: serverStats.rawWpm,
        accuracy: serverStats.accuracy,
        consistency: serverStats.consistency,
        durationMs: serverStats.durationMs,
        charEvents,
        clientMatch,
      });

      return reply.code(201).send({ id, serverStats, clientMatch });
    },
  );
}
