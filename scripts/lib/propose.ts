import { bandForScore, computeDifficulty, type Band } from './difficulty.ts';
import { IllegalCharacterError, normalizeText } from '@typeprose/engine';

/**
 * Auto-excerpt proposer (Phase 3, plan §10.3). Given a public-domain source
 * text, propose sentence-aligned candidate excerpts that fit the §6.1 curation
 * guidelines (140–450 chars, 25–80 words, whole sentences, dialogue avoided),
 * each already normalized (§6.3) and scored with its difficulty/band. It is a
 * curator aid only - a human still picks and pastes into `corpus/passages.yaml`.
 */

export interface Candidate {
  /** Normalized, typeable text (§6.2/§6.3). */
  text: string;
  charCount: number;
  wordCount: number;
  difficulty: number;
  band: Band;
  /** Contains quotation marks - likely dialogue, which §6.1 says to avoid. */
  hasDialogue: boolean;
  /** Fitness score (higher is better); used to rank proposals. */
  score: number;
}

export interface ProposeOptions {
  minChars?: number;
  maxChars?: number;
  minWords?: number;
  maxWords?: number;
  /** Max proposals to return (best first). */
  limit?: number;
}

const DEFAULTS = { minChars: 140, maxChars: 450, minWords: 25, maxWords: 80, limit: 20 };

/** Split on blank lines into paragraphs, each with whitespace collapsed. */
export function splitParagraphs(raw: string): string[] {
  return raw
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);
}

/** Split a paragraph into sentences at `.!?` (keeping any trailing quote/bracket). */
export function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?]["')\]]?)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function scoreOf(text: string, charCount: number, hasDialogue: boolean): number {
  const startsClean = /^[A-Z"'(]/.test(text);
  const endsClean = /[.!?]["')\]]?$/.test(text);
  // Comfortable target ~280 chars; penalize distance, dialogue, ragged ends.
  return (
    100 -
    Math.abs(charCount - 280) / 8 -
    (hasDialogue ? 25 : 0) -
    (startsClean ? 0 : 15) -
    (endsClean ? 0 : 15)
  );
}

/**
 * Propose excerpts, best first. For each starting sentence it grows a window of
 * consecutive sentences and emits the first that lands in range - so proposals
 * begin and end at sentence boundaries. Windows with characters that can't be
 * normalized to the §6.2 set are skipped.
 */
export function proposeExcerpts(raw: string, options: ProposeOptions = {}): Candidate[] {
  const opts = { ...DEFAULTS, ...options };
  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  for (const paragraph of splitParagraphs(raw)) {
    const sentences = splitSentences(paragraph);
    for (let start = 0; start < sentences.length; start += 1) {
      let acc = '';
      for (let end = start; end < sentences.length; end += 1) {
        acc = acc === '' ? sentences[end]! : `${acc} ${sentences[end]!}`;
        if (acc.length > opts.maxChars * 1.4) break; // too long even before normalizing

        let text: string;
        try {
          text = normalizeText(acc).text;
        } catch (err) {
          if (err instanceof IllegalCharacterError) break; // un-typeable char in this run
          throw err;
        }

        const charCount = text.length;
        if (charCount > opts.maxChars) break;
        const wordCount = text.split(' ').length;
        if (charCount < opts.minChars || wordCount < opts.minWords) continue;
        if (wordCount > opts.maxWords) break;

        if (!seen.has(text)) {
          seen.add(text);
          const hasDialogue = text.includes('"');
          const { score: difficulty } = computeDifficulty(text);
          candidates.push({
            text,
            charCount,
            wordCount,
            difficulty,
            band: bandForScore(difficulty),
            hasDialogue,
            score: scoreOf(text, charCount, hasDialogue),
          });
        }
        break; // one (shortest in-range) proposal per starting sentence
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, opts.limit);
}
