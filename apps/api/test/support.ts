import { createEngine } from '@typeprose/engine';
import type { CharEvents, Passage } from '@typeprose/schema';
import { displayNameFromEmail } from '../src/profiles/claim.ts';
import type { PassageFilter, PassageRepository } from '../src/passages/repository.ts';
import type {
  ClaimTokenInput,
  ProfileInfo,
  ProfileRepository,
} from '../src/profiles/repository.ts';
import { advanceDailyStreak, type DailyStreakState } from '../src/profiles/streak.ts';
import type {
  NewResult,
  ProfileAggregates,
  ResultRepository,
  StoredResultRow,
} from '../src/results/repository.ts';

export const testEnv = {
  DATABASE_URL: 'postgres://typeprose:typeprose@localhost:5432/typeprose',
  CORS_ORIGIN: 'http://localhost:5173',
  NODE_ENV: 'test',
};

export const shortPassage: Passage = {
  id: 1,
  text: 'it was a dark night',
  charCount: 19,
  wordCount: 5,
  difficulty: 12.0,
  band: 'warmup',
  themes: ['gothic'],
  language: 'en',
  work: { slug: 'a-work', title: 'A Work', translator: null, pubYear: 1920 },
  author: { slug: 'anon', name: 'Anon', era: 'modernist' },
};

/** A single 90-char word - typed correctly over 3s it exceeds the 350 wpm ceiling. */
export const fastPassage: Passage = {
  id: 2,
  text: 'a'.repeat(90),
  charCount: 90,
  wordCount: 1,
  difficulty: 5.0,
  band: 'warmup',
  themes: ['aphorisms'],
  language: 'en',
  work: { slug: 'b-work', title: 'B Work', translator: null, pubYear: 1900 },
  author: { slug: 'aphorist', name: 'Aphorist', era: 'philosophy' },
};

/**
 * Produce a valid charEvents log by driving the real engine through `text`
 * perfectly, distributing timestamps so the final keystroke lands at
 * `durationMs`. The run therefore has duration exactly `durationMs`.
 */
export function typeRun(text: string, durationMs = 5000): CharEvents {
  const engine = createEngine(text);
  const chars = [...text];
  const n = chars.length;
  for (let i = 0; i < n; i += 1) {
    const t = n <= 1 ? durationMs : Math.round((i / (n - 1)) * durationMs);
    const c = chars[i] as string;
    if (c === ' ') {
      engine.commitSpace(t);
    } else {
      engine.addChar(c, t);
    }
  }
  return engine.getLog();
}

export function createStubPassageRepo(fixtures: Passage[]): PassageRepository {
  return {
    async findRandom(filter: PassageFilter): Promise<Passage | null> {
      return (
        fixtures.find(
          (p) =>
            (filter.band === undefined || p.band === filter.band) &&
            !filter.excludeIds.includes(p.id),
        ) ?? null
      );
    },
    async findDaily(dateKey: string): Promise<Passage | null> {
      return dailyPick(fixtures, dateKey);
    },
    async findById(id: number): Promise<Passage | null> {
      return fixtures.find((p) => p.id === id) ?? null;
    },
    async listAll(): Promise<Passage[]> {
      return [...fixtures];
    },
    async listAuthors() {
      return [];
    },
    async listThemes() {
      return [];
    },
    async list() {
      return [];
    },
    async summariesByIds(ids: number[]) {
      return ids
        .map((id) => fixtures.find((p) => p.id === id))
        .filter((p): p is Passage => p !== undefined)
        .map((p) => ({
          id: p.id,
          band: p.band,
          opening: p.text.slice(0, 60),
          work: { title: p.work.title },
          author: { slug: p.author.slug, name: p.author.name },
        }));
    },
  };
}

/** Deterministic daily pick for stubs: ids sorted, indexed by the date key. */
export function dailyPick(fixtures: Passage[], dateKey: string): Passage | null {
  if (fixtures.length === 0) return null;
  const sorted = [...fixtures].sort((a, b) => a.id - b.id);
  const seed = [...dateKey].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return sorted[seed % sorted.length] ?? null;
}

/** An unstarted daily streak - the stub's default for any profile not yet seeded. */
const EMPTY_STREAK: DailyStreakState = { current: 0, best: 0, lastDate: null };

/**
 * Optional handle to a stub ResultRepository (as returned by
 * createStubResultRepo below) so createStubProfileRepo's deleteProfile can
 * cascade in-memory, the way the Drizzle repository cascades within one
 * transaction across the profiles/claim_tokens/results tables.
 */
export interface StubResultsHandle {
  inserted: NewResult[];
}

export function createStubProfileRepo(
  existingIds: string[],
  resultsHandle?: StubResultsHandle,
): ProfileRepository & {
  created: number;
  claimTokens: ClaimTokenInput[];
} {
  const tokens = new Map<string, ClaimTokenInput & { used: boolean }>();
  // In-memory daily-streak store (Batch C §2.1), keyed by profile id; the
  // methods below reuse the real pure functions from src/profiles/streak.ts
  // so the stub stays behaviourally identical to the Drizzle repository.
  const streaks = new Map<string, DailyStreakState>();
  // In-memory account fields (Batch D §3.1), keyed by profile id.
  const fields = new Map<
    string,
    { displayName: string | null; email: string | null; emailVerifiedAt: Date | null }
  >();
  const emptyFields = { displayName: null, email: null, emailVerifiedAt: null };
  // In-memory favorites (§3.3), newest first, keyed by profile id.
  const favs = new Map<string, number[]>();
  return {
    created: 0,
    claimTokens: [],
    async create(): Promise<string> {
      this.created += 1;
      const id = `00000000-0000-4000-8000-00000000000${String(this.created)}`;
      existingIds.push(id);
      return id;
    },
    async exists(id: string): Promise<boolean> {
      return existingIds.includes(id);
    },
    async createClaimToken(input: ClaimTokenInput): Promise<void> {
      tokens.set(input.token, { ...input, used: false });
      this.claimTokens.push(input);
    },
    async verifyClaim(token: string, now: Date) {
      // In-memory: no merge (the merge path is covered by the integration test).
      const t = tokens.get(token);
      if (t === undefined || t.used || t.expiresAt.getTime() <= now.getTime()) {
        return { status: 'invalid' as const };
      }
      t.used = true;
      const displayName = displayNameFromEmail(t.email);
      fields.set(t.profileId, { displayName, email: t.email, emailVerifiedAt: now });
      return { status: 'ok' as const, profileId: t.profileId, displayName };
    },
    async get(id: string): Promise<ProfileInfo | null> {
      if (!existingIds.includes(id)) return null;
      return { id, ...(fields.get(id) ?? emptyFields) };
    },
    async setDisplayName(id: string, displayName: string): Promise<boolean> {
      if (!existingIds.includes(id)) return false;
      fields.set(id, { ...(fields.get(id) ?? emptyFields), displayName });
      return true;
    },
    async deleteProfile(id: string): Promise<boolean> {
      const idx = existingIds.indexOf(id);
      if (idx === -1) return false;
      existingIds.splice(idx, 1);
      fields.delete(id);
      streaks.delete(id);
      favs.delete(id);
      for (const [token, t] of tokens) {
        if (t.profileId === id) tokens.delete(token);
      }
      if (resultsHandle !== undefined) {
        const remaining = resultsHandle.inserted.filter((r) => r.profileId !== id);
        resultsHandle.inserted.length = 0;
        resultsHandle.inserted.push(...remaining);
      }
      return true;
    },
    async listFavoriteIds(profileId: string): Promise<number[]> {
      return favs.get(profileId) ?? [];
    },
    async addFavorite(profileId: string, passageId: number): Promise<void> {
      const current = favs.get(profileId) ?? [];
      if (!current.includes(passageId)) favs.set(profileId, [passageId, ...current]);
    },
    async removeFavorite(profileId: string, passageId: number): Promise<void> {
      const current = favs.get(profileId) ?? [];
      favs.set(
        profileId,
        current.filter((id) => id !== passageId),
      );
    },
    async getDailyStreak(profileId: string): Promise<DailyStreakState> {
      return streaks.get(profileId) ?? EMPTY_STREAK;
    },
    async recordDailyCompletion(profileId: string, todayKey: string) {
      const { state, extended } = advanceDailyStreak(
        streaks.get(profileId) ?? EMPTY_STREAK,
        todayKey,
      );
      if (extended) streaks.set(profileId, state);
      return { state, extended };
    },
  };
}

export function createStubResultRepo(): ResultRepository & { inserted: NewResult[] } {
  return {
    inserted: [],
    async insert(row: NewResult): Promise<number> {
      this.inserted.push(row);
      return this.inserted.length;
    },
    async aggregatesForProfile(): Promise<ProfileAggregates> {
      return {
        tests: 0,
        timeTypedMs: 0,
        avgAccuracy: null,
        avgConsistency: null,
        best: null,
        perAuthor: [],
      };
    },
    async recentForProfile(): Promise<StoredResultRow[]> {
      return [];
    },
    async topResults() {
      return [];
    },
    async bestWpmForProfile(profileId: string, passageId?: number): Promise<number | null> {
      const matches = this.inserted.filter(
        (r) => r.profileId === profileId && (passageId === undefined || r.passageId === passageId),
      );
      if (matches.length === 0) return null;
      return Math.max(...matches.map((r) => r.wpm));
    },
  };
}
