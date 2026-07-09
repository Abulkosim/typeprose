import { authorListSchema, themeListSchema } from '@prosetype/schema';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/build.ts';
import { loadConfig } from '../src/config.ts';
import type { PassageRepository } from '../src/passages/repository.ts';
import { createStubProfileRepo, createStubResultRepo, testEnv } from './support.ts';

function catalogRepo(): PassageRepository {
  return {
    async findRandom() {
      return null;
    },
    async findDaily() {
      return null;
    },
    async findById() {
      return null;
    },
    async listAuthors() {
      return [
        { slug: 'dostoevsky', name: 'Fyodor Dostoevsky', era: 'russian-golden-age', passageCount: 4 },
        { slug: 'hammett', name: 'Dashiell Hammett', era: 'hardboiled', passageCount: 2 },
      ];
    },
    async listThemes() {
      return [
        { theme: 'hardboiled', passageCount: 2 },
        { theme: 'russian-soul', passageCount: 4 },
      ];
    },
  };
}

async function build(passageRepo: PassageRepository) {
  return buildApp(loadConfig(testEnv), {
    passageRepo,
    profileRepo: createStubProfileRepo([]),
    resultRepo: createStubResultRepo(),
  });
}

describe('catalog routes', () => {
  let app: FastifyInstance | null = null;
  afterEach(async () => {
    if (app !== null) {
      await app.close();
      app = null;
    }
  });

  it('GET /authors returns the author list DTO', async () => {
    app = await build(catalogRepo());
    const res = await app.inject({ method: 'GET', url: '/api/v1/authors' });
    expect(res.statusCode).toBe(200);
    const body: unknown = res.json();
    expect(() => authorListSchema.parse(body)).not.toThrow();
    expect(authorListSchema.parse(body)).toHaveLength(2);
    expect(authorListSchema.parse(body)[0]?.slug).toBe('dostoevsky');
  });

  it('GET /themes returns the theme list DTO', async () => {
    app = await build(catalogRepo());
    const res = await app.inject({ method: 'GET', url: '/api/v1/themes' });
    expect(res.statusCode).toBe(200);
    const body: unknown = res.json();
    expect(() => themeListSchema.parse(body)).not.toThrow();
    expect(themeListSchema.parse(body).map((t) => t.theme)).toEqual(['hardboiled', 'russian-soul']);
  });
});
