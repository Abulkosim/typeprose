/**
 * Text normalization per plan §6.3, targeting the canonical set of §6.2:
 * ASCII letters, digits, space, and the punctuation set . , ; : ! ? ' " - ( )
 *
 * Pure functions only; no I/O, no globals.
 */

/** Matches exactly one character of the §6.2 canonical set. */
const CANONICAL_CHAR_RE = /[A-Za-z0-9 .,;:!?'"()-]/;

/** Curly single quotes ‘ ’ (U+2018, U+2019). */
const CURLY_SINGLE_QUOTE_RE = /[\u2018\u2019]/g;
/** Curly double quotes “ ” (U+201C, U+201D). */
const CURLY_DOUBLE_QUOTE_RE = /[\u201C\u201D]/g;
/** Ellipsis … (U+2026). */
const ELLIPSIS_RE = /\u2026/g;
/** Em and en dash (U+2014, U+2013) with any surrounding whitespace. */
const DASH_RE = /\s*[\u2014\u2013]\s*/g;
/**
 * Non-breaking and exotic spaces: NBSP, Ogham space, U+2000-U+200A quad/thin
 * spaces, narrow NBSP, math space, ideographic space, BOM-as-space.
 */
const EXOTIC_SPACE_RE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]/g;
/** Zero-width space/non-joiner/joiner, removed outright. */
const ZERO_WIDTH_RE = /[\u200B-\u200D]/g;
/** Combining diacritical marks (U+0300-U+036F), stripped after NFD. */
const COMBINING_MARKS_RE = /[\u0300-\u036F]/g;

/**
 * Ligatures and other Latin letters that do not decompose to an ASCII base
 * via NFD. The plan lists `æ→ae` and `œ→oe` explicitly; the rest are the
 * boring completions of the same idea.
 */
const LIGATURE_MAP: Record<string, string> = {
  æ: 'ae', // æ
  Æ: 'AE', // Æ
  œ: 'oe', // œ
  Œ: 'OE', // Œ
  ß: 'ss', // ß
  ø: 'o', // ø
  Ø: 'O', // Ø
};

/** A word whose accented characters were folded to ASCII during normalization. */
export interface FoldedWord {
  original: string;
  folded: string;
}

export interface NormalizedText {
  /** Canonical passage text (§6.2): single spaces, trimmed, ASCII-only. */
  text: string;
  /** Every word that changed during accent folding, for the curation report. */
  foldedWords: FoldedWord[];
  /** The distinct non-ASCII characters that were folded, e.g. ['é', 'æ']. */
  foldedChars: string[];
}

/** Thrown when a character outside the §6.2 canonical set survives normalization. */
export class IllegalCharacterError extends Error {
  readonly characters: string[];

  constructor(characters: string[]) {
    super(`Illegal character(s) after normalization: ${characters.map(describeChar).join(', ')}`);
    this.name = 'IllegalCharacterError';
    this.characters = characters;
  }
}

export function describeChar(char: string): string {
  const codePoint = char.codePointAt(0) ?? 0;
  return `"${char}" (U+${codePoint.toString(16).toUpperCase().padStart(4, '0')})`;
}

/**
 * Fold a single non-ASCII character to its ASCII equivalent, or return null
 * when no accent-folding rule applies (the caller lets validation fail loudly).
 */
function foldChar(char: string): string | null {
  const ligature = LIGATURE_MAP[char];
  if (ligature !== undefined) return ligature;
  const decomposed = char.normalize('NFD').replace(COMBINING_MARKS_RE, '');
  if (decomposed !== char && /^[A-Za-z]$/.test(decomposed)) return decomposed;
  return null;
}

/**
 * Normalize raw excerpt text per §6.3:
 *  1. curly quotes → straight quotes
 *  2. ellipsis `…` → `...`
 *  3. em/en dashes (spaced or not) collapse to a single spaced hyphen (so `word-word` becomes `word - word`)
 *  4. non-breaking/exotic spaces → regular space; zero-width characters removed
 *  5. whitespace runs collapsed to single spaces; trimmed
 *  6. accented Latin folded to ASCII, with every changed word recorded
 *
 * Throws {@link IllegalCharacterError} if any character outside the §6.2
 * canonical set remains after all of the above.
 */
export function normalizeText(raw: string): NormalizedText {
  let s = raw
    .replace(CURLY_SINGLE_QUOTE_RE, "'")
    .replace(CURLY_DOUBLE_QUOTE_RE, '"')
    .replace(ELLIPSIS_RE, '...')
    .replace(DASH_RE, ' - ')
    .replace(EXOTIC_SPACE_RE, ' ')
    .replace(ZERO_WIDTH_RE, '');

  // Collapse whitespace runs (incl. newlines/tabs) and trim.
  s = s.replace(/\s+/g, ' ').trim();

  // Accent folding, tracked per word for the curation report.
  const foldedWords: FoldedWord[] = [];
  const foldedChars = new Set<string>();
  const words = s.split(' ').map((word) => {
    let changed = false;
    const folded = [...word]
      .map((char) => {
        if ((char.codePointAt(0) ?? 0) < 0x80) return char;
        const replacement = foldChar(char);
        if (replacement === null) return char; // validation below fails loudly
        changed = true;
        foldedChars.add(char);
        return replacement;
      })
      .join('');
    if (changed) foldedWords.push({ original: word, folded });
    return folded;
  });
  s = words.join(' ');

  // Fail loudly on anything outside the §6.2 canonical set.
  const illegal = [...new Set([...s].filter((char) => !CANONICAL_CHAR_RE.test(char)))];
  if (illegal.length > 0) throw new IllegalCharacterError(illegal);

  return { text: s, foldedWords, foldedChars: [...foldedChars] };
}
