import { computeStats } from '@prosetype/engine';
import type {
  AuthorListItem,
  Passage,
  PostProfilesResponse,
  PostResultsResponse,
  ProfileStats,
  ThemeListItem,
} from '@prosetype/schema';
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/build.ts';
import { loadConfig } from '../src/config.ts';
import { testEnv, typeRun } from './support.ts';

const DB_URL = process.env['DATABASE_URL'] ?? testEnv.DATABASE_URL;

/**
 * These tests need a live Postgres (plan §11: "real Postgres in CI via service
 * container"). When one is not reachable they skip rather than fail, so a plain
 * `pnpm test` on a machine without a DB stays green; CI always has one.
 */
async function canConnect(url: string): Promise<boolean> {
  const sql = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

const dbAvailable = await canConnect(DB_URL);
if (!dbAvailable) {
  console.warn(`[integration] skipping - no Postgres reachable at ${DB_URL}`);
}
const suite = dbAvailable ? describe : describe.skip;

// Distinctive slugs so the fixtures never collide with the seeded corpus and
// are trivially cleaned up.
const AUTHOR_SLUG = 'zz-it-author';
const THEME = 'zz-it-theme';
const TEXT_A = 'The night was cold, and the rain fell without mercy.';
const TEXT_B = 'He said nothing; the silence answered for him.';

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

suite('API integration (real Postgres)', () => {
  const sql = postgres(DB_URL, { onnotice: () => {} });
  let app: FastifyInstance;
  let profileId: string;
  let passageAId: number;
  let passageBId: number;

  async function seedPassage(text: string, themes: string[], workId: number): Promise<number> {
    const words = text.split(' ').length;
    const [row] = await sql<{ id: number }[]>`
      insert into passages (work_id, text, text_hash, char_count, word_count, difficulty, band, themes, language)
      values (${workId}, ${text}, ${hash(text)}, ${text.length}, ${words}, ${25}, ${'standard'}, ${sql.array(themes)}, ${'en'})
      on conflict (text_hash) do update set char_count = excluded.char_count
      returning id`;
    if (row === undefined) throw new Error('passage seed failed');
    return row.id;
  }

  beforeAll(async () => {
    const [author] = await sql<{ id: number }[]>`
      insert into authors (slug, name, era) values (${AUTHOR_SLUG}, ${'ZZ Integration Author'}, ${'test'})
      on conflict (slug) do update set name = excluded.name returning id`;
    const authorId = author?.id;
    if (authorId === undefined) throw new Error('author seed failed');
    const [work] = await sql<{ id: number }[]>`
      insert into works (author_id, slug, title, source, language)
      values (${authorId}, ${'zz-it-work'}, ${'ZZ Integration Work'}, ${'test'}, ${'en'})
      on conflict (slug) do update set title = excluded.title returning id`;
    const workId = work?.id;
    if (workId === undefined) throw new Error('work seed failed');
    passageAId = await seedPassage(TEXT_A, [THEME], workId);
    passageBId = await seedPassage(TEXT_B, [THEME], workId);

    app = await buildApp(loadConfig({ ...testEnv, DATABASE_URL: DB_URL }));

    const res = await app.inject({ method: 'POST', url: '/api/v1/profiles' });
    profileId = res.json<PostProfilesResponse>().id;
  });

  afterAll(async () => {
    if (profileId !== undefined) {
      await sql`delete from results where profile_id = ${profileId}`;
      await sql`delete from profiles where id = ${profileId}`;
    }
    await sql`delete from passages where text_hash in (${hash(TEXT_A)}, ${hash(TEXT_B)})`;
    await sql`delete from works where slug = 'zz-it-work'`;
    await sql`delete from authors where slug = ${AUTHOR_SLUG}`;
    if (app !== undefined) await app.close();
    await sql.end({ timeout: 5 });
  });

  async function submit(passageId: number, text: string, durationMs = 6000): Promise<PostResultsResponse> {
    const charEvents = typeRun(text, durationMs);
    const clientStats = computeStats(text, charEvents);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: { mode: 'prose', profileId, passageId, clientStats, charEvents },
    });
    expect(res.statusCode).toBe(201);
    return res.json<PostResultsResponse>();
  }

  it('a fresh profile has empty stats', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/profiles/${profileId}/stats` });
    expect(res.statusCode).toBe(200);
    const stats = res.json<ProfileStats>();
    expect(stats.totals.tests).toBe(0);
    expect(stats.bestWpm).toBeNull();
    expect(stats.history).toEqual([]);
  });

  it('persists a submitted result and surfaces it in stats', async () => {
    const result = await submit(passageAId, TEXT_A);
    expect(result.clientMatch).toBe(true);
    expect(result.serverStats.wpm).toBeGreaterThan(0);

    const res = await app.inject({ method: 'GET', url: `/api/v1/profiles/${profileId}/stats` });
    const stats = res.json<ProfileStats>();
    expect(stats.totals.tests).toBe(1);
    expect(stats.totals.timeTypedMs).toBeGreaterThanOrEqual(6000);
    expect(stats.bestWpm?.passageId).toBe(passageAId);
    expect(stats.avgWpmLast10).toBeCloseTo(result.serverStats.wpm, 2);
    expect(stats.history[0]?.passageId).toBe(passageAId);
    expect(stats.history[0]?.authorName).toBe('ZZ Integration Author');
    // TEXT_A has punctuation and letters, so a tax is sampled.
    expect(stats.punctuationTaxAvgPct).not.toBeNull();
  });

  it('aggregates per author across multiple results', async () => {
    await submit(passageBId, TEXT_B);
    const res = await app.inject({ method: 'GET', url: `/api/v1/profiles/${profileId}/stats` });
    const stats = res.json<ProfileStats>();
    expect(stats.totals.tests).toBe(2);
    const author = stats.perAuthor.find((a) => a.authorSlug === AUTHOR_SLUG);
    expect(author).toBeDefined();
    expect(author?.tests).toBe(2);
    expect(author?.avgWpm).toBeGreaterThan(0);
    expect(stats.history).toHaveLength(2);
  });

  it('persists a word-mode run in history + aggregates, not per-author or leaderboard', async () => {
    const before = (
      await app.inject({ method: 'GET', url: `/api/v1/profiles/${profileId}/stats` })
    ).json<ProfileStats>();
    const wordText = 'the quick brown fox jumps over the lazy dog once more today please';
    const charEvents = typeRun(wordText, 6000);
    const clientStats = computeStats(wordText, charEvents);
    const submitRes = await app.inject({
      method: 'POST',
      url: '/api/v1/results',
      payload: { mode: 'words', profileId, text: wordText, clientStats, charEvents },
    });
    expect(submitRes.statusCode).toBe(201);
    expect(submitRes.json<PostResultsResponse>().clientMatch).toBe(true);

    const stats = (
      await app.inject({ method: 'GET', url: `/api/v1/profiles/${profileId}/stats` })
    ).json<ProfileStats>();
    expect(stats.totals.tests).toBe(before.totals.tests + 1);
    const wordRun = stats.history.find((h) => h.mode === 'words');
    expect(wordRun).toBeDefined();
    expect(wordRun?.passageId).toBeNull();
    expect(wordRun?.authorName).toBeNull();
    expect(wordRun?.wordCount).toBe(wordText.split(' ').length);
    // per-author is prose-only: the two prose runs, none from the word run.
    expect(stats.perAuthor.reduce((n, a) => n + a.tests, 0)).toBe(2);

    // The passage-oriented leaderboard excludes word runs (every entry has a
    // real passage id; a leaked word run would have none).
    const board = (
      await app.inject({ method: 'GET', url: '/api/v1/leaderboard' })
    ).json<{ entries: { passageId: number }[] }>();
    expect(board.entries.every((e) => typeof e.passageId === 'number')).toBe(true);
  });

  it('GET /authors and /themes include the seeded fixtures', async () => {
    const authors = (await app.inject({ method: 'GET', url: '/api/v1/authors' })).json<
      AuthorListItem[]
    >();
    const mine = authors.find((a) => a.slug === AUTHOR_SLUG);
    expect(mine?.passageCount).toBe(2);

    const themes = (await app.inject({ method: 'GET', url: '/api/v1/themes' })).json<
      ThemeListItem[]
    >();
    expect(themes.find((t) => t.theme === THEME)?.passageCount).toBe(2);
  });

  it('completing the daily passage starts a streak; a same-day resubmit does not extend it', async () => {
    const dailyRes = await app.inject({ method: 'GET', url: '/api/v1/passages/daily' });
    expect(dailyRes.statusCode).toBe(200);
    const daily = dailyRes.json<Passage>();
    // The real corpus's daily pick can be much longer than the other fixtures
    // in this file, so scale the duration to stay under the 350wpm ceiling
    // (plan §8) regardless of which passage today's pick is.
    const durationMs = Math.max(6000, daily.wordCount * 600);

    const first = await submit(daily.id, daily.text, durationMs);
    expect(first.dailyStreak).toEqual({ current: 1, best: 1, extended: true });

    const second = await submit(daily.id, daily.text, durationMs);
    expect(second.dailyStreak).toEqual({ current: 1, best: 1, extended: false });

    const stats = (
      await app.inject({ method: 'GET', url: `/api/v1/profiles/${profileId}/stats` })
    ).json<ProfileStats>();
    expect(stats.dailyStreak).toEqual({ current: 1, best: 1, completedToday: true });
  });

  it('a claim merges the requester\'s daily streak into the canonical profile (Batch C §2.1)', async () => {
    const email = 'zz-streak-merge@example.com';
    // Defensive: a previous failed run of this test can leave a profile owning
    // this email behind (cleanup below never ran), which would silently become
    // the "existing" owner instead of the ownerId created just below.
    await sql`delete from results where profile_id in (select id from profiles where email = ${email})`;
    await sql`delete from claim_tokens where profile_id in (select id from profiles where email = ${email})`;
    await sql`delete from profiles where email = ${email}`;

    const ownerId = (await app.inject({ method: 'POST', url: '/api/v1/profiles' })).json<PostProfilesResponse>()
      .id;
    const requesterId = (
      await app.inject({ method: 'POST', url: '/api/v1/profiles' })
    ).json<PostProfilesResponse>().id;

    async function tokenFor(id: string): Promise<string> {
      const [row] = await sql<{ token: string }[]>`
        select token from claim_tokens where profile_id = ${id} order by created_at desc limit 1`;
      if (row === undefined) throw new Error(`no claim token issued for profile ${id}`);
      return row.token;
    }

    try {
      // Owner claims the email first, becoming its canonical profile.
      const ownerClaim = await app.inject({
        method: 'POST',
        url: `/api/v1/profiles/${ownerId}/claim`,
        payload: { email },
      });
      expect(ownerClaim.statusCode).toBe(202);
      const ownerVerify = await app.inject({
        method: 'POST',
        url: '/api/v1/claim/verify',
        payload: { token: await tokenFor(ownerId) },
      });
      expect(ownerVerify.statusCode).toBe(200);
      expect(ownerVerify.json<{ profileId: string }>().profileId).toBe(ownerId);

      // Seed each profile's streak columns directly - there is no API path to
      // an arbitrary streak state. The requester's chain (starting 07-06)
      // picks up exactly where the owner's (ending 07-05) left off, so the
      // merge should join them rather than just taking the later one.
      await sql`update profiles set daily_streak = 2, daily_best_streak = 2, last_daily_date = '2026-07-05' where id = ${ownerId}`;
      await sql`update profiles set daily_streak = 3, daily_best_streak = 4, last_daily_date = '2026-07-08' where id = ${requesterId}`;

      // Requester claims the same email → merge branch (§10.3).
      const requesterClaim = await app.inject({
        method: 'POST',
        url: `/api/v1/profiles/${requesterId}/claim`,
        payload: { email },
      });
      expect(requesterClaim.statusCode).toBe(202);
      const verifyRes = await app.inject({
        method: 'POST',
        url: '/api/v1/claim/verify',
        payload: { token: await tokenFor(requesterId) },
      });
      expect(verifyRes.statusCode).toBe(200);
      expect(verifyRes.json<{ profileId: string }>().profileId).toBe(ownerId);

      const [canonical] = await sql<
        { daily_streak: number; daily_best_streak: number; last_daily_date: string }[]
      >`select daily_streak, daily_best_streak, last_daily_date::text as last_daily_date
        from profiles where id = ${ownerId}`;
      // Contiguous join: 2 (owner, ending 07-05) + 3 (requester, 07-06..07-08) = 5.
      expect(canonical).toMatchObject({
        daily_streak: 5,
        daily_best_streak: 5,
        last_daily_date: '2026-07-08',
      });
    } finally {
      // requesterId's row is deleted by the merge itself; only the owner (now
      // holding both) is left to clean up. Always runs, even on assertion
      // failure, so a broken run doesn't poison later runs via a stale email.
      await sql`delete from results where profile_id = ${ownerId}`;
      await sql`delete from claim_tokens where profile_id = ${ownerId}`;
      await sql`delete from profiles where id = ${ownerId}`;
    }
  });
});
