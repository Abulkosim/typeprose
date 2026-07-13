import type { ProfileStats } from '@prosetype/schema';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/build.ts';
import { loadConfig } from '../src/config.ts';
import { createStubPassageRepo, createStubProfileRepo, createStubResultRepo } from './support.ts';
import type { Mailer } from '../src/mail/mailer.ts';
import type { ProfileRepository } from '../src/profiles/repository.ts';
import type {
  ProfileAggregates,
  ResultRepository,
  StoredResultRow,
} from '../src/results/repository.ts';
import { shortPassage, testEnv, typeRun } from './support.ts';

const PROFILE_ID = '33333333-3333-4333-8333-333333333333';

function fixedProfileRepo(ids: string[]): ProfileRepository {
  return {
    async create() {
      return PROFILE_ID;
    },
    async exists(id: string) {
      return ids.includes(id);
    },
    async createClaimToken() {
      // no-op stub
    },
    async verifyClaim() {
      return { status: 'invalid' as const };
    },
    async getDailyStreak() {
      return { current: 0, best: 0, lastDate: null };
    },
    async recordDailyCompletion() {
      return { state: { current: 0, best: 0, lastDate: null }, extended: false };
    },
  };
}

function resultRepoWith(
  aggregates: ProfileAggregates,
  recent: StoredResultRow[],
): ResultRepository {
  return {
    async insert() {
      return 1;
    },
    async aggregatesForProfile() {
      return aggregates;
    },
    async recentForProfile() {
      return recent;
    },
    async topResults() {
      return [];
    },
    async bestWpmForProfile() {
      return null;
    },
  };
}

async function build(profileRepo: ProfileRepository, resultRepo: ResultRepository) {
  return buildApp(loadConfig(testEnv), {
    passageRepo: createStubPassageRepo([shortPassage]),
    profileRepo,
    resultRepo,
  });
}

describe('profile routes', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    if (app !== null) {
      await app.close();
      app = null;
    }
  });

  it('POST /profiles creates a profile and returns its uuid', async () => {
    app = await build(
      fixedProfileRepo([]),
      resultRepoWith(
        { tests: 0, timeTypedMs: 0, avgAccuracy: null, avgConsistency: null, best: null, perAuthor: [] },
        [],
      ),
    );
    const res = await app.inject({ method: 'POST', url: '/api/v1/profiles' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: PROFILE_ID });
  });

  it('GET /profiles/:id/stats returns empty aggregates for a fresh profile', async () => {
    app = await build(
      fixedProfileRepo([PROFILE_ID]),
      resultRepoWith(
        { tests: 0, timeTypedMs: 0, avgAccuracy: null, avgConsistency: null, best: null, perAuthor: [] },
        [],
      ),
    );
    const res = await app.inject({ method: 'GET', url: `/api/v1/profiles/${PROFILE_ID}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json<ProfileStats>();
    expect(stats.totals).toEqual({ tests: 0, timeTypedMs: 0 });
    expect(stats.bestWpm).toBeNull();
    expect(stats.avgWpmLast10).toBeNull();
    expect(stats.punctuationTaxAvgPct).toBeNull();
    expect(stats.perAuthor).toEqual([]);
    expect(stats.history).toEqual([]);
  });

  it('GET /profiles/:id/stats assembles totals, best, per-author, and history', async () => {
    const row: StoredResultRow = {
      id: 7,
      mode: 'prose',
      passageId: shortPassage.id,
      wpm: 57,
      rawWpm: 60,
      accuracy: 95,
      consistency: 88,
      durationMs: 5000,
      clientMatch: true,
      createdAt: new Date('2026-07-09T10:00:00.000Z'),
      band: 'warmup',
      workTitle: 'A Work',
      authorName: 'Anon',
      authorSlug: 'anon',
      passageText: shortPassage.text,
      wordText: null,
      charEvents: typeRun(shortPassage.text, 5000),
    };
    app = await build(
      fixedProfileRepo([PROFILE_ID]),
      resultRepoWith(
        {
          tests: 1,
          timeTypedMs: 5000,
          avgAccuracy: 95,
          avgConsistency: 88,
          best: {
            wpm: 57,
            mode: 'prose',
            passageId: shortPassage.id,
            workTitle: 'A Work',
            authorName: 'Anon',
            wordText: null,
          },
          perAuthor: [{ authorSlug: 'anon', authorName: 'Anon', tests: 1, avgWpm: 57 }],
        },
        [row],
      ),
    );
    const res = await app.inject({ method: 'GET', url: `/api/v1/profiles/${PROFILE_ID}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json<ProfileStats>();
    expect(stats.totals).toEqual({ tests: 1, timeTypedMs: 5000 });
    expect(stats.bestWpm).toEqual({
      wpm: 57,
      mode: 'prose',
      passageId: shortPassage.id,
      wordCount: null,
      workTitle: 'A Work',
      authorName: 'Anon',
    });
    expect(stats.avgWpmLast10).toBe(57);
    expect(stats.perAuthor).toEqual([
      { authorSlug: 'anon', authorName: 'Anon', tests: 1, avgWpm: 57 },
    ]);
    expect(stats.history).toHaveLength(1);
    expect(stats.history[0]).toMatchObject({
      id: 7,
      wpm: 57,
      createdAt: '2026-07-09T10:00:00.000Z',
      authorSlug: 'anon',
    });
  });

  it('rejects a non-uuid profile id with 400', async () => {
    app = await build(
      fixedProfileRepo([]),
      resultRepoWith(
        { tests: 0, timeTypedMs: 0, avgAccuracy: null, avgConsistency: null, best: null, perAuthor: [] },
        [],
      ),
    );
    const res = await app.inject({ method: 'GET', url: '/api/v1/profiles/not-a-uuid/stats' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'BadRequest' });
  });

  it('returns 404 for an unknown profile', async () => {
    app = await build(
      fixedProfileRepo([]),
      resultRepoWith(
        { tests: 0, timeTypedMs: 0, avgAccuracy: null, avgConsistency: null, best: null, perAuthor: [] },
        [],
      ),
    );
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/profiles/${PROFILE_ID}/stats`,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'NotFound' });
  });
});

describe('account claim (§10.3)', () => {
  const CLAIM_ID = '44444444-4444-4444-8444-444444444444';
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app !== null) {
      await app.close();
      app = null;
    }
  });

  function sent(): { email: string; url: string }[] {
    return links;
  }
  let links: { email: string; url: string }[] = [];

  async function setup() {
    links = [];
    const mailer: Mailer = {
      async sendClaimLink(input) {
        links.push(input);
      },
    };
    const profileRepo = createStubProfileRepo([CLAIM_ID]);
    app = await buildApp(loadConfig(testEnv), {
      passageRepo: createStubPassageRepo([shortPassage]),
      profileRepo,
      resultRepo: createStubResultRepo(),
      mailer,
    });
    return { app, profileRepo };
  }

  it('issues a magic link for a valid email and returns 202', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/profiles/${CLAIM_ID}/claim`,
      payload: { email: 'ada@example.com' },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ email: 'ada@example.com' });
    expect(sent()).toHaveLength(1);
    expect(sent()[0]?.url).toContain('/claim?token=');
  });

  it('rejects a malformed email with 400', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/profiles/${CLAIM_ID}/claim`,
      payload: { email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('404s a claim for an unknown profile', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/profiles/55555555-5555-4555-8555-555555555555/claim`,
      payload: { email: 'ada@example.com' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('verifies the emailed token and returns the display name', async () => {
    const { app } = await setup();
    await app.inject({
      method: 'POST',
      url: `/api/v1/profiles/${CLAIM_ID}/claim`,
      payload: { email: 'ada@example.com' },
    });
    const url = new URL(sent()[0]?.url ?? '');
    const token = url.searchParams.get('token');
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/claim/verify',
      payload: { token },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ profileId: CLAIM_ID, displayName: 'ada' });
  });

  it('rejects an unknown token with 400', async () => {
    const { app } = await setup();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/claim/verify',
      payload: { token: 'nope' },
    });
    expect(res.statusCode).toBe(400);
  });
});
