import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/build.ts';
import { loadConfig } from '../src/config.ts';

const testEnv = {
  DATABASE_URL: 'postgres://typeprose:typeprose@localhost:5432/typeprose',
  CORS_ORIGIN: 'http://localhost:5173',
  NODE_ENV: 'test',
};

describe('GET /api/v1/healthz', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(loadConfig(testEnv));
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 { ok: true }', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('sets rate-limit headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/healthz' });
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
  });

  it('allows the configured CORS origin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/healthz',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('never reflects a foreign origin', async () => {
    // With a static origin config, @fastify/cors always answers with the
    // configured origin; the point is a foreign origin is never echoed back.
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/healthz',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
