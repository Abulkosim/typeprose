import type { Band, ResultMode } from '@typeprose/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { authors, passages, profiles, results, works } from '../db/schema.ts';
import type {
  LeaderboardRow,
  NewResult,
  ProfileAggregates,
  ResultRepository,
  StoredResultRow,
} from './repository.ts';

/** postgres.js returns numeric aggregates as strings; coerce, preserving null. */
function toNumberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/** Drizzle-backed ResultRepository. */
export function createDrizzleResultRepository(db: Db): ResultRepository {
  return {
    async insert(row: NewResult): Promise<number> {
      const [inserted] = await db
        .insert(results)
        .values({
          profileId: row.profileId,
          mode: row.mode,
          passageId: row.passageId,
          wordText: row.wordText,
          wpm: row.wpm,
          rawWpm: row.rawWpm,
          accuracy: row.accuracy,
          consistency: row.consistency,
          durationMs: row.durationMs,
          charEvents: row.charEvents,
          clientMatch: row.clientMatch,
        })
        .returning({ id: results.id });
      if (inserted === undefined) {
        throw new Error('result insert returned no row');
      }
      return inserted.id;
    },

    async recentForProfile(profileId: string, limit: number): Promise<StoredResultRow[]> {
      // LEFT joins so word-mode runs (no passage) still appear in history; their
      // attribution columns come back null and the text lives in word_text.
      const rows = await db
        .select({
          id: results.id,
          mode: results.mode,
          passageId: results.passageId,
          wpm: results.wpm,
          rawWpm: results.rawWpm,
          accuracy: results.accuracy,
          consistency: results.consistency,
          durationMs: results.durationMs,
          clientMatch: results.clientMatch,
          createdAt: results.createdAt,
          band: passages.band,
          workTitle: works.title,
          authorName: authors.name,
          authorSlug: authors.slug,
          passageText: passages.text,
          wordText: results.wordText,
          charEvents: results.charEvents,
        })
        .from(results)
        .leftJoin(passages, eq(results.passageId, passages.id))
        .leftJoin(works, eq(passages.workId, works.id))
        .leftJoin(authors, eq(works.authorId, authors.id))
        .where(eq(results.profileId, profileId))
        .orderBy(desc(results.createdAt), desc(results.id))
        .limit(limit);
      return rows.map((r) => ({ ...r, mode: r.mode as ResultMode, band: r.band as Band | null }));
    },

    async topResults(opts: {
      passageId?: number | undefined;
      limit: number;
    }): Promise<LeaderboardRow[]> {
      // distinct on (profile_id) ordered by wpm gives each profile's best run;
      // the outer query re-sorts those bests into the ranking and caps it.
      const scope = opts.passageId !== undefined ? sql`where r.passage_id = ${opts.passageId}` : sql``;
      const rows = (await db.execute(sql`
        select best.wpm, best.accuracy, best.consistency,
               best.display_name as "displayName", best.profile_id as "profileId",
               best.passage_id as "passageId",
               best.band, best.work_title as "workTitle", best.author_name as "authorName",
               best.created_at as "createdAt"
        from (
          select distinct on (r.profile_id)
            r.profile_id, r.wpm, r.accuracy, r.consistency, r.id, r.created_at,
            p.display_name, r.passage_id, pa.band,
            w.title as work_title, a.name as author_name
          from ${results} r
          join ${passages} pa on pa.id = r.passage_id
          join ${works} w on w.id = pa.work_id
          join ${authors} a on a.id = w.author_id
          join ${profiles} p on p.id = r.profile_id
          ${scope}
          order by r.profile_id, r.wpm desc, r.id desc
        ) best
        order by best.wpm desc, best.created_at asc
        limit ${opts.limit}
      `)) as unknown as Array<{
        wpm: string;
        accuracy: string;
        consistency: string;
        displayName: string | null;
        profileId: string;
        passageId: number;
        band: string;
        workTitle: string;
        authorName: string;
        createdAt: string | Date;
      }>;
      return rows.map((r) => ({
        wpm: Number(r.wpm),
        accuracy: Number(r.accuracy),
        consistency: Number(r.consistency),
        displayName: r.displayName,
        profileId: r.profileId,
        passageId: r.passageId,
        band: r.band as Band,
        workTitle: r.workTitle,
        authorName: r.authorName,
        // db.execute returns timestamptz as a string (unlike the typed select
        // paths, which yield a Date) - normalize so the route can serialize it.
        createdAt: new Date(r.createdAt),
      }));
    },

    async bestWpmForProfile(profileId: string, passageId?: number): Promise<number | null> {
      const condition =
        passageId !== undefined
          ? and(eq(results.profileId, profileId), eq(results.passageId, passageId))
          : eq(results.profileId, profileId);
      const [row] = await db
        .select({ wpm: sql<string | null>`max(${results.wpm})` })
        .from(results)
        .where(condition);
      return toNumberOrNull(row?.wpm ?? null);
    },

    async aggregatesForProfile(profileId: string): Promise<ProfileAggregates> {
      const [totals] = await db
        .select({
          tests: sql<number>`count(*)::int`,
          timeTypedMs: sql<number>`coalesce(sum(${results.durationMs}), 0)::bigint`,
          avgAccuracy: sql<string | null>`avg(${results.accuracy})`,
          avgConsistency: sql<string | null>`avg(${results.consistency})`,
        })
        .from(results)
        .where(eq(results.profileId, profileId));

      // LEFT joins so a word-mode run can be the best (its attribution is null).
      const [best] = await db
        .select({
          wpm: results.wpm,
          mode: results.mode,
          passageId: results.passageId,
          workTitle: works.title,
          authorName: authors.name,
          wordText: results.wordText,
        })
        .from(results)
        .leftJoin(passages, eq(results.passageId, passages.id))
        .leftJoin(works, eq(passages.workId, works.id))
        .leftJoin(authors, eq(works.authorId, authors.id))
        .where(eq(results.profileId, profileId))
        .orderBy(desc(results.wpm), desc(results.id))
        .limit(1);

      const perAuthorRows = await db
        .select({
          authorSlug: authors.slug,
          authorName: authors.name,
          tests: sql<number>`count(*)::int`,
          avgWpm: sql<string>`avg(${results.wpm})`,
        })
        .from(results)
        .innerJoin(passages, eq(results.passageId, passages.id))
        .innerJoin(works, eq(passages.workId, works.id))
        .innerJoin(authors, eq(works.authorId, authors.id))
        .where(eq(results.profileId, profileId))
        .groupBy(authors.slug, authors.name)
        .orderBy(desc(sql`avg(${results.wpm})`), authors.name);

      return {
        tests: totals?.tests ?? 0,
        // bigint comes back as a string from postgres.js; realistic dev totals
        // are well within Number's safe range.
        timeTypedMs: Number(totals?.timeTypedMs ?? 0),
        avgAccuracy: toNumberOrNull(totals?.avgAccuracy ?? null),
        avgConsistency: toNumberOrNull(totals?.avgConsistency ?? null),
        best: best === undefined ? null : { ...best, mode: best.mode as ResultMode },
        perAuthor: perAuthorRows.map((r) => ({
          authorSlug: r.authorSlug,
          authorName: r.authorName,
          tests: r.tests,
          avgWpm: Number(r.avgWpm),
        })),
      };
    },
  };
}
