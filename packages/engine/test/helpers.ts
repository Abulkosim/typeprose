import type { CharEvent, CharEvents } from '@typeprose/schema';
import { TypingEngine, createEngine } from '../src/index.ts';

/** Build a v1 log from raw tuples (tests only). */
export function log(events: [number, number, number][]): CharEvents {
  return { v: 1, events: events as CharEvent[] };
}

/**
 * Deterministic seeded PRNG (mulberry32). The engine itself never uses
 * randomness; tests do, seeded, per plan §11.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Type `text` into the engine verbatim (spaces become commitSpace) with evenly
 * spaced keystrokes from t=0 to t=totalMs. Returns the engine.
 */
export function typeEvenly(engine: TypingEngine, text: string, totalMs: number): TypingEngine {
  const n = text.length;
  let k = 0;
  for (const ch of text) {
    const ts = n === 1 ? 0 : Math.round((k * totalMs) / (n - 1));
    k += 1;
    if (ch === ' ') engine.commitSpace(ts);
    else engine.addChar(ch, ts);
  }
  return engine;
}

const WORD_ALPHABET = [...'abcdefgho,.;\'"-'];

/** A random canonical passage: 1–10 words of 1–8 chars. */
export function randomPassage(rng: () => number): string {
  const wordCount = 1 + Math.floor(rng() * 10);
  const words: string[] = [];
  for (let w = 0; w < wordCount; w += 1) {
    const len = 1 + Math.floor(rng() * 8);
    let word = '';
    for (let c = 0; c < len; c += 1) {
      word += WORD_ALPHABET[Math.floor(rng() * WORD_ALPHABET.length)];
    }
    words.push(word);
  }
  return words.join(' ');
}

/**
 * Drive a random but valid run to completion: a mix of correct chars, errors,
 * corrections, early spaces (skips), extras, over-cap presses, backspaces and
 * word-clears, then a deterministic force-finish. Returns the completed engine.
 */
export function randomRun(passageText: string, rng: () => number): TypingEngine {
  const engine = createEngine(passageText);
  let ts = 1000 + rng() * 1000; // arbitrary caller-clock origin
  const nextTs = (): number => {
    ts += 1 + Math.floor(rng() * 140);
    return ts;
  };
  const maxOps = 1200;
  for (let op = 0; op < maxOps && engine.status !== 'complete'; op += 1) {
    const snap = engine.getSnapshot();
    const word = snap.words[snap.activeWordIndex];
    if (word === undefined) break;
    const targetChar = word.target[snap.activeCharIndex]; // undefined at/past word end
    const roll = rng();
    if (roll < 0.6 && targetChar !== undefined) {
      engine.addChar(targetChar, nextTs());
    } else if (roll < 0.72) {
      // a wrong char (or an extra / over-cap press when at/past the word end)
      const wrong = targetChar === 'z' ? 'q' : 'z';
      engine.addChar(wrong, nextTs());
    } else if (roll < 0.82) {
      engine.backspace(nextTs());
    } else if (roll < 0.92) {
      engine.commitSpace(nextTs()); // may be a no-op (empty word / last word)
    } else if (roll < 0.96) {
      engine.backspace(nextTs(), { wholeWord: true });
    } else if (targetChar !== undefined) {
      engine.addChar(targetChar, nextTs());
    }
  }
  // Force-finish deterministically so every generated run completes.
  while (engine.status !== 'complete') {
    const snap = engine.getSnapshot();
    const word = snap.words[snap.activeWordIndex];
    if (word === undefined) throw new Error('unreachable: no active word');
    if (snap.activeCharIndex < word.target.length) {
      engine.addChar(word.target[snap.activeCharIndex] as string, nextTs());
    } else {
      engine.commitSpace(nextTs());
    }
  }
  return engine;
}
