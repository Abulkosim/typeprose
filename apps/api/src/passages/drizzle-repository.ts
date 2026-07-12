import {
  authorListItemSchema,
  passageSchema,
  themeListItemSchema,
  type AuthorListItem,
  type Passage,
  type ThemeListItem,
} from '@prosetype/schema';
import { and, arrayContains, asc, eq, notInArray, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { authors, passages, works } from '../db/schema.ts';
import type { PassageFilter, PassageRepository } from './repository.ts';

/** Selection shaped exactly like the shared Passage DTO (nested attribution). */
const passageSelection = {
  id: passages.id,
  text: passages.text,
  charCount: passages.charCount,
  wordCount: passages.wordCount,
  difficulty: passages.difficulty,
  band: passages.band,
  themes: passages.themes,
  language: passages.language,
  work: {
    slug: works.slug,
    title: works.title,
    translator: works.translator,
    pubYear: works.pubYear,
  },
  author: {
    slug: authors.slug,
    name: authors.name,
    era: authors.era,
  },
};

/**
 * Drizzle-backed PassageRepository. Rows are parsed through the shared
 * passageSchema so any DB/DTO drift fails loudly instead of leaking out.
 */
export function createDrizzlePassageRepository(db: Db): PassageRepository {
  const baseQuery = () =>
    db
      .select(passageSelection)
      .from(passages)
      .innerJoin(works, eq(passages.workId, works.id))
      .innerJoin(authors, eq(works.authorId, authors.id));

  return {
    async findRandom(filter: PassageFilter): Promise<Passage | null> {
      const conditions: SQL[] = [];
      if (filter.band !== undefined) {
        conditions.push(eq(passages.band, filter.band));
      }
      if (filter.theme !== undefined) {
        conditions.push(arrayContains(passages.themes, [filter.theme]));
      }
      if (filter.author !== undefined) {
        conditions.push(eq(authors.slug, filter.author));
      }
      if (filter.excludeIds.length > 0) {
        conditions.push(notInArray(passages.id, filter.excludeIds));
      }
      // ORDER BY random() scans every matching row; fine at the ~30-row seed
      // corpus scale (plan §8 sizing) - revisit if the corpus grows large.
      const rows = await baseQuery()
        .where(and(...conditions))
        .orderBy(sql`random()`)
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : passageSchema.parse(row);
    },

    async findDaily(dateKey: string): Promise<Passage | null> {
      // Deterministic per date: order every row by md5(dateKey || id) and take
      // the first - a stable pseudo-random pick with no count query.
      const rows = await baseQuery()
        .orderBy(sql`md5(${dateKey} || '-' || ${passages.id}::text)`)
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : passageSchema.parse(row);
    },

    async findById(id: number): Promise<Passage | null> {
      const rows = await baseQuery().where(eq(passages.id, id)).limit(1);
      const row = rows[0];
      return row === undefined ? null : passageSchema.parse(row);
    },

    async listAuthors(): Promise<AuthorListItem[]> {
      const rows = await db
        .select({
          slug: authors.slug,
          name: authors.name,
          era: authors.era,
          passageCount: sql<number>`count(${passages.id})::int`,
        })
        .from(authors)
        .innerJoin(works, eq(works.authorId, authors.id))
        .innerJoin(passages, eq(passages.workId, works.id))
        .groupBy(authors.slug, authors.name, authors.era)
        .orderBy(asc(authors.name));
      return rows.map((r) => authorListItemSchema.parse(r));
    },

    async listThemes(): Promise<ThemeListItem[]> {
      // themes is a text[] column; unnest to one row per (passage, theme).
      const rows = (await db.execute(
        sql`select theme, count(*)::int as count
            from ${passages}, unnest(${passages.themes}) as theme
            group by theme
            order by theme`,
      )) as unknown as Array<{ theme: string; count: number }>;
      return rows.map((r) => themeListItemSchema.parse({ theme: r.theme, passageCount: r.count }));
    },
  };
}
