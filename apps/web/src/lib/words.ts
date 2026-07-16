/**
 * Word mode (Monkeytype-style): a bundled common-English word list and a
 * generator that samples it into a canonical space-joined string the engine can
 * consume directly. Unlike the curated prose corpus, this is an inexhaustible
 * source of tests - the point of the mode.
 *
 * The list is lowercase, alphabetic, no punctuation, so any join with single
 * spaces is already canonical (§6.2): no leading/trailing/double spaces, no
 * non-space whitespace. That keeps `createEngine(text)` happy with zero
 * special-casing. Sampling is with replacement (words may repeat), matching
 * Monkeytype's default behaviour.
 */

/** The word-count presets offered in the command palette (default 200). */
export const WORD_COUNTS = [25, 50, 100, 200] as const;

export type WordCount = (typeof WORD_COUNTS)[number];

export const DEFAULT_WORD_COUNT: WordCount = 200;

/** Narrow an arbitrary number to a known preset, falling back to the default. */
export function asWordCount(value: number): WordCount {
  return (WORD_COUNTS as readonly number[]).includes(value) ? (value as WordCount) : DEFAULT_WORD_COUNT;
}

/**
 * How many words to pre-generate for a timed run of `seconds` (§2.3). Sized so
 * a typist at the submission plausibility ceiling (350 wpm) cannot reach the
 * end before the clock runs out - a timed run must always end on the timer, not
 * by exhausting the buffer. 350 wpm = 350 words/min; add a margin on top.
 */
export function timedBufferWordCount(seconds: number): number {
  const CEILING_WPM = 350;
  return Math.ceil((seconds * CEILING_WPM) / 60) + 40;
}

/**
 * The ~500 most common English words (lowercase, no punctuation). Sampled with
 * replacement, this gives effectively unlimited distinct tests. Curated from
 * standard frequency lists; order is not significant.
 */
export const COMMON_WORDS: readonly string[] = [
  'the', 'be', 'of', 'and', 'a', 'to', 'in', 'he', 'have', 'it', 'that', 'for', 'they', 'i',
  'with', 'as', 'not', 'on', 'she', 'at', 'by', 'this', 'we', 'you', 'do', 'but', 'from', 'or',
  'which', 'one', 'would', 'all', 'will', 'there', 'say', 'who', 'make', 'when', 'can', 'more',
  'if', 'no', 'man', 'out', 'other', 'so', 'what', 'time', 'up', 'go', 'about', 'than', 'into',
  'could', 'state', 'only', 'new', 'year', 'some', 'take', 'come', 'these', 'know', 'see', 'use',
  'get', 'like', 'then', 'first', 'any', 'work', 'now', 'may', 'such', 'give', 'over', 'think',
  'most', 'even', 'find', 'day', 'also', 'after', 'way', 'many', 'must', 'look', 'before', 'great',
  'back', 'through', 'long', 'where', 'much', 'should', 'well', 'people', 'down', 'own', 'just',
  'because', 'good', 'each', 'those', 'feel', 'seem', 'how', 'high', 'too', 'place', 'little',
  'world', 'very', 'still', 'nation', 'hand', 'old', 'life', 'tell', 'write', 'become', 'here',
  'show', 'house', 'both', 'between', 'need', 'mean', 'call', 'develop', 'under', 'last', 'right',
  'move', 'thing', 'general', 'school', 'never', 'same', 'another', 'begin', 'while', 'number',
  'part', 'turn', 'real', 'leave', 'might', 'want', 'point', 'form', 'off', 'child', 'few', 'small',
  'since', 'against', 'ask', 'late', 'home', 'interest', 'large', 'person', 'end', 'open', 'public',
  'follow', 'during', 'present', 'without', 'again', 'hold', 'govern', 'around', 'possible', 'head',
  'consider', 'word', 'program', 'problem', 'however', 'lead', 'system', 'set', 'order', 'eye',
  'plan', 'run', 'keep', 'face', 'fact', 'group', 'play', 'stand', 'increase', 'early', 'course',
  'change', 'help', 'line', 'city', 'put', 'close', 'case', 'force', 'meet', 'once', 'water', 'upon',
  'war', 'build', 'hear', 'light', 'unite', 'live', 'every', 'country', 'bring', 'center', 'let',
  'side', 'try', 'provide', 'continue', 'name', 'certain', 'power', 'pay', 'result', 'question',
  'study', 'woman', 'member', 'until', 'far', 'night', 'always', 'service', 'away', 'report',
  'something', 'company', 'week', 'church', 'toward', 'start', 'social', 'room', 'figure', 'nature',
  'though', 'young', 'less', 'enough', 'almost', 'read', 'include', 'president', 'nothing', 'yet',
  'better', 'big', 'boy', 'cost', 'business', 'value', 'second', 'why', 'clear', 'expect', 'family',
  'complete', 'act', 'sense', 'mind', 'experience', 'art', 'next', 'near', 'direct', 'car', 'law',
  'industry', 'important', 'girl', 'god', 'several', 'matter', 'usual', 'rather', 'per', 'often',
  'kind', 'among', 'white', 'reason', 'action', 'return', 'foot', 'care', 'simple', 'within', 'love',
  'human', 'along', 'appear', 'doctor', 'believe', 'speak', 'active', 'student', 'month', 'drive',
  'concern', 'best', 'door', 'hope', 'example', 'inform', 'body', 'ever', 'least', 'probable',
  'understand', 'reach', 'effect', 'different', 'idea', 'whole', 'control', 'condition', 'field',
  'pass', 'fall', 'note', 'special', 'talk', 'particular', 'today', 'measure', 'walk', 'teach',
  'low', 'hour', 'type', 'carry', 'rate', 'remain', 'full', 'street', 'easy', 'though', 'stop',
  'fail', 'oh', 'produce', 'cut', 'space', 'clearly', 'remember', 'shall', 'total', 'relation',
  'word', 'suggest', 'record', 'wide', 'himself', 'together', 'sound', 'stay', 'available',
  'above', 'court', 'force', 'wish', 'family', 'grow', 'buy', 'blood', 'ago', 'window', 'office',
  'huge', 'gun', 'similar', 'death', 'score', 'forward', 'material', 'morning', 'evening', 'table',
  'sort', 'model', 'catch', 'fine', 'send', 'ground', 'age', 'moment', 'wear', 'sea', 'fire',
  'account', 'watch', 'ready', 'sign', 'thought', 'listen', 'wait', 'green', 'friend', 'edge',
  'stone', 'wall', 'north', 'south', 'east', 'west', 'save', 'quiet', 'quick', 'story', 'floor',
  'garden', 'summer', 'winter', 'river', 'road', 'field', 'tree', 'bird', 'animal', 'horse',
  'money', 'music', 'picture', 'paper', 'letter', 'voice', 'heart', 'dream', 'truth', 'peace',
  'future', 'past', 'season', 'weather', 'color', 'shape', 'sky', 'star', 'moon', 'sun', 'cloud',
  'rain', 'wind', 'snow', 'earth', 'mountain', 'valley', 'forest', 'ocean', 'island', 'beach',
] as const;

/** A source of randomness in [0, 1), injectable so callers can seed sampling deterministically in tests. */
export type Rng = () => number;

/**
 * Options for `generateWordText`'s per-word transforms (Batch C §2.3: word-mode
 * punctuation/numbers toggles). The drill mode (§2.2) samples via
 * `generateDrillText` in `lib/drill.ts` instead, which intentionally never
 * passes these through (digits/punctuation would dilute the letter-training
 * signal).
 */
export interface WordTextOptions {
  /** Replace some sampled words with digit-only numbers. */
  numbers?: boolean;
  /** Add terminal punctuation/commas and capitalize sentence starts. */
  punctuation?: boolean;
}

/** Probability `applyNumbers` replaces a given word with a number. */
export const NUMBER_PROB = 0.15;
/** Probability `applyPunctuation` ends a "sentence" at a given non-last word. */
export const SENTENCE_END_PROB = 0.12;
/** Probability `applyPunctuation` appends a comma to a non-last, non-sentence-ending word. */
export const COMMA_PROB = 0.08;

/** Sentence-terminal marks; periods are weighted to be the common case. */
const TERMINALS = ['.', '.', '.', '!', '?'] as const;

/** Uppercase a word's first character; words are never empty here, but guard anyway. */
function capitalize(word: string): string {
  const first = word[0];
  return first === undefined ? word : first.toUpperCase() + word.slice(1);
}

/**
 * Sample `count` words with replacement from `pool` using `rng` for the index
 * draw. Pulled out of `generateWordText` so the weak-key drill (§2.2) can
 * reuse the same uniform-sampling logic over a filtered word pool.
 */
export function sampleWords(pool: readonly string[], count: number, rng: Rng): string[] {
  const n = pool.length;
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const word = pool[Math.floor(rng() * n)];
    // The index is always in range (0 <= idx < n, n > 0), so word is defined;
    // the guard just satisfies noUncheckedIndexedAccess.
    if (word !== undefined) out.push(word);
  }
  return out;
}

/**
 * Replace some words outright with a digit-only "number" (probability
 * `NUMBER_PROB` per word). Lengths are 1-4 digits, uniformly; multi-digit
 * numbers never start with a leading zero (single digits may be '0'). A pure
 * 1:1 word-for-word swap - the word count and space layout are untouched, so
 * the canonicality invariant (§6.2) holds automatically.
 */
export function applyNumbers(words: readonly string[], rng: Rng): string[] {
  return words.map((word) => {
    if (rng() >= NUMBER_PROB) return word;
    const digits = 1 + Math.floor(rng() * 4); // 1-4 digits
    const first = digits === 1 ? Math.floor(rng() * 10) : 1 + Math.floor(rng() * 9);
    let number = String(first);
    for (let i = 1; i < digits; i += 1) {
      number += String(Math.floor(rng() * 10));
    }
    return number;
  });
}

/**
 * Add Monkeytype-style sentence punctuation: the first word is capitalized,
 * the last word always gets a trailing '.', and each other non-last word gets
 * (independently rolled, in this order) either a sentence-ending terminal -
 * which also capitalizes the following word - at `SENTENCE_END_PROB`, or a
 * trailing comma at `COMMA_PROB`. Punctuation is always appended directly to a
 * word (never as its own token), so no spaces or empty words are introduced
 * and the word count is preserved (§6.2 canonicality).
 */
export function applyPunctuation(words: readonly string[], rng: Rng): string[] {
  const last = words.length - 1;
  let capitalizeNext = true;
  return words.map((original, i) => {
    let word = capitalizeNext ? capitalize(original) : original;
    capitalizeNext = false;
    if (i === last) {
      word += '.';
    } else if (rng() < SENTENCE_END_PROB) {
      // The index is always in range (TERMINALS is non-empty), so the guard
      // just satisfies noUncheckedIndexedAccess.
      const terminal = TERMINALS[Math.floor(rng() * TERMINALS.length)];
      if (terminal !== undefined) word += terminal;
      capitalizeNext = true;
    } else if (rng() < COMMA_PROB) {
      word += ',';
    }
    return word;
  });
}

/**
 * Sample `count` words with replacement into a canonical single-spaced string.
 * Numbers are applied before punctuation (a number can end a "sentence" just
 * like any other word). The output is guaranteed canonical (§6.2): sampled
 * words are lowercase and space-free, and both transforms only append
 * non-space characters to existing words, so `createEngine(generateWordText(n))`
 * is always valid. `rng` defaults to `Math.random` so every existing bare
 * `generateWordText(n)` call site is unaffected; tests can seed it for
 * determinism.
 *
 * @throws if `count` is not a positive integer.
 */
export function generateWordText(
  count: number,
  options: WordTextOptions = {},
  rng: Rng = Math.random,
): string {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`word count must be a positive integer, got ${String(count)}`);
  }
  let words = sampleWords(COMMON_WORDS, count, rng);
  if (options.numbers === true) words = applyNumbers(words, rng);
  if (options.punctuation === true) words = applyPunctuation(words, rng);
  return words.join(' ');
}
