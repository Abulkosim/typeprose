import type { ReactElement } from 'react';

/** ViewBox geometry - rendered at 100% width, aspect preserved. */
const W = 600;
const H = 150;
const TOP = 16; // y of the peak gridline
const BASE = 116; // y of the zero baseline
const PAD_L = 4;
const PAD_R = 4;
const LABEL_Y = 138;
const PLOT_W = W - PAD_L - PAD_R;

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** One point on the progress chart (a subset of ResultSummary). */
export interface ProgressPoint {
  wpm: number;
  accuracy: number;
  createdAt: string;
}

/**
 * Hand-rolled SVG wpm-over-time chart (no chart library, matching WpmSparkline).
 * The primary series is wpm as a tungsten line + dots, y-anchored at 0 so a bad
 * session reads as an honest dip. Accuracy rides along as a faint dashed smoke
 * line on its own auto-scaled axis (it lives in a narrow 90–100% band, so a
 * shared 0-anchored scale would flatten it to a straight line) - clearly a
 * secondary reference, labelled with its own range.
 */
export function ProgressChart({ history }: { history: readonly ProgressPoint[] }): ReactElement | null {
  if (history.length < 2) return null;

  // `history` arrives newest-first; plot oldest → newest, left → right.
  const points = [...history].reverse();
  const n = points.length;
  const x = (i: number): number => PAD_L + (i / (n - 1)) * PLOT_W;

  const wpmPeak = Math.max(...points.map((p) => p.wpm), 1);
  const yWpm = (v: number): number => TOP + (1 - v / wpmPeak) * (BASE - TOP);

  const accs = points.map((p) => p.accuracy);
  const accMin = Math.min(...accs);
  const accMax = Math.max(...accs);
  const accSpan = accMax - accMin;
  // Flat when every run has the same accuracy: pin the line to the middle band.
  const yAcc = (v: number): number =>
    accSpan === 0 ? (TOP + BASE) / 2 : TOP + (1 - (v - accMin) / accSpan) * (BASE - TOP);

  const wpmPath = points.map((p, i) => `${x(i).toFixed(1)},${yWpm(p.wpm).toFixed(1)}`).join(' ');
  const accPath = points.map((p, i) => `${x(i).toFixed(1)},${yAcc(p.accuracy).toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${String(W)} ${String(H)}`}
      className="w-full"
      role="img"
      aria-label={`Words-per-minute across your last ${String(n)} runs, peaking at ${String(Math.round(wpmPeak))}, with accuracy from ${String(Math.round(accMin))} to ${String(Math.round(accMax))} percent`}
    >
      {/* Zero baseline + dashed peak gridline (dim smoke). */}
      <line x1={PAD_L} y1={BASE} x2={W - PAD_R} y2={BASE} className="stroke-smoke/40" strokeWidth={1} />
      <line
        x1={PAD_L}
        y1={TOP}
        x2={W - PAD_R}
        y2={TOP}
        className="stroke-smoke/25"
        strokeWidth={1}
        strokeDasharray="2 5"
      />
      <text x={PAD_L} y={TOP - 5} className="fill-smoke text-[10px]">
        {Math.round(wpmPeak)} wpm
      </text>
      <text x={W - PAD_R} y={TOP - 5} textAnchor="end" className="fill-smoke text-[10px]">
        acc {Math.round(accMin)}–{Math.round(accMax)}%
      </text>
      <text x={PAD_L} y={LABEL_Y} className="fill-smoke text-[10px]">
        {formatWhen(points[0]?.createdAt ?? '')}
      </text>
      <text x={W - PAD_R} y={LABEL_Y} textAnchor="end" className="fill-smoke text-[10px]">
        {formatWhen(points[n - 1]?.createdAt ?? '')}
      </text>

      {/* Secondary series: accuracy, faint + dashed, its own scale. */}
      <polyline
        points={accPath}
        fill="none"
        className="stroke-smoke/50"
        strokeWidth={1}
        strokeDasharray="3 3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Primary series: wpm, tungsten line + dots. */}
      <polyline
        points={wpmPath}
        fill="none"
        className="stroke-tungsten"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={yWpm(p.wpm)} r={2} className="fill-tungsten" />
      ))}
    </svg>
  );
}
