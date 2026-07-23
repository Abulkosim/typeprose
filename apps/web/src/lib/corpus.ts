import type {
  AuthorListItem,
  Passage,
  PassageSummaryItem,
  ThemeListItem,
} from '@typeprose/schema';

import type { PassageQuery } from './api';

/**
 * Pure selection and derivation over the locally synced corpus (offline
 * fallbacks in lib/passages.ts and the library page). Each function mirrors
 * the semantics of the API query it stands in for, so falling back offline
 * changes availability, not behavior.
 */

/** Band/theme/author filter, mirroring the server's WHERE conditions. */
export function matchesFilter(passage: Passage, query: PassageQuery): boolean {
  if (query.band !== undefined && passage.band !== query.band) return false;
  if (query.theme !== undefined && !passage.themes.includes(query.theme)) return false;
  if (query.author !== undefined && passage.author.slug !== query.author) return false;
  return true;
}

/**
 * Uniform random pick matching the filter, mirroring GET /passages/next -
 * with one deliberate divergence: when the exclude list rules out every
 * match, the excludes are relaxed instead of failing. Online, a 404 there
 * surfaces as "tab to retry"; offline, a repeated passage beats a dead end.
 */
export function selectRandom(
  passages: readonly Passage[],
  query: PassageQuery,
  excludeIds: readonly number[],
  random: () => number = Math.random,
): Passage | null {
  const matching = passages.filter((p) => matchesFilter(p, query));
  if (matching.length === 0) return null;
  const fresh = matching.filter((p) => !excludeIds.includes(p.id));
  const pool = fresh.length > 0 ? fresh : matching;
  return pool[Math.floor(random() * pool.length)] ?? null;
}

/**
 * First ~60 chars trimmed to the last full word, plus an ellipsis if cut.
 * Replicates `openingOf` in the API's drizzle repository (pinned by tests) so
 * offline library rows read identically to served ones.
 */
const OPENING_LEN = 60;
export function openingOf(text: string): string {
  if (text.length <= OPENING_LEN) return text;
  const cut = text.slice(0, OPENING_LEN);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function toSummary(p: Passage): PassageSummaryItem {
  return {
    id: p.id,
    band: p.band,
    opening: openingOf(p.text),
    work: { title: p.work.title },
    author: { slug: p.author.slug, name: p.author.name },
  };
}

/** GET /passages equivalent: filtered summaries ordered by author, work, id. */
export function toSummaries(
  passages: readonly Passage[],
  query: PassageQuery,
): PassageSummaryItem[] {
  return passages
    .filter((p) => matchesFilter(p, query))
    .sort(
      (a, b) =>
        a.author.name.localeCompare(b.author.name) ||
        a.work.title.localeCompare(b.work.title) ||
        a.id - b.id,
    )
    .map(toSummary);
}

/**
 * GET /profiles/:id/favorites equivalent: summaries in the given id order
 * (favorite order), ids with no matching passage dropped.
 */
export function summariesByIds(
  passages: readonly Passage[],
  ids: readonly number[],
): PassageSummaryItem[] {
  const byId = new Map(passages.map((p) => [p.id, p]));
  return ids
    .map((id) => byId.get(id))
    .filter((p): p is Passage => p !== undefined)
    .map(toSummary);
}

/** GET /authors equivalent: authors with passage counts, ordered by name. */
export function deriveAuthors(passages: readonly Passage[]): AuthorListItem[] {
  const bySlug = new Map<string, AuthorListItem>();
  for (const p of passages) {
    const existing = bySlug.get(p.author.slug);
    if (existing === undefined) {
      bySlug.set(p.author.slug, {
        slug: p.author.slug,
        name: p.author.name,
        era: p.author.era,
        passageCount: 1,
      });
    } else {
      existing.passageCount += 1;
    }
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** GET /themes equivalent: distinct themes with passage counts, ordered by theme. */
export function deriveThemes(passages: readonly Passage[]): ThemeListItem[] {
  const counts = new Map<string, number>();
  for (const p of passages) {
    for (const theme of p.themes) counts.set(theme, (counts.get(theme) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([theme, passageCount]) => ({ theme, passageCount }))
    .sort((a, b) => a.theme.localeCompare(b.theme));
}
