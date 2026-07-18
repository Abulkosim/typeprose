import { computeStats } from '@typeprose/engine';
import { leaderboardSchema, MAX_CUSTOM_TEXT_LEN, type PostResultsResponse } from '@typeprose/schema';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/build.ts';
import { loadConfig } from '../src/config.ts';
import { utcDateKey } from '../src/passages/daily.ts';
import {
  createStubPassageRepo,
  createStubProfileRepo,
  createStubResultRepo,
  dailyPick,
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
      payload: {
        mode: 'prose',
        profileId: PROFILE_ID,
        passageId: shortPassage.id,
        clientStats,
        charEvents,
      },
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
      payload: {
        mode: 'prose',
        profileId: PROFILE_ID,
        passageId: fastPassage.id,
        clientStats,
        charEvents,
      },
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
      payload: {
        mode: 'prose',
        profileId: PROFILE_ID,
        passageId: shortPassage.id,
        clientStats,
        charEvents,
      },
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
      payload: {
        mode: 'words',
        profileId: PROFILE_ID,
        text,
        clientStats: computeStats(shortPassage.text, typeRun(shortPassage.text, 5000)),
        charEvents: typeRun(shortPassage.text, 5000),
      },
    });
    expect(res.statusCode).toBe(400);
    expect(resultRepo.inserted).toHaveLength(0);
  });

  it('rejects a word-mode run with no text (schema 400)', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: {
        mode: 'words',
        profileId: PROFILE_ID,
        clientStats: wordBody().clientStats,
        charEvents: wordBody().charEvents,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  // Timed mode (§2.3): words-shaped, but WPM measured over a fixed window that
  // the server reproduces from the submitted durationMs.
  const TIMED_WINDOW_MS = 30_000;
  function timedBody(overrides: Record<string, unknown> = {}) {
    // 8s of typing inside a 30s window: the run ends on the clock, not the text.
    const charEvents = typeRun(WORD_TEXT, 8000);
    const clientStats = computeStats(WORD_TEXT, charEvents, { durationOverrideMs: TIMED_WINDOW_MS });
    return {
      mode: 'timed',
      profileId: PROFILE_ID,
      text: WORD_TEXT,
      durationMs: TIMED_WINDOW_MS,
      clientStats,
      charEvents,
      ...overrides,
    };
  }

  it('stores a timed run with duration fixed to the submitted window', async () => {
    const { app, resultRepo } = await setup();
    const res = await app.inject({ method: 'POST', url: '/api/v1/results', payload: timedBody() });
    expect(res.statusCode).toBe(201);
    const parsed = res.json<PostResultsResponse>();
    expect(parsed.clientMatch).toBe(true);
    expect(parsed.serverStats.durationMs).toBe(TIMED_WINDOW_MS);
    const stored = resultRepo.inserted[0];
    expect(stored?.mode).toBe('timed');
    expect(stored?.passageId).toBeNull();
    expect(stored?.wordText).toBe(WORD_TEXT);
    expect(stored?.durationMs).toBe(TIMED_WINDOW_MS);
  });

  it('rejects a timed run whose log extends past its window (400, not stored)', async () => {
    const { app, resultRepo } = await setup();
    // 20s of keystrokes claimed under a 15s window - would inflate wpm.
    const charEvents = typeRun(WORD_TEXT, 20_000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: {
        mode: 'timed',
        profileId: PROFILE_ID,
        text: WORD_TEXT,
        durationMs: 15_000,
        clientStats: computeStats(WORD_TEXT, charEvents, { durationOverrideMs: 15_000 }),
        charEvents,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(resultRepo.inserted).toHaveLength(0);
  });

  it('rejects a timed run with an unsupported window (schema 400)', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: timedBody({ durationMs: 45_000 }),
    });
    expect(res.statusCode).toBe(400);
  });

  // Custom mode: user-pasted text, submitted in the word-mode shape but tagged
  // with its own mode so stored history stays honest about what was typed.
  it('stores a custom run recomputed against the submitted text', async () => {
    const { app, resultRepo } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: wordBody({ mode: 'custom' }),
    });
    expect(res.statusCode).toBe(201);
    const parsed = res.json<PostResultsResponse>();
    expect(parsed.clientMatch).toBe(true);
    const stored = resultRepo.inserted[0];
    expect(stored?.mode).toBe('custom');
    expect(stored?.passageId).toBeNull();
    expect(stored?.wordText).toBe(WORD_TEXT);
    // No passage → never a passage best, like a word run.
    expect(parsed.isNewPassageBest).toBe(false);
    expect(parsed.dailyStreak).toBeNull();
  });

  it('rejects a custom run with non-canonical text (400, not stored)', async () => {
    const { app, resultRepo } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      // Double space is non-canonical → the engine's parsePassage throws.
      payload: wordBody({ mode: 'custom', text: 'pasted  text with a double space here' }),
    });
    expect(res.statusCode).toBe(400);
    expect(resultRepo.inserted).toHaveLength(0);
  });

  it('rejects a custom run over the text cap (schema 400)', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: wordBody({ mode: 'custom', text: 'a'.repeat(MAX_CUSTOM_TEXT_LEN + 1) }),
    });
    expect(res.statusCode).toBe(400);
  });

  it('flags the first-ever run as a new best, both global and per-passage', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'POST', url: '/api/v1/results', payload: body() });
    const parsed = res.json<PostResultsResponse>();
    expect(parsed.isNewBest).toBe(true);
    expect(parsed.previousBestWpm).toBeNull();
    expect(parsed.isNewPassageBest).toBe(true);
    expect(parsed.previousPassageBestWpm).toBeNull();
  });

  it("compares a later run against the profile's prior best", async () => {
    const { app } = await setup();
    const first = await app.inject({ method: 'POST', url: '/api/v1/results', payload: body() });
    const firstWpm = first.json<PostResultsResponse>().serverStats.wpm;

    // A slower run over the same passage: neither a global nor a passage best.
    const slower = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: body({ charEvents: typeRun(shortPassage.text, 8000) }),
    });
    const slowerParsed = slower.json<PostResultsResponse>();
    expect(slowerParsed.serverStats.wpm).toBeLessThan(firstWpm);
    expect(slowerParsed.isNewBest).toBe(false);
    expect(slowerParsed.previousBestWpm).toBe(firstWpm);
    expect(slowerParsed.isNewPassageBest).toBe(false);
    expect(slowerParsed.previousPassageBestWpm).toBe(firstWpm);
  });

  it('a word run never counts toward a passage best', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'POST', url: '/api/v1/results', payload: wordBody() });
    const parsed = res.json<PostResultsResponse>();
    expect(parsed.isNewPassageBest).toBe(false);
    expect(parsed.previousPassageBestWpm).toBeNull();
  });
});

describe('POST /api/v1/results - daily streak (Batch C §2.1)', () => {
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

  const fixtures = [shortPassage, fastPassage];
  const todayKey = utcDateKey(new Date());
  const daily = dailyPick(fixtures, todayKey);
  if (daily === null) throw new Error('fixtures must be non-empty');
  const notDaily = fixtures.find((p) => p.id !== daily.id);
  if (notDaily === undefined) throw new Error('need a second, non-daily fixture');
  // Pull the id/text out to plain locals: TS narrowing of `daily` above doesn't
  // survive into the closures below (a fresh, non-nullable capture instead).
  const dailyId = daily.id;
  const dailyText = daily.text;

  function submitDaily(overrides: Record<string, unknown> = {}) {
    const charEvents = typeRun(dailyText, 5000);
    const clientStats = computeStats(dailyText, charEvents);
    return {
      mode: 'prose',
      profileId: PROFILE_ID,
      passageId: dailyId,
      clientStats,
      charEvents,
      ...overrides,
    };
  }

  it("a submission matching today's daily starts the streak at 1", async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: submitDaily(),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<PostResultsResponse>().dailyStreak).toEqual({
      current: 1,
      best: 1,
      extended: true,
    });
  });

  it('a same-day repeat of the daily reports the streak unchanged and not extended', async () => {
    const { app } = await setup();
    await app.inject({ method: 'POST', url: '/api/v1/results', payload: submitDaily() });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: submitDaily(),
    });
    expect(res.json<PostResultsResponse>().dailyStreak).toEqual({
      current: 1,
      best: 1,
      extended: false,
    });
  });

  it('a prose run against a non-daily passage reports no streak', async () => {
    const { app } = await setup();
    const charEvents = typeRun(notDaily.text, 5000);
    const clientStats = computeStats(notDaily.text, charEvents);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: {
        mode: 'prose',
        profileId: PROFILE_ID,
        passageId: notDaily.id,
        clientStats,
        charEvents,
      },
    });
    expect(res.json<PostResultsResponse>().dailyStreak).toBeNull();
  });

  it('a word run reports no streak', async () => {
    const { app } = await setup();
    const wordText = 'the quick brown fox jumps over the lazy dog again';
    const charEvents = typeRun(wordText, 5000);
    const clientStats = computeStats(wordText, charEvents);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: { mode: 'words', profileId: PROFILE_ID, text: wordText, clientStats, charEvents },
    });
    expect(res.json<PostResultsResponse>().dailyStreak).toBeNull();
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
            profileId: PROFILE_ID,
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
            profileId: '22222222-2222-4222-8222-222222222222',
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
    const raw = res.json() as { entries: Record<string, unknown>[] };
    // profileId is the bearer credential - it must never appear on the wire.
    expect(raw.entries[0]).not.toHaveProperty('profileId');
    expect(raw.entries[1]).not.toHaveProperty('profileId');
    const board = leaderboardSchema.parse(raw);
    expect(board.passageId).toBeNull();
    expect(board.entries.map((e) => e.rank)).toEqual([1, 2]);
    expect(board.entries[0]?.displayName).toBe('ada');
    expect(board.entries[1]?.displayName).toBeNull();
    // No ?self= was passed, so nothing is marked as the requester's own row.
    expect(board.entries[0]?.isSelf).toBe(false);
    expect(board.entries[1]?.isSelf).toBe(false);
    expect(board.entries[0]?.createdAt).toBe('2026-07-01T10:00:00.000Z');
  });

  it('marks the row matching ?self= as isSelf, and only that row', async () => {
    const resultRepo = {
      ...createStubResultRepo(),
      async topResults() {
        return [
          {
            wpm: 120.5,
            accuracy: 98,
            consistency: 90,
            displayName: 'ada',
            profileId: PROFILE_ID,
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
            profileId: '22222222-2222-4222-8222-222222222222',
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
    const res = await app.inject({ method: 'GET', url: `/api/v1/leaderboard?self=${PROFILE_ID}` });
    expect(res.statusCode).toBe(200);
    const board = leaderboardSchema.parse(res.json());
    expect(board.entries[0]?.isSelf).toBe(true);
    expect(board.entries[1]?.isSelf).toBe(false);
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
