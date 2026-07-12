import { z } from 'zod';

/** Difficulty bands (plan §6.4). */
export const bandSchema = z.enum(['warmup', 'standard', 'hard', 'brutal']);

export type Band = z.infer<typeof bandSchema>;

/** Attribution: the author a passage belongs to (subset of the authors row). */
export const passageAuthorSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  era: z.string().nullable(),
});

/** Attribution: the work a passage is excerpted from (subset of the works row). */
export const passageWorkSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  translator: z.string().nullable(),
  pubYear: z.int().nullable(),
});

/**
 * Passage DTO returned by GET /passages/next and GET /passages/:id (plan §8).
 * Carries full attribution so the client can render the epigraph
 * ("- Fyodor Dostoevsky, Crime and Punishment, trans. Garnett").
 */
export const passageSchema = z.object({
  id: z.int().positive(),
  text: z.string().min(1),
  charCount: z.int().positive(),
  wordCount: z.int().positive(),
  difficulty: z.number().min(0).max(100),
  band: bandSchema,
  themes: z.array(z.string()),
  language: z.string().min(1),
  work: passageWorkSchema,
  author: passageAuthorSchema,
});

export type Passage = z.infer<typeof passageSchema>;

/** One row of GET /authors (plan §8). */
export const authorListItemSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  era: z.string().nullable(),
  passageCount: z.int().nonnegative(),
});

export type AuthorListItem = z.infer<typeof authorListItemSchema>;

/** GET /authors response body. */
export const authorListSchema = z.array(authorListItemSchema);

/** One row of GET /themes (plan §8). */
export const themeListItemSchema = z.object({
  theme: z.string().min(1),
  passageCount: z.int().nonnegative(),
});

export type ThemeListItem = z.infer<typeof themeListItemSchema>;

/** GET /themes response body. */
export const themeListSchema = z.array(themeListItemSchema);
