import type { RunStats } from '@prosetype/engine';
import type { Passage } from '@prosetype/schema';

import type { CompletedRun } from '../result/ResultView';

/**
 * Shareable result card (Phase 3, plan §10.3). Rendered on a canvas - not
 * SVG→img - so the loaded web fonts (Plex Mono, EB Garamond) draw reliably
 * without font embedding. The card is always the noir look regardless of the
 * active UI theme: it is a brand artifact, not a screenshot of the current view.
 */

/** "- Fyodor Dostoevsky, Crime and Punishment, trans. Garnett" (shared with the epigraph). */
export function formatAttribution(passage: Passage): string {
  const base = `- ${passage.author.name}, ${passage.work.title}`;
  return passage.work.translator !== null ? `${base}, trans. ${passage.work.translator}` : base;
}

/** Filename for the downloaded card, e.g. `prosetype-dostoevsky-92wpm.png`. */
export function cardFilename(passage: Passage, stats: RunStats): string {
  return `prosetype-${passage.author.slug}-${String(Math.round(stats.wpm))}wpm.png`;
}

const CARD_W = 1200;
const CARD_H = 630;
const SCALE = 2; // crisp on retina and when scaled down by social embeds
const MARGIN = 72;

/** Noir palette (§9.4), inlined so the card never depends on the DOM theme. */
const INK = {
  stage: '#12100E',
  bar: '#0B0906',
  bone: '#E6E0D2',
  smoke: '#6E675C',
  tungsten: '#C99A3C',
} as const;

/** Trim a string with an ellipsis until it fits `maxWidth` at the current font. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed.trimEnd()}…`;
}

/** Draw the result card onto a fresh canvas at 2x. Awaits web fonts first. */
export async function renderResultCardCanvas(
  run: CompletedRun,
  passage: Passage,
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W * SCALE;
  canvas.height = CARD_H * SCALE;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2d canvas context unavailable');
  ctx.scale(SCALE, SCALE);
  await document.fonts.ready;

  const { stats } = run;

  // Stage + letterbox bars.
  ctx.fillStyle = INK.stage;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = INK.bar;
  ctx.fillRect(0, 0, CARD_W, 44);
  ctx.fillRect(0, CARD_H - 44, CARD_W, 44);

  // Wordmark in the top bar.
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK.smoke;
  ctx.font = '500 15px "IBM Plex Mono"';
  ctx.letterSpacing = '3px';
  ctx.fillText('PROSETYPE', MARGIN, 22);
  ctx.letterSpacing = '0px';

  // Big wpm number + unit.
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK.tungsten;
  ctx.font = '500 150px "IBM Plex Mono"';
  const wpmText = String(stats.wpm);
  ctx.fillText(wpmText, MARGIN, 255);
  const wpmWidth = ctx.measureText(wpmText).width;
  ctx.fillStyle = INK.smoke;
  ctx.font = '500 24px "IBM Plex Mono"';
  ctx.letterSpacing = '2px';
  ctx.fillText('WPM', MARGIN + wpmWidth + 22, 255);
  ctx.letterSpacing = '0px';

  // Secondary stats.
  ctx.font = '500 27px "IBM Plex Mono"';
  let x = MARGIN;
  const y = 330;
  const stat = (label: string, value: string): void => {
    ctx.fillStyle = INK.smoke;
    ctx.fillText(`${label} `, x, y);
    x += ctx.measureText(`${label} `).width;
    ctx.fillStyle = INK.bone;
    ctx.fillText(value, x, y);
    x += ctx.measureText(value).width + 40;
  };
  stat('raw', String(stats.rawWpm));
  stat('acc', `${String(stats.accuracy)}%`);
  stat('consistency', `${String(stats.consistency)}%`);

  // Tungsten rule + attribution epigraph.
  ctx.fillStyle = INK.tungsten;
  ctx.fillRect(MARGIN, 430, 60, 3);
  ctx.fillStyle = INK.smoke;
  ctx.font = 'italic 34px "EB Garamond"';
  ctx.fillText(fit(ctx, formatAttribution(passage), CARD_W - 2 * MARGIN), MARGIN, 500);

  return canvas;
}

/** Render the card to a PNG blob. */
export async function renderResultCard(run: CompletedRun, passage: Passage): Promise<Blob> {
  const canvas = await renderResultCardCanvas(run, passage);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error('canvas.toBlob returned null'));
      else resolve(blob);
    }, 'image/png');
  });
}

export type ShareOutcome = 'copied' | 'downloaded';

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Copy the card image to the clipboard where supported (secure context +
 * ClipboardItem), else download it. Returns which path was taken so the UI can
 * report it.
 */
export async function shareResultCard(run: CompletedRun, passage: Passage): Promise<ShareOutcome> {
  const blob = await renderResultCard(run, passage);
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write !== undefined) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    }
  } catch {
    // Clipboard denied/unavailable - fall back to a download.
  }
  download(blob, cardFilename(passage, run.stats));
  return 'downloaded';
}
