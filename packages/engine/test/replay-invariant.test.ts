import { charEventsSchema } from '@prosetype/schema';
import { describe, expect, it } from 'vitest';
import { computeHeatmap, computePerSecondRawWpm, computeStats } from '../src/index.ts';
import { mulberry32, randomPassage, randomRun } from './helpers.ts';

const RUNS = 200;

describe(`replay invariant over ${RUNS} generated runs (seeded)`, () => {
  it('computeStats(text, log) reproduces the engine’s own final stats identically', () => {
    for (let seed = 1; seed <= RUNS; seed += 1) {
      const rng = mulberry32(seed * 0x9e3779b9);
      const text = randomPassage(rng);
      const engine = randomRun(text, rng);
      expect(engine.status).toBe('complete');

      const live = engine.getStats();
      const wire = engine.getLog();
      // The pure replay must accept every engine-produced log and agree exactly.
      const replayed = computeStats(text, wire);
      expect(replayed, `seed ${seed}, passage "${text}"`).toEqual(live);

      // Basic sanity on the stats themselves.
      expect(live.durationMs).toBeGreaterThanOrEqual(0);
      expect(live.wpm).toBeGreaterThanOrEqual(0);
      expect(live.rawWpm).toBeGreaterThanOrEqual(live.wpm);
      expect(live.accuracy).toBeGreaterThanOrEqual(0);
      expect(live.accuracy).toBeLessThanOrEqual(100);
      expect(live.consistency).toBeGreaterThanOrEqual(0);
      expect(live.consistency).toBeLessThanOrEqual(100);
    }
  });

  it('every engine-produced log is wire-valid per the shared schema', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const rng = mulberry32(seed * 0x85ebca6b);
      const text = randomPassage(rng);
      const engine = randomRun(text, rng);
      const parsed = charEventsSchema.safeParse(engine.getLog());
      expect(parsed.success, `seed ${seed}: ${parsed.error?.message ?? ''}`).toBe(true);
    }
  });

  it('per-second buckets re-derive rawWpm; heatmap replays without throwing', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const rng = mulberry32(seed * 0xc2b2ae35);
      const text = randomPassage(rng);
      const engine = randomRun(text, rng);
      const stats = engine.getStats();
      const wire = engine.getLog();

      const perSecond = computePerSecondRawWpm(text, wire);
      const rawChars = perSecond.reduce((a, b) => a + b, 0) / 12;
      const minutes = stats.durationMs / 60_000;
      if (minutes > 0) {
        expect(Math.round((rawChars / 5 / minutes) * 100) / 100).toBe(stats.rawWpm);
      }

      const heatmap = computeHeatmap(text, wire);
      expect(heatmap.perChar).toHaveLength(text.length);
      const sampled = heatmap.perChar.filter((c) => c.interKeyMs !== null);
      for (const c of sampled) {
        expect(c.heat).toBeGreaterThanOrEqual(0);
        expect(c.heat).toBeLessThanOrEqual(1);
      }
    }
  });
});
