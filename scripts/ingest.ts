/**
 * Corpus ingestion pipeline per plan §5 + §6.
 *
 *   parse corpus/passages.yaml → normalize (§6.3) → counts + difficulty (§6.4)
 *   → sha256 hash + dedupe → upsert authors/works/passages → curation report.
 *
 * Offline/seed-time only. Run via `pnpm ingest` (optionally pass a YAML path:
 * `pnpm ingest corpus/passages.yaml`). Requires DATABASE_URL.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { createDbClient } from '../apps/api/src/db/client.ts';
import { authors, passages, works } from '../apps/api/src/db/schema.ts';
import { parseCorpus, type PassageEntry } from './lib/corpus.ts';
import { computeDifficulty, resolveBand, type Band } from './lib/difficulty.ts';
import { normalizeText, type FoldedWord } from '@typeprose/engine';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CORPUS_PATH = path.join(REPO_ROOT, 'corpus', 'passages.yaml');

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
});

interface PreparedPassage {
  entry: PassageEntry;
  /** 1-based position in the YAML file, for error/report labeling. */
  ordinal: number;
  text: string;
  textHash: string;
  charCount: number;
  wordCount: number;
  difficulty: number;
  band: Band;
  bandOverridden: boolean;
  foldedWords: FoldedWord[];
  foldedChars: string[];
}

function label(entry: PassageEntry, ordinal: number): string {
  return `#${ordinal} ${entry.author_name} - ${entry.title}`;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Normalize + score every entry; collect all failures instead of stopping at the first. */
function prepare(entries: PassageEntry[]): {
  prepared: PreparedPassage[];
  duplicates: { passage: PreparedPassage; firstSeen: PreparedPassage }[];
  errors: string[];
} {
  const prepared: PreparedPassage[] = [];
  const duplicates: { passage: PreparedPassage; firstSeen: PreparedPassage }[] = [];
  const errors: string[] = [];
  const byHash = new Map<string, PreparedPassage>();

  entries.forEach((entry, index) => {
    const ordinal = index + 1;
    try {
      const normalized = normalizeText(entry.text);
      const breakdown = computeDifficulty(normalized.text);
      const passage: PreparedPassage = {
        entry,
        ordinal,
        text: normalized.text,
        textHash: sha256(normalized.text),
        charCount: normalized.text.length,
        wordCount: normalized.text.split(' ').length,
        difficulty: breakdown.score,
        band: resolveBand(breakdown.score, entry.band_override),
        bandOverridden: entry.band_override !== undefined,
        foldedWords: normalized.foldedWords,
        foldedChars: normalized.foldedChars,
      };
      const firstSeen = byHash.get(passage.textHash);
      if (firstSeen !== undefined) {
        duplicates.push({ passage, firstSeen });
        return;
      }
      byHash.set(passage.textHash, passage);
      prepared.push(passage);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${label(entry, ordinal)}: ${message}`);
    }
  });

  return { prepared, duplicates, errors };
}

/** Upsert authors → works → passages in a single transaction. */
async function upsertAll(
  db: ReturnType<typeof createDbClient>['db'],
  prepared: PreparedPassage[],
): Promise<void> {
  await db.transaction(async (tx) => {
    // Authors, keyed by slug; first YAML occurrence wins for metadata.
    const authorIds = new Map<string, number>();
    for (const { entry } of prepared) {
      if (authorIds.has(entry.author)) continue;
      const values = {
        slug: entry.author,
        name: entry.author_name,
        birthYear: entry.birth_year ?? null,
        deathYear: entry.death_year ?? null,
        era: entry.era ?? null,
      };
      const [row] = await tx
        .insert(authors)
        .values(values)
        .onConflictDoUpdate({ target: authors.slug, set: values })
        .returning({ id: authors.id });
      if (row === undefined) throw new Error(`author upsert returned no row: ${entry.author}`);
      authorIds.set(entry.author, row.id);
    }

    // Works, keyed by slug; first YAML occurrence wins for metadata.
    const workIds = new Map<string, number>();
    for (const { entry } of prepared) {
      if (workIds.has(entry.work)) continue;
      const authorId = authorIds.get(entry.author);
      if (authorId === undefined) throw new Error(`missing author id for ${entry.author}`);
      const values = {
        authorId,
        slug: entry.work,
        title: entry.title,
        translator: entry.translator ?? null,
        pubYear: entry.pub_year ?? null,
        source: entry.source,
        language: entry.language,
      };
      const [row] = await tx
        .insert(works)
        .values(values)
        .onConflictDoUpdate({ target: works.slug, set: values })
        .returning({ id: works.id });
      if (row === undefined) throw new Error(`work upsert returned no row: ${entry.work}`);
      workIds.set(entry.work, row.id);
    }

    // Passages, deduped on text_hash; re-ingest refreshes computed fields.
    for (const passage of prepared) {
      const workId = workIds.get(passage.entry.work);
      if (workId === undefined) throw new Error(`missing work id for ${passage.entry.work}`);
      const values = {
        workId,
        text: passage.text,
        textHash: passage.textHash,
        charCount: passage.charCount,
        wordCount: passage.wordCount,
        difficulty: passage.difficulty,
        band: passage.band,
        themes: passage.entry.themes,
        language: passage.entry.language,
      };
      await tx
        .insert(passages)
        .values(values)
        .onConflictDoUpdate({ target: passages.textHash, set: values });
    }
  });
}

function printReport(
  prepared: PreparedPassage[],
  duplicates: { passage: PreparedPassage; firstSeen: PreparedPassage }[],
): void {
  console.log('');
  console.log('TYPEPROSE ingest - curation report');
  console.log('==================================');
  for (const p of prepared) {
    const bandNote = p.bandOverridden ? `${p.band} (override)` : p.band;
    console.log('');
    console.log(label(p.entry, p.ordinal));
    console.log(
      `  chars ${String(p.charCount)} · words ${String(p.wordCount)} · difficulty ${p.difficulty.toFixed(2)} · band ${bandNote}`,
    );
    if (p.foldedWords.length > 0) {
      const folds = p.foldedWords.map((f) => `"${f.original}" → "${f.folded}"`).join(', ');
      console.log(`  folded chars: ${p.foldedChars.join(' ')}`);
      console.log(`  folded words: ${folds}`);
    }
    const preview = p.text.length > 72 ? `${p.text.slice(0, 72)}...` : p.text;
    console.log(`  text: ${preview}`);
  }

  if (duplicates.length > 0) {
    console.log('');
    console.log('Duplicates skipped (same text_hash):');
    for (const d of duplicates) {
      console.log(
        `  ${label(d.passage.entry, d.passage.ordinal)} duplicates ${label(d.firstSeen.entry, d.firstSeen.ordinal)}`,
      );
    }
  }

  const bandCounts = new Map<Band, number>();
  for (const p of prepared) bandCounts.set(p.band, (bandCounts.get(p.band) ?? 0) + 1);
  const summary = (['warmup', 'standard', 'hard', 'brutal'] as const)
    .map((band) => `${band} ${String(bandCounts.get(band) ?? 0)}`)
    .join(' · ');
  console.log('');
  console.log(`Summary: ${String(prepared.length)} passages ingested · ${summary}`);
}

async function main(): Promise<void> {
  const corpusPath =
    process.argv[2] !== undefined ? path.resolve(process.argv[2]) : DEFAULT_CORPUS_PATH;

  let yamlSource: string;
  try {
    yamlSource = await readFile(corpusPath, 'utf8');
  } catch {
    console.error(`Cannot read corpus file: ${corpusPath}`);
    process.exitCode = 1;
    return;
  }

  const entries = parseCorpus(yamlSource);
  const { prepared, duplicates, errors } = prepare(entries);

  if (errors.length > 0) {
    console.error('Ingestion failed - fix these passages and re-run:');
    for (const message of errors) console.error(`  ${message}`);
    process.exitCode = 1;
    return;
  }

  const env = envSchema.safeParse(process.env);
  if (!env.success) {
    console.error('DATABASE_URL is required (set it in .env or the environment).');
    process.exitCode = 1;
    return;
  }
  const client = createDbClient(env.data.DATABASE_URL);
  try {
    await upsertAll(client.db, prepared);
  } finally {
    await client.sql.end();
  }

  printReport(prepared, duplicates);
}

await main();
