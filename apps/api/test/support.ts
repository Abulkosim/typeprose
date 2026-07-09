import { createEngine } from '@prosetype/engine';
import type { CharEvents, Passage } from '@prosetype/schema';
import type { PassageFilter, PassageRepository } from '../src/passages/repository.ts';
import type { ProfileRepository } from '../src/profiles/repository.ts';
import type {
  NewResult,
  ProfileAggregates,
  ResultRepository,
  StoredResultRow,
} from '../src/results/repository.ts';

export const testEnv = {
  DATABASE_URL: 'postgres://prosetype:prosetype@localhost:5432/prosetype',
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

/** A single 90-char word — typed correctly over 3s it exceeds the 350 wpm ceiling. */
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
    async listAuthors() {
      return [];
    },
    async listThemes() {
      return [];
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

export function createStubProfileRepo(existingIds: string[]): ProfileRepository & {
  created: number;
} {
  return {
    created: 0,
    async create(): Promise<string> {
      this.created += 1;
      const id = `00000000-0000-4000-8000-00000000000${String(this.created)}`;
      existingIds.push(id);
      return id;
    },
    async exists(id: string): Promise<boolean> {
      return existingIds.includes(id);
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
  };
}
