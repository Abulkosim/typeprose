import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from './config.ts';

/**
 * App factory, separate from listen (plan §3) so tests can use `app.inject()`.
 */
export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
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

  app.get('/api/v1/healthz', async () => ({ ok: true as const }));

  return app;
}
