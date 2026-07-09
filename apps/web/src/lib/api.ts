import {
  authorListSchema,
  passageSchema,
  postProfilesResponseSchema,
  postResultsResponseSchema,
  profileStatsSchema,
  themeListSchema,
  type AuthorListItem,
  type CharEvents,
  type Passage,
  type PostResultsResponse,
  type ProfileStats,
  type RunStats,
  type ThemeListItem,
} from '@prosetype/schema';

/** Minimal structural view of a zod schema — avoids a direct zod dep in web. */
interface Parser<T> {
  parse: (data: unknown) => T;
}

/**
 * Thin fetch wrappers for the API (plan §8). The Vite dev server proxies
 * /api → the Fastify app on :3001. Every response is re-parsed through the
 * shared zod schema so API drift fails loudly at the boundary.
 */
const BASE = '/api/v1';

/** Passage selection filters for GET /passages/next (plan §8). */
export interface PassageQuery {
  band?: string | undefined;
  theme?: string | undefined;
  author?: string | undefined;
}

async function parseJson<T>(response: Response, schema: Parser<T>, label: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${label} failed with status ${String(response.status)}`);
  }
  const body: unknown = await response.json();
  return schema.parse(body);
}

/** GET /passages/next, excluding recently seen ids and applying library filters. */
export async function fetchNextPassage(
  excludeIds: readonly number[],
  query: PassageQuery = {},
): Promise<Passage> {
  const params = new URLSearchParams();
  if (query.band !== undefined) params.set('band', query.band);
  if (query.theme !== undefined) params.set('theme', query.theme);
  if (query.author !== undefined) params.set('author', query.author);
  if (excludeIds.length > 0) params.set('exclude', excludeIds.join(','));
  const qs = params.toString();
  const response = await fetch(`${BASE}/passages/next${qs === '' ? '' : `?${qs}`}`);
  return parseJson(response, passageSchema, 'GET /passages/next');
}

/** GET /passages/daily — the deterministic passage of the day (§10.3). */
export async function fetchDailyPassage(): Promise<Passage> {
  const response = await fetch(`${BASE}/passages/daily`);
  return parseJson(response, passageSchema, 'GET /passages/daily');
}

/** POST /profiles — create an anonymous profile, returns its uuid (§8, §9.2). */
export async function postProfile(): Promise<string> {
  const response = await fetch(`${BASE}/profiles`, { method: 'POST' });
  const parsed = await parseJson(response, postProfilesResponseSchema, 'POST /profiles');
  return parsed.id;
}

/** POST /results — submit a finished run for server-side recompute (§8). */
export interface SubmitResultInput {
  profileId: string;
  passageId: number;
  clientStats: RunStats;
  charEvents: CharEvents;
}

export async function submitResult(input: SubmitResultInput): Promise<PostResultsResponse> {
  const response = await fetch(`${BASE}/results`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseJson(response, postResultsResponseSchema, 'POST /results');
}

/** GET /profiles/:id/stats — aggregates + history for the stats page (§8). */
export async function fetchProfileStats(profileId: string): Promise<ProfileStats> {
  const response = await fetch(`${BASE}/profiles/${profileId}/stats`);
  return parseJson(response, profileStatsSchema, 'GET /profiles/:id/stats');
}

/** GET /authors — for the library page (§8). */
export async function fetchAuthors(): Promise<AuthorListItem[]> {
  const response = await fetch(`${BASE}/authors`);
  return parseJson(response, authorListSchema, 'GET /authors');
}

/** GET /themes — for the library page (§8). */
export async function fetchThemes(): Promise<ThemeListItem[]> {
  const response = await fetch(`${BASE}/themes`);
  return parseJson(response, themeListSchema, 'GET /themes');
}
