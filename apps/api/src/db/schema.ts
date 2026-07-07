import type { CharEvents } from '@prosetype/schema';
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/** Drizzle schema per plan §4. */

export const authors = pgTable('authors', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  birthYear: integer('birth_year'),
  deathYear: integer('death_year'),
  era: text('era'),
});

export const works = pgTable('works', {
  id: serial('id').primaryKey(),
  authorId: integer('author_id')
    .notNull()
    .references(() => authors.id),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  translator: text('translator'),
  pubYear: integer('pub_year'),
  source: text('source').notNull(),
  language: text('language').notNull().default('en'),
});

export const passages = pgTable(
  'passages',
  {
    id: serial('id').primaryKey(),
    workId: integer('work_id')
      .notNull()
      .references(() => works.id),
    text: text('text').notNull(),
    textHash: text('text_hash').notNull().unique(),
    charCount: integer('char_count').notNull(),
    wordCount: integer('word_count').notNull(),
    difficulty: numeric('difficulty', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    band: text('band').notNull(),
    themes: text('themes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    language: text('language').notNull().default('en'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('passages_band_idx').on(table.band),
    index('passages_themes_idx').using('gin', table.themes),
  ],
);

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const results = pgTable(
  'results',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id),
    passageId: integer('passage_id')
      .notNull()
      .references(() => passages.id),
    // Server-computed values are stored (plan §8).
    wpm: numeric('wpm', { precision: 6, scale: 2, mode: 'number' }).notNull(),
    rawWpm: numeric('raw_wpm', { precision: 6, scale: 2, mode: 'number' }).notNull(),
    accuracy: numeric('accuracy', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    consistency: numeric('consistency', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    durationMs: integer('duration_ms').notNull(),
    charEvents: jsonb('char_events').notNull().$type<CharEvents>(),
    clientMatch: boolean('client_match').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('results_profile_id_created_at_idx').on(table.profileId, table.createdAt.desc()),
    index('results_passage_id_idx').on(table.passageId),
  ],
);
