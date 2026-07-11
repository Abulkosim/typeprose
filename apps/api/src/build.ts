import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.ts';
import { createDbClient, type Db } from './db/client.ts';
import { createConsoleMailer, createResendMailer, type Mailer } from './mail/mailer.ts';
import { createDrizzlePassageRepository } from './passages/drizzle-repository.ts';
import type { PassageRepository } from './passages/repository.ts';
import { createDrizzleProfileRepository } from './profiles/drizzle-repository.ts';
import type { ProfileRepository } from './profiles/repository.ts';
import { createDrizzleResultRepository } from './results/drizzle-repository.ts';
import type { ResultRepository } from './results/repository.ts';
import { passageRoutes } from './routes/passages.ts';
import { profileRoutes } from './routes/profiles.ts';
import { resultRoutes } from './routes/results.ts';

/**
 * Optional dependency overrides so tests can substitute the data layer
 * (unit tests run with stubbed repositories, no live Postgres).
 */
export interface AppDeps {
  passageRepo?: PassageRepository;
  profileRepo?: ProfileRepository;
  resultRepo?: ResultRepository;
  /** Email transport for claim magic links; defaults to the console mailer. */
  mailer?: Mailer;
}

/**
 * App factory, separate from listen (plan §3) so tests can use `app.inject()`.
 */
export async function buildApp(config: AppConfig, deps: AppDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV !== 'test',
  });

  await app.register(cors, {
    origin: config.CORS_ORIGIN,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Only touch Postgres if any repo was left to the default (tests inject all
  // three). postgres.js connects lazily, so building never blocks on the DB.
  const needsDb =
    deps.passageRepo === undefined ||
    deps.profileRepo === undefined ||
    deps.resultRepo === undefined;
  const client = needsDb ? createDbClient(config.DATABASE_URL) : null;
  if (client !== null) {
    app.addHook('onClose', async () => {
      await client.sql.end();
    });
  }
  const db = (): Db => {
    if (client === null) throw new Error('db client not initialized');
    return client.db;
  };

  const passageRepo = deps.passageRepo ?? createDrizzlePassageRepository(db());
  const profileRepo = deps.profileRepo ?? createDrizzleProfileRepository(db());
  const resultRepo = deps.resultRepo ?? createDrizzleResultRepository(db());

  app.get('/api/v1/healthz', async () => ({ ok: true as const }));

  await app.register(passageRoutes, { prefix: '/api/v1', repo: passageRepo });
  // Real transport when configured (RESEND_API_KEY + EMAIL_FROM, enforced by
  // config), else the dev console mailer that logs the link.
  const defaultMailer =
    config.RESEND_API_KEY !== undefined && config.EMAIL_FROM !== undefined
      ? createResendMailer({ apiKey: config.RESEND_API_KEY, from: config.EMAIL_FROM })
      : createConsoleMailer((msg) => app.log.info(msg));
  const mailer = deps.mailer ?? defaultMailer;

  await app.register(profileRoutes, {
    prefix: '/api/v1',
    profiles: profileRepo,
    results: resultRepo,
    mailer,
    webOrigin: config.CORS_ORIGIN,
  });
  await app.register(resultRoutes, {
    prefix: '/api/v1',
    profiles: profileRepo,
    passages: passageRepo,
    results: resultRepo,
  });

  return app;
}
