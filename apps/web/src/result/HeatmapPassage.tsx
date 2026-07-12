import { parsePassage, type CharHeat, type HeatmapData } from '@prosetype/engine';
import { Fragment, type ReactElement } from 'react';

/**
 * Hesitation ramp (§7.6): heat is the engine's 0..1 log-scaled latency
 * (clamped at the run p95), mapped smoke → tungsten with a subtle opacity
 * lift - hesitation glows like the desk lamp caught it. Sequential job, one
 * perceptual direction, palette tokens only.
 */
function heatStyle(heat: number): { color: string; opacity: number } {
  const pct = Math.round(heat * 100);
  return {
    color: `color-mix(in srgb, var(--color-tungsten) ${String(pct)}%, var(--color-smoke))`,
    opacity: 0.7 + 0.3 * heat,
  };
}

/** Native tooltip: per-char latency and error touches (null title = no tooltip). */
function charTitle(heat: CharHeat): string | undefined {
  const parts: string[] = [];
  if (heat.interKeyMs !== null) parts.push(`${String(Math.round(heat.interKeyMs))} ms`);
  if (heat.errorTouches > 0) {
    parts.push(`${String(heat.errorTouches)} ${heat.errorTouches === 1 ? 'error' : 'errors'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/**
 * The passage re-rendered as the per-character hesitation heatmap (§7.6),
 * straight from the engine's `computeHeatmap` output - nothing is recomputed
 * here. Error-touched characters are marked in blood (reserved for errors)
 * with a thin underline so the mark is never color-alone; never-typed
 * characters stay dim smoke. Words are inline-blocks so lines break at word
 * boundaries, mirroring the typing stage.
 */
export function HeatmapPassage({
  text,
  heatmap,
}: {
  text: string;
  heatmap: HeatmapData;
}): ReactElement {
  const words = parsePassage(text).words;
  return (
    <p className="text-[1.2rem] leading-[1.9] tracking-[0.01em]">
      {words.map((word, wi) => (
        <Fragment key={word.start}>
          {wi > 0 ? ' ' : null}
          <span className="inline-block">
            {[...word.text].map((ch, ci) => {
              const index = word.start + ci;
              const heat = heatmap.perChar[index];
              if (heat === undefined) return <span key={index}>{ch}</span>;
              if (heat.errorTouches > 0) {
                return (
                  <span
                    key={index}
                    title={charTitle(heat)}
                    className="text-blood underline decoration-blood/80 decoration-1 underline-offset-[0.3em]"
                  >
                    {ch}
                  </span>
                );
              }
              if (heat.heat === null) {
                return (
                  <span key={index} className="text-smoke opacity-65">
                    {ch}
                  </span>
                );
              }
              return (
                <span key={index} title={charTitle(heat)} style={heatStyle(heat.heat)}>
                  {ch}
                </span>
              );
            })}
          </span>
        </Fragment>
      ))}
    </p>
  );
}
