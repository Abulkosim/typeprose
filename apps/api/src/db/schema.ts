import type { CharEvents } from '@prosetype/schema';
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
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
  // Account claim (Phase 3, §10.3): set once an email magic link is verified.
  // Unique so an email maps to exactly one canonical profile (nulls stay distinct).
  email: text('email').unique(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Pending email-claim magic links (Phase 3, §10.3). Short-lived, single-use. */
export const claimTokens = pgTable('claim_tokens', {
  token: text('token').primaryKey(),
  profileId: uuid('profile_id')
    .notNull()
    .references(() => profiles.id),
  email: text('email').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const results = pgTable(
  'results',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id),
    // Which kind of test this run was: a corpus passage ('prose') or a
    // generated random-word set ('words', the Monkeytype-style mode).
    mode: text('mode').notNull().default('prose'),
    // Null for a word-mode run (no stored passage); required for prose.
    passageId: integer('passage_id').references(() => passages.id),
    // The generated text for a word-mode run, so stats can recompute/replay
    // (server verify, heatmap, per-key/bigram); null for prose.
    wordText: text('word_text'),
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
    // A run is exactly one shape: prose keys on a passage with no word text;
    // words carries its text with no passage.
    check(
      'results_mode_shape',
      sql`(${table.mode} = 'prose' AND ${table.passageId} IS NOT NULL AND ${table.wordText} IS NULL)
        OR (${table.mode} = 'words' AND ${table.passageId} IS NULL AND ${table.wordText} IS NOT NULL)`,
    ),
  ],
);
