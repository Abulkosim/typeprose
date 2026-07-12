import type { ReactElement } from 'react';

/** ViewBox geometry - rendered at 100% width, aspect preserved (no text distortion). */
const W = 600;
const H = 120;
const TOP = 16; // y of the peak gridline
const BASE = 100; // y of the zero baseline
const LABEL_Y = 116;

function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Hand-rolled SVG wpm-over-time sparkline (§9.3 - no chart library). One
 * series, so it carries no legend: a single tungsten 2px line over minimal
 * dim-smoke axes - the zero baseline, a dashed gridline at the run's peak with
 * its value, and start/end time labels. The y-domain is anchored at 0 so
 * pauses read as honest dips, not rescaled drama.
 */
export function WpmSparkline({
  buckets,
  durationMs,
}: {
  /** Per-1-second raw-wpm buckets from `computePerSecondRawWpm`. */
  buckets: readonly number[];
  durationMs: number;
}): ReactElement | null {
  if (buckets.length === 0) return null;

  const peak = Math.max(...buckets, 1);
  const y = (v: number): number => TOP + (1 - v / peak) * (BASE - TOP);
  const points =
    buckets.length === 1
      ? `0,${y(buckets[0] ?? 0).toFixed(1)} ${String(W)},${y(buckets[0] ?? 0).toFixed(1)}`
      : buckets
          .map((v, i) => `${((i / (buckets.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`)
          .join(' ');

  return (
    <svg
      viewBox={`0 0 ${String(W)} ${String(H)}`}
      className="w-full"
      role="img"
      aria-label={`Raw words-per-minute over time, peaking at ${String(Math.round(peak))}`}
    >
      {/* Minimal axes, dim smoke: zero baseline + dashed peak gridline */}
      <line x1={0} y1={BASE} x2={W} y2={BASE} className="stroke-smoke/40" strokeWidth={1} />
      <line
        x1={0}
        y1={TOP}
        x2={W}
        y2={TOP}
        className="stroke-smoke/25"
        strokeWidth={1}
        strokeDasharray="2 5"
      />
      <text x={W} y={TOP - 5} textAnchor="end" className="fill-smoke text-[10px]">
        {Math.round(peak)} raw
      </text>
      <text x={0} y={LABEL_Y} className="fill-smoke text-[10px]">
        0:00
      </text>
      <text x={W} y={LABEL_Y} textAnchor="end" className="fill-smoke text-[10px]">
        {formatClock(durationMs)}
      </text>
      {/* The single series: tungsten, thin, no fill */}
      <polyline
        points={points}
        fill="none"
        className="stroke-tungsten"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
