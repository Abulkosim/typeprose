import { computeHeatmap, computePerSecondRawWpm, type RunStats } from '@prosetype/engine';
import type { CharEvents } from '@prosetype/schema';
import { useEffect, useState, useMemo, type ReactElement } from 'react';
import { Link } from 'react-router';

import { Epigraph } from '../components/Epigraph';
import { shareResultCard } from '../lib/shareCard';
import { hasSeenResultHint, markSeenResultHint } from '../settings/onboarding';
import { useTypingStore, type ActiveTest, type BestInfo } from '../stage/typingStore';
import { HeatmapPassage } from './HeatmapPassage';
import { WpmSparkline } from './WpmSparkline';

/**
 * A finished run as handed from the typing stage to the result view
 * (plan §9.3 completion). Everything the full result view needs - heatmap,
 * sparkline, and later submission - derives from `log` via the pure engine
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
  /** The test that was typed (its text is the heatmap target; prose adds an epigraph). */
  test: ActiveTest;
  /** Abandon this result and load a new test. */
  onNext: () => void;
}

/** "punctuation tax +38%" - whole percent, explicit sign, em-dash when unsampled. */
function formatTax(pct: number | null): string {
  if (pct === null) return '-';
  const rounded = Math.round(pct);
  return `${rounded >= 0 ? '+' : ''}${String(rounded)}%`;
}

/**
 * A personal-best moment (a "new record" is the cheapest retention feature a
 * typing app has). `bestInfo` is null until the fire-and-forget submission
 * resolves, so this may render nothing at first and then pop in - read
 * reactively from the store rather than passed as a static prop.
 */
function BestTag({
  bestInfo,
  isPassage,
}: {
  bestInfo: BestInfo | null;
  isPassage: boolean;
}): ReactElement | null {
  if (bestInfo === null) return null;
  if (bestInfo.isNewBest) {
    return (
      <p className="subtitle animate-best-pop mt-3 text-tungsten">new personal best</p>
    );
  }
  if (isPassage && bestInfo.isNewPassageBest) {
    return (
      <p className="subtitle animate-best-pop mt-3 text-tungsten">new best on this passage</p>
    );
  }
  if (isPassage && bestInfo.previousPassageBestWpm !== null) {
    return (
      <p className="subtitle mt-3 text-smoke">
        your best on this passage{' '}
        <span className="text-bone">{bestInfo.previousPassageBestWpm} wpm</span>
      </p>
    );
  }
  return null;
}

/**
 * The daily-streak line (Batch C §2.1): non-null only when this run was
 * matched against today's daily server-side. Gets the same "just happened"
 * pop treatment as a new best when it actually advanced the streak.
 */
function DailyStreakTag({ bestInfo }: { bestInfo: BestInfo | null }): ReactElement | null {
  const dailyStreak = bestInfo?.dailyStreak ?? null;
  if (dailyStreak === null) return null;
  return (
    <p className={`subtitle mt-3 text-smoke ${dailyStreak.extended ? 'animate-best-pop' : ''}`}>
      daily streak &middot;{' '}
      <span className="text-bone">
        {dailyStreak.current} {dailyStreak.current === 1 ? 'day' : 'days'}
      </span>
    </p>
  );
}

/**
 * Result view (§9.3/§9.4): a title card. Big stats (wpm large; raw, accuracy,
 * consistency smaller), the hand-rolled wpm-over-time sparkline, the passage
 * re-rendered as the §7.6 hesitation heatmap under its attribution epigraph,
 * then the reader stats - three slowest words and the punctuation tax. All
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

export function ResultView({ run, test, onNext }: ResultViewProps): ReactElement {
  const { stats } = run;
  const text = test.kind === 'passage' ? test.passage.text : test.text;
  const [share, setShare] = useState<ShareState>('idle');
  const bestInfo = useTypingStore((s) => s.bestInfo);
  const heatmap = useMemo(() => computeHeatmap(text, run.log), [text, run.log]);
  const buckets = useMemo(() => computePerSecondRawWpm(text, run.log), [text, run.log]);

  // First-ever result: point at /stats once, then never again (§ onboarding).
  const [showResultHint] = useState(() => !hasSeenResultHint());
  useEffect(() => {
    markSeenResultHint();
  }, []);

  // Sharing is a branded attribution artifact, so it is offered for prose only.
  const passage = test.kind === 'passage' ? test.passage : null;
  const onShare = (): void => {
    if (share === 'working' || passage === null) return;
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

      <div className="relative mt-8 flex flex-wrap items-baseline gap-x-10 gap-y-4">
        {bestInfo?.isNewBest ? <div aria-hidden className="best-flash" /> : null}
        <p>
          <span
            className={`text-[3.6rem] leading-none text-tungsten ${
              bestInfo?.isNewBest ? 'animate-best-glow' : ''
            }`}
          >
            {stats.wpm}
          </span>
          <span className="subtitle ml-3 text-smoke">wpm</span>
        </p>
        <p className="text-smoke">
          raw <span className="text-bone">{stats.rawWpm}</span> &middot; acc{' '}
          <span className="text-bone">{stats.accuracy}%</span> &middot; consistency{' '}
          <span className="text-bone">{stats.consistency}%</span>
        </p>
      </div>

      <BestTag bestInfo={bestInfo} isPassage={passage !== null} />
      <DailyStreakTag bestInfo={bestInfo} />

      {showResultHint ? (
        <p className="subtitle mt-3 text-smoke">
          saved &middot; track your progress at{' '}
          <Link to="/stats" className="text-bone hover:underline">
            stats
          </Link>
        </p>
      ) : null}

      <div className="mt-10">
        <WpmSparkline buckets={buckets} durationMs={stats.durationMs} />
      </div>

      <div className="mt-10">
        <HeatmapPassage text={text} heatmap={heatmap} />
        <div className="mt-6">
          {test.kind === 'passage' ? (
            <Epigraph passage={test.passage} />
          ) : (
            <p className="subtitle text-smoke">words &middot; {test.count}</p>
          )}
        </div>
      </div>

      <div className="mt-12 flex flex-wrap gap-x-14 gap-y-6">
        <div>
          <p className="subtitle text-smoke">slowest words</p>
          <p className="mt-3">
            {heatmap.slowestWords.length === 0 ? (
              <span className="text-smoke">-</span>
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
        {passage !== null ? (
          <button
            type="button"
            onClick={onShare}
            disabled={share === 'working'}
            className="subtitle text-smoke transition-opacity duration-150 hover:text-bone"
          >
            {SHARE_LABEL[share]}
          </button>
        ) : null}
        {passage !== null ? (
          <button
            type="button"
            onClick={() => useTypingStore.getState().restart()}
            className="subtitle text-smoke transition-opacity duration-150 hover:text-bone"
          >
            retype this passage
          </button>
        ) : null}
        {passage !== null ? (
          <Link
            to={`/leaderboard?passageId=${String(passage.id)}`}
            className="subtitle text-smoke transition-opacity duration-150 hover:text-bone"
          >
            leaderboard for this passage
          </Link>
        ) : null}
      </div>
    </section>
  );
}
