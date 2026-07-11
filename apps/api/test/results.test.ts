import { computeStats } from '@prosetype/engine';
import { leaderboardSchema, type PostResultsResponse } from '@prosetype/schema';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/build.ts';
import { loadConfig } from '../src/config.ts';
import {
  createStubPassageRepo,
  createStubProfileRepo,
  createStubResultRepo,
  fastPassage,
  shortPassage,
  testEnv,
  typeRun,
} from './support.ts';

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';

function makeApp() {
  const passageRepo = createStubPassageRepo([shortPassage, fastPassage]);
  const profileRepo = createStubProfileRepo([PROFILE_ID]);
  const resultRepo = createStubResultRepo();
  return { passageRepo, profileRepo, resultRepo };
}

describe('POST /api/v1/results', () => {
  let app: FastifyInstance | null = null;

  async function setup() {
    const deps = makeApp();
    app = await buildApp(loadConfig(testEnv), deps);
    return { app, ...deps };
  }

  afterEach(async () => {
    if (app !== null) {
      await app.close();
      app = null;
    }
  });

  function body(overrides: Record<string, unknown> = {}) {
    const charEvents = typeRun(shortPassage.text, 5000);
    const clientStats = computeStats(shortPassage.text, charEvents);
    return {
      mode: 'prose',
      profileId: PROFILE_ID,
      passageId: shortPassage.id,
      clientStats,
      charEvents,
      ...overrides,
    };
  }

  /** A canonical word-mode text and a clean run over it. */
  const WORD_TEXT = 'the quick brown fox jumps over the lazy dog again';

  function wordBody(overrides: Record<string, unknown> = {}) {
    const charEvents = typeRun(WORD_TEXT, 5000);
    const clientStats = computeStats(WORD_TEXT, charEvents);
    return {
      mode: 'words',
      profileId: PROFILE_ID,
      text: WORD_TEXT,
      clientStats,
      charEvents,
      ...overrides,
    };
  }

  it('stores server-computed stats and flags client_match true when they agree', async () => {
    const { app, resultRepo } = await setup();
    const res = await app.inject({ method: 'POST', url: '/api/v1/results', payload: body() });
    expect(res.statusCode).toBe(201);
    const parsed = res.json<PostResultsResponse>();
    expect(parsed.clientMatch).toBe(true);
    expect(parsed.id).toBe(1);
    // The stored row carries the SERVER values, not whatever the client sent.
    const stored = resultRepo.inserted[0];
    expect(stored).toBeDefined();
    expect(stored?.wpm).toBe(parsed.serverStats.wpm);
    expect(stored?.clientMatch).toBe(true);
    expect(stored?.profileId).toBe(PROFILE_ID);
  });

  it('flags client_match false but still stores when client stats disagree', async () => {
    const { app, resultRepo } = await setup();
    const payload = body();
    payload.clientStats = { ...payload.clientStats, wpm: payload.clientStats.wpm + 40 };
    const res = await app.inject({ method: 'POST', url: '/api/v1/results', payload });
    expect(res.statusCode).toBe(201);
    expect(res.json<PostResultsResponse>().clientMatch).toBe(false);
    expect(resultRepo.inserted).toHaveLength(1);
    expect(resultRepo.inserted[0]?.clientMatch).toBe(false);
  });

  it('rejects a run shorter than 3s with 400', async () => {
    const { app, resultRepo } = await setup();
    const charEvents = typeRun(shortPassage.text, 2000);
    const clientStats = computeStats(shortPassage.text, charEvents);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: { mode: 'prose', profileId: PROFILE_ID, passageId: shortPassage.id, clientStats, charEvents },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'BadRequest' });
    expect(resultRepo.inserted).toHaveLength(0);
  });

  it('rejects a run exceeding the 350 wpm ceiling with 400', async () => {
    const { app } = await setup();
    // 90 correct chars in exactly 3s → 90*60/3/5 = 360 wpm.
    const charEvents = typeRun(fastPassage.text, 3000);
    const clientStats = computeStats(fastPassage.text, charEvents);
    expect(clientStats.wpm).toBeGreaterThan(350);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: { mode: 'prose', profileId: PROFILE_ID, passageId: fastPassage.id, clientStats, charEvents },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a charEvents log that cannot replay with 400', async () => {
    const { app } = await setup();
    // Index 999 is far outside the 19-char passage → IndexOutOfRangeError.
    const charEvents = { v: 1 as const, events: [[0, 999, 0] as [number, number, number]] };
    const clientStats = { wpm: 10, rawWpm: 10, accuracy: 100, consistency: 100, durationMs: 5000 };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: { mode: 'prose', profileId: PROFILE_ID, passageId: shortPassage.id, clientStats, charEvents },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'BadRequest' });
  });

  it('rejects a schema-invalid body with 400', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: { profileId: 'not-a-uuid', passageId: shortPassage.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'BadRequest' });
  });

  it('returns 404 for an unknown profile', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: body({ profileId: '22222222-2222-4222-8222-222222222222' }),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'NotFound' });
  });

  it('returns 404 for an unknown passage', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: body({ passageId: 999 }),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'NotFound' });
  });

  it('stores a word-mode run recomputed against the submitted text', async () => {
    const { app, resultRepo } = await setup();
    const res = await app.inject({ method: 'POST', url: '/api/v1/results', payload: wordBody() });
    expect(res.statusCode).toBe(201);
    const parsed = res.json<PostResultsResponse>();
    expect(parsed.clientMatch).toBe(true);
    const stored = resultRepo.inserted[0];
    expect(stored).toBeDefined();
    expect(stored?.mode).toBe('words');
    expect(stored?.passageId).toBeNull();
    expect(stored?.wordText).toBe(WORD_TEXT);
    expect(stored?.wpm).toBe(parsed.serverStats.wpm);
  });

  it('rejects a word-mode run with non-canonical text (400, not stored)', async () => {
    const { app, resultRepo } = await setup();
    // Double space is non-canonical → the engine's parsePassage throws.
    const text = 'the  quick brown fox jumps over lazy dogs today please';
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: { mode: 'words', profileId: PROFILE_ID, text, clientStats: computeStats(shortPassage.text, typeRun(shortPassage.text, 5000)), charEvents: typeRun(shortPassage.text, 5000) },
    });
    expect(res.statusCode).toBe(400);
    expect(resultRepo.inserted).toHaveLength(0);
  });

  it('rejects a word-mode run with no text (schema 400)', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: { mode: 'words', profileId: PROFILE_ID, clientStats: wordBody().clientStats, charEvents: wordBody().charEvents },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/leaderboard', () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app !== null) {
      await app.close();
      app = null;
    }
  });

  it('ranks the repository rows and shapes them as the Leaderboard DTO', async () => {
    const resultRepo = {
      ...createStubResultRepo(),
      async topResults() {
        return [
          {
            wpm: 120.5,
            accuracy: 98,
            consistency: 90,
            displayName: 'ada',
            passageId: 2,
            band: 'standard' as const,
            workTitle: 'The Maltese Falcon',
            authorName: 'Dashiell Hammett',
            createdAt: new Date('2026-07-01T10:00:00Z'),
          },
          {
            wpm: 88,
            accuracy: 95,
            consistency: 85,
            displayName: null,
            passageId: 2,
            band: 'standard' as const,
            workTitle: 'The Maltese Falcon',
            authorName: 'Dashiell Hammett',
            createdAt: new Date('2026-07-02T10:00:00Z'),
          },
        ];
      },
    };
    app = await buildApp(loadConfig(testEnv), {
      passageRepo: createStubPassageRepo([shortPassage, fastPassage]),
      profileRepo: createStubProfileRepo([PROFILE_ID]),
      resultRepo,
    });
    const res = await app.inject({ method: 'GET', url: '/api/v1/leaderboard' });
    expect(res.statusCode).toBe(200);
    const board = leaderboardSchema.parse(res.json());
    expect(board.passageId).toBeNull();
    expect(board.entries.map((e) => e.rank)).toEqual([1, 2]);
    expect(board.entries[0]?.displayName).toBe('ada');
    expect(board.entries[1]?.displayName).toBeNull();
    expect(board.entries[0]?.createdAt).toBe('2026-07-01T10:00:00.000Z');
  });

  it('echoes the passage scope and rejects a bad limit', async () => {
    app = await buildApp(loadConfig(testEnv), {
      passageRepo: createStubPassageRepo([shortPassage, fastPassage]),
      profileRepo: createStubProfileRepo([PROFILE_ID]),
      resultRepo: createStubResultRepo(),
    });
    const scoped = await app.inject({ method: 'GET', url: '/api/v1/leaderboard?passageId=2' });
    expect(scoped.statusCode).toBe(200);
    expect(leaderboardSchema.parse(scoped.json()).passageId).toBe(2);
    const bad = await app.inject({ method: 'GET', url: '/api/v1/leaderboard?limit=0' });
    expect(bad.statusCode).toBe(400);
  });
});
