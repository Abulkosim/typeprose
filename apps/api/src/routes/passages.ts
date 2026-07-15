import { bandSchema } from '@typeprose/schema';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { utcDateKey } from '../passages/daily.ts';
import type { PassageFilter, PassageListFilter, PassageRepository } from '../passages/repository.ts';
import { sendBadRequest, sendNotFound } from './http.ts';

/** Max recent passage ids accepted in `exclude` (plan §8: "cap 20"). */
export const MAX_EXCLUDE_IDS = 20;

const nextQuerySchema = z.object({
  band: bandSchema.optional(),
  theme: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  exclude: z
    .string()
    .regex(/^\d+(,\d+)*$/, 'exclude must be a comma-separated list of passage ids')
    .transform((value) => value.split(',').map(Number))
    .pipe(
      z
        .array(z.int().positive())
        .max(MAX_EXCLUDE_IDS, `exclude accepts at most ${MAX_EXCLUDE_IDS} ids`),
    )
    .optional(),
});

const idParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const listQuerySchema = z.object({
  band: bandSchema.optional(),
  theme: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
});

function describeFilter(filter: PassageFilter): string {
  const parts = [
    filter.band !== undefined ? `band=${filter.band}` : null,
    filter.theme !== undefined ? `theme=${filter.theme}` : null,
    filter.author !== undefined ? `author=${filter.author}` : null,
    filter.excludeIds.length > 0 ? `excluding ${String(filter.excludeIds.length)} recent` : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(', ') : 'no filters';
}

export interface PassageRoutesOptions {
  repo: PassageRepository;
}

/**
 * GET /passages/next, GET /passages/:id, and GET /passages (plan §8, Phase 1
 * slice + batch B item 1.5). Registered under the /api/v1 prefix by buildApp.
 */
export async function passageRoutes(
  app: FastifyInstance,
  opts: PassageRoutesOptions,
): Promise<void> {
  const { repo } = opts;

  app.get('/passages/next', async (request, reply) => {
    const parsed = nextQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendBadRequest(reply, parsed.error);
    }
    const { band, theme, author, exclude } = parsed.data;
    const filter: PassageFilter = { band, theme, author, excludeIds: exclude ?? [] };
    const passage = await repo.findRandom(filter);
    if (passage === null) {
      return sendNotFound(reply, `No passage matches the given filters (${describeFilter(filter)})`);
    }
    return passage;
  });

  app.get('/passages/daily', async (_request, reply) => {
    const passage = await repo.findDaily(utcDateKey(new Date()));
    if (passage === null) {
      return sendNotFound(reply, 'No passages are available');
    }
    return passage;
  });

  app.get('/passages/:id', async (request, reply) => {
    const parsed = idParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return sendBadRequest(reply, parsed.error);
    }
    const { id } = parsed.data;
    const passage = await repo.findById(id);
    if (passage === null) {
      return sendNotFound(reply, `Passage ${String(id)} not found`);
    }
    return passage;
  });

  // GET /authors and GET /themes power the /library page (plan §8, §9.1).
  app.get('/authors', async () => repo.listAuthors());

  app.get('/themes', async () => repo.listThemes());

  // GET /passages - per-passage listing for the library (batch B item 1.5),
  // filtered by band/theme/author so the client only asks for one group at a time.
  app.get('/passages', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendBadRequest(reply, parsed.error);
    }
    const filter: PassageListFilter = parsed.data;
    return repo.list(filter);
  });
}
