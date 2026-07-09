import { passageSchema, type Passage } from '@prosetype/schema';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/build.ts';
import { loadConfig } from '../src/config.ts';
import type { PassageFilter, PassageRepository } from '../src/passages/repository.ts';

const testEnv = {
  DATABASE_URL: 'postgres://prosetype:prosetype@localhost:5432/prosetype',
  CORS_ORIGIN: 'http://localhost:5173',
  NODE_ENV: 'test',
};

const dostoevskyPassage: Passage = {
  id: 1,
  text: 'Pain and suffering are always inevitable for a large intelligence and a deep heart.',
  charCount: 84,
  wordCount: 14,
  difficulty: 32.5,
  band: 'standard',
  themes: ['russian-soul'],
  language: 'en',
  work: {
    slug: 'crime-and-punishment',
    title: 'Crime and Punishment',
    translator: 'Constance Garnett',
    pubYear: 1914,
  },
  author: {
    slug: 'dostoevsky',
    name: 'Fyodor Dostoevsky',
    era: 'russian-golden-age',
  },
};

const hammettPassage: Passage = {
  id: 2,
  text: 'Spade looked at her with a grin and said nothing.',
  charCount: 49,
  wordCount: 10,
  difficulty: 22.1,
  band: 'warmup',
  themes: ['hardboiled'],
  language: 'en',
  work: {
    slug: 'the-maltese-falcon',
    title: 'The Maltese Falcon',
    translator: null,
    pubYear: 1930,
  },
  author: {
    slug: 'hammett',
    name: 'Dashiell Hammett',
    era: 'hardboiled',
  },
};

/** In-memory PassageRepository stub that records the filters it was called with. */
function createStubRepo(fixtures: Passage[]): PassageRepository & {
  lastFilter: PassageFilter | null;
} {
  return {
    lastFilter: null,
    async findRandom(filter: PassageFilter): Promise<Passage | null> {
      this.lastFilter = filter;
      const match = fixtures.find(
        (p) =>
          (filter.band === undefined || p.band === filter.band) &&
          (filter.theme === undefined || p.themes.includes(filter.theme)) &&
          (filter.author === undefined || p.author.slug === filter.author) &&
          !filter.excludeIds.includes(p.id),
      );
      return match ?? null;
    },
    async findDaily(dateKey: string): Promise<Passage | null> {
      if (fixtures.length === 0) return null;
      const sorted = [...fixtures].sort((a, b) => a.id - b.id);
      const seed = [...dateKey].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      return sorted[seed % sorted.length] ?? null;
    },
    async findById(id: number): Promise<Passage | null> {
      return fixtures.find((p) => p.id === id) ?? null;
    },
    async listAuthors() {
      const bySlug = new Map<string, { slug: string; name: string; era: string | null; count: number }>();
      for (const p of fixtures) {
        const existing = bySlug.get(p.author.slug);
        if (existing === undefined) {
          bySlug.set(p.author.slug, {
            slug: p.author.slug,
            name: p.author.name,
            era: p.author.era,
            count: 1,
          });
        } else {
          existing.count += 1;
        }
      }
      return [...bySlug.values()]
        .map((a) => ({ slug: a.slug, name: a.name, era: a.era, passageCount: a.count }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    async listThemes() {
      const counts = new Map<string, number>();
      for (const p of fixtures) {
        for (const theme of p.themes) counts.set(theme, (counts.get(theme) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([theme, passageCount]) => ({ theme, passageCount }))
        .sort((a, b) => a.theme.localeCompare(b.theme));
    },
  };
}

describe('passage routes', () => {
  let app: FastifyInstance | null = null;

  async function setup(fixtures: Passage[] = [dostoevskyPassage, hammettPassage]) {
    const repo = createStubRepo(fixtures);
    app = await buildApp(loadConfig(testEnv), { passageRepo: repo });
    return { app, repo };
  }

  afterEach(async () => {
    if (app !== null) {
      await app.close();
      app = null;
    }
  });

  describe('GET /api/v1/passages/next', () => {
    it('returns a passage matching the shared Passage DTO', async () => {
      const { app } = await setup();
      const res = await app.inject({ method: 'GET', url: '/api/v1/passages/next' });
      expect(res.statusCode).toBe(200);
      const body: unknown = res.json();
      expect(() => passageSchema.parse(body)).not.toThrow();
      expect(passageSchema.parse(body)).toEqual(dostoevskyPassage);
    });

    it('passes band, theme, and author filters to the repository', async () => {
      const { app, repo } = await setup();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/passages/next?band=warmup&theme=hardboiled&author=hammett',
      });
      expect(res.statusCode).toBe(200);
      expect(repo.lastFilter).toEqual({
        band: 'warmup',
        theme: 'hardboiled',
        author: 'hammett',
        excludeIds: [],
      });
      expect(passageSchema.parse(res.json()).id).toBe(2);
    });

    it('parses exclude into a list of ids passed to the repository', async () => {
      const { app, repo } = await setup();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/passages/next?exclude=1,3,5',
      });
      expect(res.statusCode).toBe(200);
      expect(repo.lastFilter?.excludeIds).toEqual([1, 3, 5]);
      expect(passageSchema.parse(res.json()).id).toBe(2);
    });

    it('accepts exactly 20 exclude ids', async () => {
      const { app } = await setup();
      const ids = Array.from({ length: 20 }, (_, i) => i + 100).join(',');
      const res = await app.inject({ method: 'GET', url: `/api/v1/passages/next?exclude=${ids}` });
      expect(res.statusCode).toBe(200);
    });

    it('rejects more than 20 exclude ids with 400', async () => {
      const { app } = await setup();
      const ids = Array.from({ length: 21 }, (_, i) => i + 100).join(',');
      const res = await app.inject({ method: 'GET', url: `/api/v1/passages/next?exclude=${ids}` });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'BadRequest' });
    });

    it('rejects a malformed exclude list with 400', async () => {
      const { app } = await setup();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/passages/next?exclude=1,abc',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'BadRequest' });
    });

    it('rejects an unknown band with 400', async () => {
      const { app } = await setup();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/passages/next?band=impossible',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'BadRequest' });
    });

    it('returns 404 with a clear error body when nothing matches', async () => {
      const { app } = await setup();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/passages/next?band=brutal&author=hammett',
      });
      expect(res.statusCode).toBe(404);
      const body: unknown = res.json();
      expect(body).toMatchObject({ error: 'NotFound' });
      expect(body).toHaveProperty('message', expect.stringContaining('band=brutal'));
      expect(body).toHaveProperty('message', expect.stringContaining('author=hammett'));
    });

    it('returns 404 when the exclude list rules out every passage', async () => {
      const { app } = await setup();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/passages/next?exclude=1,2',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: 'NotFound' });
    });
  });

  describe('GET /api/v1/passages/:id', () => {
    it('returns the passage by id as the shared Passage DTO', async () => {
      const { app } = await setup();
      const res = await app.inject({ method: 'GET', url: '/api/v1/passages/2' });
      expect(res.statusCode).toBe(200);
      expect(passageSchema.parse(res.json())).toEqual(hammettPassage);
    });

    it('returns 404 with a clear error body for a missing id', async () => {
      const { app } = await setup();
      const res = await app.inject({ method: 'GET', url: '/api/v1/passages/999' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({
        error: 'NotFound',
        message: 'Passage 999 not found',
      });
    });

    it('rejects a non-numeric id with 400', async () => {
      const { app } = await setup();
      const res = await app.inject({ method: 'GET', url: '/api/v1/passages/abc' });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'BadRequest' });
    });

    it('rejects a non-positive id with 400', async () => {
      const { app } = await setup();
      const res = await app.inject({ method: 'GET', url: '/api/v1/passages/0' });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'BadRequest' });
    });
  });

  describe('GET /api/v1/passages/daily', () => {
    it('returns a passage as the shared Passage DTO (static route, not :id)', async () => {
      const { app } = await setup();
      const res = await app.inject({ method: 'GET', url: '/api/v1/passages/daily' });
      expect(res.statusCode).toBe(200);
      expect(() => passageSchema.parse(res.json())).not.toThrow();
    });

    it('returns 404 when the corpus is empty', async () => {
      const { app } = await setup([]);
      const res = await app.inject({ method: 'GET', url: '/api/v1/passages/daily' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toMatchObject({ error: 'NotFound' });
    });
  });
});
