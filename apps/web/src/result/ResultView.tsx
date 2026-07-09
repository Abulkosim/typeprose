import { computeHeatmap, computePerSecondRawWpm, type RunStats } from '@prosetype/engine';
import type { CharEvents, Passage } from '@prosetype/schema';
import { useState, useMemo, type ReactElement } from 'react';

import { Epigraph } from '../components/Epigraph';
import { shareResultCard } from '../lib/shareCard';
import { HeatmapPassage } from './HeatmapPassage';
import { WpmSparkline } from './WpmSparkline';

/**
 * A finished run as handed from the typing stage to the result view
 * (plan §9.3 completion). Everything the full result view needs (heatmap,
 * sparkline, and later submission) derives from `log` via the pure engine
 * replay functions (`computeStats`, `computePerSecondRawWpm`, `computeHeatmap`).
 */
export interface CompletedRun {
  /** Final §7.3 stats from the engine at completion (identical to a replay of `log`). */
  stats: RunStats;
  /** The §7.5 charEvents wire log for this run. */
  log: CharEvents;
  /** True when this run followed an esc-restart of the same passage (§7.1). */
  restarted: boolean;
}

/**
 * The seam between the typing stage and the result view. The stage renders
 * `<ResultView run={...} passage={...} onNext={...} />` on completion (after
 * the 300ms hold); Tab from the result view also triggers `onNext` via the
 * stage's document-level key handling.
 */
export interface ResultViewProps {
  run: CompletedRun;
  /** The passage that was typed (attribution epigraph, heatmap target text). */
  passage: Passage;
  /** Abandon this result and load a new random passage. */
  onNext: () => void;
}

/** "punctuation tax +38%": whole percent, explicit sign, a middle dot when unsampled. */
function formatTax(pct: number | null): string {
  if (pct === null) return '·';
  const rounded = Math.round(pct);
  return `${rounded >= 0 ? '+' : ''}${String(rounded)}%`;
}

/**
 * Result view (§9.3/§9.4): a title card. Big stats (wpm large; raw, accuracy,
 * consistency smaller), the hand-rolled wpm-over-time sparkline, the passage
 * re-rendered as the §7.6 hesitation heatmap under its attribution epigraph,
 * then the reader stats: three slowest words and the punctuation tax. All
 * derived data comes from the engine's pure replay functions; nothing is
 * recomputed here. Motion is a single 180ms fade-cut in (`animate-fade-in`).
 *
 * Tab-for-next needs no listener here: the typing stage stays mounted beneath
 * this view and its document-level capture handler already maps Tab to
 * `onNext` (a second listener would double-fire). The visible hint below is a
 * real button wired to the same `onNext` for mouse users.
 */
/** Transient state for the share control (a shareable result card, §10.3). */
type ShareState = 'idle' | 'working' | 'copied' | 'downloaded' | 'error';

const SHARE_LABEL: Record<ShareState, string> = {
  idle: 'share result',
  working: 'rendering…',
  copied: 'image copied',
  downloaded: 'image saved',
  error: "couldn't share",
};

export function ResultView({ run, passage, onNext }: ResultViewProps): ReactElement {
  const { stats } = run;
  const [share, setShare] = useState<ShareState>('idle');
  const heatmap = useMemo(() => computeHeatmap(passage.text, run.log), [passage.text, run.log]);
  const buckets = useMemo(
    () => computePerSecondRawWpm(passage.text, run.log),
    [passage.text, run.log],
  );

  const onShare = (): void => {
    if (share === 'working') return;
    setShare('working');
    shareResultCard(run, passage)
      .then((outcome) => setShare(outcome))
      .catch(() => setShare('error'))
      .finally(() => {
        setTimeout(() => setShare('idle'), 2400);
      });
  };

  return (
    <section aria-label="Result" className="animate-fade-in">
      <p className="subtitle text-smoke">result</p>

      <div className="mt-8 flex flex-wrap items-baseline gap-x-10 gap-y-4">
        <p>
          <span className="text-[3.6rem] leading-none text-tungsten">{stats.wpm}</span>
          <span className="subtitle ml-3 text-smoke">wpm</span>
        </p>
        <p className="text-smoke">
          raw <span className="text-bone">{stats.rawWpm}</span> &middot; acc{' '}
          <span className="text-bone">{stats.accuracy}%</span> &middot; consistency{' '}
          <span className="text-bone">{stats.consistency}%</span>
        </p>
      </div>

      <div className="mt-10">
        <WpmSparkline buckets={buckets} durationMs={stats.durationMs} />
      </div>

      <div className="mt-10">
        <HeatmapPassage text={passage.text} heatmap={heatmap} />
        <div className="mt-6">
          <Epigraph passage={passage} />
        </div>
      </div>

      <div className="mt-12 flex flex-wrap gap-x-14 gap-y-6">
        <div>
          <p className="subtitle text-smoke">slowest words</p>
          <p className="mt-3">
            {heatmap.slowestWords.length === 0 ? (
              <span className="text-smoke">·</span>
            ) : (
              heatmap.slowestWords.map((slow, i) => (
                <span key={slow.wordIndex}>
                  {i > 0 ? <span className="text-smoke"> &middot; </span> : null}
                  <span className="text-bone">{slow.word}</span>
                  <span className="text-smoke"> {Math.round(slow.ms)}ms</span>
                </span>
              ))
            )}
          </p>
        </div>
        <div>
          <p className="subtitle text-smoke">punctuation tax</p>
          <p className="mt-3 text-bone">{formatTax(heatmap.punctuationTaxPct)}</p>
        </div>
      </div>

      <div className="mt-14 flex flex-wrap items-center gap-x-10 gap-y-4">
        <button
          type="button"
          onClick={onNext}
          className="subtitle text-smoke transition-opacity duration-150 hover:text-bone"
        >
          tab &middot; next passage
        </button>
        <button
          type="button"
          onClick={onShare}
          disabled={share === 'working'}
          className="subtitle text-smoke transition-opacity duration-150 hover:text-bone"
        >
          {SHARE_LABEL[share]}
        </button>
      </div>
    </section>
  );
}
