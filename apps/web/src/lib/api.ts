import {
  authorListSchema,
  claimRequestResponseSchema,
  claimVerifyResponseSchema,
  getProfileResponseSchema,
  leaderboardSchema,
  passageSchema,
  passageSummaryListSchema,
  postProfilesResponseSchema,
  postResultsResponseSchema,
  profileStatsSchema,
  themeListSchema,
  type AuthorListItem,
  type CharEvents,
  type ClaimRequestResponse,
  type ClaimVerifyResponse,
  type GetProfileResponse,
  type Leaderboard,
  type Passage,
  type PassageSummaryItem,
  type PostResultsResponse,
  type ProfileStats,
  type RunStats,
  type ThemeListItem,
} from '@typeprose/schema';

/** Minimal structural view of a zod schema - avoids a direct zod dep in web. */
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

/** GET /passages/daily - the deterministic passage of the day (§10.3). */
export async function fetchDailyPassage(): Promise<Passage> {
  const response = await fetch(`${BASE}/passages/daily`);
  return parseJson(response, passageSchema, 'GET /passages/daily');
}

/** GET /passages/:id - load one specific passage, e.g. a library pick or a `?passage=` link. */
export async function fetchPassageById(id: number): Promise<Passage> {
  const response = await fetch(`${BASE}/passages/${String(id)}`);
  return parseJson(response, passageSchema, 'GET /passages/:id');
}

/** POST /profiles - create an anonymous profile, returns its uuid (§8, §9.2). */
export async function postProfile(): Promise<string> {
  const response = await fetch(`${BASE}/profiles`, { method: 'POST' });
  const parsed = await parseJson(response, postProfilesResponseSchema, 'POST /profiles');
  return parsed.id;
}

/** POST /results (prose) - submit a finished passage run for recompute (§8). */
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
    body: JSON.stringify({ mode: 'prose', ...input }),
  });
  return parseJson(response, postResultsResponseSchema, 'POST /results');
}

/**
 * POST /results (words) - submit a finished word-mode run. The generated text
 * is sent so the server can recompute against it (there is no stored passage).
 */
export interface SubmitWordResultInput {
  profileId: string;
  text: string;
  clientStats: RunStats;
  charEvents: CharEvents;
}

export async function submitWordResult(input: SubmitWordResultInput): Promise<PostResultsResponse> {
  const response = await fetch(`${BASE}/results`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'words', ...input }),
  });
  return parseJson(response, postResultsResponseSchema, 'POST /results');
}

/** GET /profiles/:id/stats - aggregates + history for the stats page (§8). */
export async function fetchProfileStats(profileId: string): Promise<ProfileStats> {
  const response = await fetch(`${BASE}/profiles/${profileId}/stats`);
  return parseJson(response, profileStatsSchema, 'GET /profiles/:id/stats');
}

/** GET /authors - for the library page (§8). */
export async function fetchAuthors(): Promise<AuthorListItem[]> {
  const response = await fetch(`${BASE}/authors`);
  return parseJson(response, authorListSchema, 'GET /authors');
}

/** GET /themes - for the library page (§8). */
export async function fetchThemes(): Promise<ThemeListItem[]> {
  const response = await fetch(`${BASE}/themes`);
  return parseJson(response, themeListSchema, 'GET /themes');
}

/** GET /passages - individual passages under an author/theme/band for the library page (batch B). */
export async function fetchPassages(query: PassageQuery = {}): Promise<PassageSummaryItem[]> {
  const params = new URLSearchParams();
  if (query.band !== undefined) params.set('band', query.band);
  if (query.theme !== undefined) params.set('theme', query.theme);
  if (query.author !== undefined) params.set('author', query.author);
  const qs = params.toString();
  const response = await fetch(`${BASE}/passages${qs === '' ? '' : `?${qs}`}`);
  return parseJson(response, passageSummaryListSchema, 'GET /passages');
}

/** POST /profiles/:id/claim - request an email magic link to claim the profile (§10.3). */
export async function requestClaim(
  profileId: string,
  email: string,
): Promise<ClaimRequestResponse> {
  const response = await fetch(`${BASE}/profiles/${profileId}/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return parseJson(response, claimRequestResponseSchema, 'POST /profiles/:id/claim');
}

/** POST /claim/verify - verify a magic-link token; returns the canonical profile (§10.3). */
export async function verifyClaim(token: string): Promise<ClaimVerifyResponse> {
  const response = await fetch(`${BASE}/claim/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return parseJson(response, claimVerifyResponseSchema, 'POST /claim/verify');
}

/**
 * GET /leaderboard - each profile's best run, optionally scoped to a passage
 * (§10.3). `self` is this client's own profile id, so the server can mark its
 * row `isSelf` without ever handing raw profile ids back on the wire (§3.1).
 */
export async function fetchLeaderboard(passageId?: number, self?: string): Promise<Leaderboard> {
  const params = new URLSearchParams();
  if (passageId !== undefined) params.set('passageId', String(passageId));
  if (self !== undefined) params.set('self', self);
  const qs = params.toString();
  const response = await fetch(`${BASE}/leaderboard${qs === '' ? '' : `?${qs}`}`);
  return parseJson(response, leaderboardSchema, 'GET /leaderboard');
}

/** GET /profiles/:id - this client's own profile info, for the /account page (§3.1). */
export async function fetchProfile(profileId: string): Promise<GetProfileResponse> {
  const response = await fetch(`${BASE}/profiles/${profileId}`);
  return parseJson(response, getProfileResponseSchema, 'GET /profiles/:id');
}

/** PATCH /profiles/:id - rename the display name shown on the leaderboard (§3.1). */
export async function renameProfile(
  profileId: string,
  displayName: string,
): Promise<GetProfileResponse> {
  const response = await fetch(`${BASE}/profiles/${profileId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName }),
  });
  return parseJson(response, getProfileResponseSchema, 'PATCH /profiles/:id');
}

/** DELETE /profiles/:id - permanently delete a profile and its results (§3.1). 204, no body. */
export async function deleteProfile(profileId: string): Promise<void> {
  const response = await fetch(`${BASE}/profiles/${profileId}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`DELETE /profiles/:id failed with status ${String(response.status)}`);
  }
}

/** GET /profiles/:id/favorites - this profile's favorited passages, newest first (§3.3). */
export async function fetchFavorites(profileId: string): Promise<PassageSummaryItem[]> {
  const response = await fetch(`${BASE}/profiles/${profileId}/favorites`);
  return parseJson(response, passageSummaryListSchema, 'GET /profiles/:id/favorites');
}

/** PUT /profiles/:id/favorites/:passageId - star a passage (§3.3). 204, idempotent. */
export async function addFavorite(profileId: string, passageId: number): Promise<void> {
  const response = await fetch(`${BASE}/profiles/${profileId}/favorites/${String(passageId)}`, {
    method: 'PUT',
  });
  if (!response.ok) {
    throw new Error(`PUT favorites failed with status ${String(response.status)}`);
  }
}

/** DELETE /profiles/:id/favorites/:passageId - unstar a passage (§3.3). 204, idempotent. */
export async function removeFavorite(profileId: string, passageId: number): Promise<void> {
  const response = await fetch(`${BASE}/profiles/${profileId}/favorites/${String(passageId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(`DELETE favorites failed with status ${String(response.status)}`);
  }
}
