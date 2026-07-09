import { readFileSync } from 'node:fs';

import { proposeExcerpts, type Candidate } from './lib/propose.ts';

/**
 * CLI: propose curated-excerpt candidates from a public-domain source text
 * (Phase 3, plan §10.3). Prints ranked, sentence-aligned, already-normalized
 * candidates with their difficulty/band and a ready-to-edit YAML stub for the
 * curator to paste into `corpus/passages.yaml`.
 *
 *   pnpm propose path/to/source.txt [--limit N]
 */
function parseArgs(argv: string[]): { file: string; limit: number } {
  const args = argv.slice(2);
  let file: string | undefined;
  let limit = 15;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === '--limit') {
      const next = args[i + 1];
      if (next === undefined) throw new Error('--limit needs a number');
      limit = Number(next);
      if (!Number.isInteger(limit) || limit < 1) throw new Error('--limit must be a positive integer');
      i += 1;
    } else if (!arg.startsWith('--')) {
      file = arg;
    }
  }
  if (file === undefined) throw new Error('usage: pnpm propose <source.txt> [--limit N]');
  return { file, limit };
}

/** Wrap text to ~72 cols and indent, for the YAML `text: >` block. */
function yamlBlock(text: string): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line !== '' && (line + ' ' + word).length > 72) {
      lines.push(line);
      line = word;
    } else {
      line = line === '' ? word : `${line} ${word}`;
    }
  }
  if (line !== '') lines.push(line);
  return lines.map((l) => `    ${l}`).join('\n');
}

function printCandidate(c: Candidate, index: number): void {
  process.stdout.write(
    `\n# ${String(index + 1)}  ${String(c.charCount)} chars · ${String(c.wordCount)} words · ` +
      `difficulty ${String(c.difficulty)} (${c.band})` +
      `${c.hasDialogue ? ' · ⚠ dialogue' : ''}\n`,
  );
  process.stdout.write(`- author: <author-slug>\n`);
  process.stdout.write(`  author_name: <Author Name>\n`);
  process.stdout.write(`  era: <era>\n`);
  process.stdout.write(`  work: <work-slug>\n`);
  process.stdout.write(`  title: <Work Title>\n`);
  process.stdout.write(`  translator: <translator or omit>\n`);
  process.stdout.write(`  pub_year: <year>\n`);
  process.stdout.write(`  source: '<gutenberg:id>'\n`);
  process.stdout.write(`  themes: [<theme>]\n`);
  process.stdout.write(`  text: >\n${yamlBlock(c.text)}\n`);
}

function main(): void {
  const { file, limit } = parseArgs(process.argv);
  const raw = readFileSync(file, 'utf8');
  const candidates = proposeExcerpts(raw, { limit });
  if (candidates.length === 0) {
    process.stdout.write('No candidate excerpts fit the §6.1 guidelines in that source.\n');
    return;
  }
  process.stdout.write(
    `${String(candidates.length)} candidate excerpt(s) from ${file}, best first. ` +
      `Review, fill the metadata, and paste the ones you want into corpus/passages.yaml.\n`,
  );
  candidates.forEach(printCandidate);
}

main();
