import type { BigramStat, KeyStat, ProfileStats, ResultMode } from '@prosetype/schema';
import { useEffect, useState, type ReactElement } from 'react';

import { fetchProfileStats } from '../lib/api';
import { ProgressChart } from '../result/ProgressChart';
import { usePageMeta } from '../lib/head';
import { ensureProfileId } from '../lib/profile';

/** How many problem keys / bigrams to list. */
const PROBLEM_LIMIT = 8;

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; stats: ProfileStats };

/** ms → compact "1h 2m" / "3m 20s" / "45s". */
function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${String(h)}h ${String(m)}m`;
  if (m > 0) return `${String(m)}m ${String(s)}s`;
  return `${String(s)}s`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTax(pct: number | null): string {
  if (pct === null) return '-';
  const rounded = Math.round(pct);
  return `${rounded >= 0 ? '+' : ''}${String(rounded)}%`;
}

function Metric({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <p className="subtitle text-smoke">{label}</p>
      <p className="mt-2 text-bone">{value}</p>
    </div>
  );
}

/**
 * A run's attribution: the serif work/author epigraph for prose, or a plain
 * "words · N" tag for a word-mode run (which has no author/work).
 */
function Attribution({
  item,
}: {
  item: { mode: ResultMode; wordCount: number | null; workTitle: string | null; authorName: string | null };
}): ReactElement {
  if (item.mode === 'words') {
    return (
      <span className="subtitle text-smoke">
        words &middot; {item.wordCount ?? '-'}
      </span>
    );
  }
  return (
    <span className="font-serif text-smoke italic">
      {item.workTitle}, {item.authorName}
    </span>
  );
}

function formatLatency(ms: number | null): string {
  return ms === null ? '-' : `${String(ms)} ms`;
}

/** A ranked "problem keys" / "problem bigrams" table, worst first. */
function ProblemTable({
  caption,
  unit,
  rows,
}: {
  caption: string;
  unit: string;
  rows: readonly (KeyStat | BigramStat)[];
}): ReactElement | null {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="subtitle text-smoke">{caption}</h3>
      <table className="mt-4 w-full text-left tabular-nums">
        <thead>
          <tr className="subtitle text-smoke">
            <th className="font-medium">{unit}</th>
            <th className="font-medium">err</th>
            <th className="font-medium">avg</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, PROBLEM_LIMIT).map((r) => {
            const label = 'key' in r ? r.key : r.bigram;
            return (
              <tr key={label} className="text-bone">
                <td className="py-1 font-mono">{label === ' ' ? '␣' : label}</td>
                <td className={`py-1 ${r.errorRate > 0 ? 'text-blood' : 'text-smoke'}`}>
                  {r.errorRate}%
                </td>
                <td className="py-1 text-smoke">{formatLatency(r.avgLatencyMs)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** `/stats` (§9.1, §8): a title card - history, aggregates, per-author table. */
export function StatsPage(): ReactElement {
  usePageMeta({
    title: 'Your stats',
    description: 'Your prosetype typing history, per-author aggregates, and personal bests.',
    noindex: true,
  });
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const profileId = await ensureProfileId();
        const stats = await fetchProfileStats(profileId);
        if (!cancelled) setState({ status: 'ready', stats });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <section aria-label="Stats" className="animate-fade-in">
        <h1 className="subtitle text-smoke">stats</h1>
        <p className="mt-6 text-smoke">developing the reel&hellip;</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section aria-label="Stats" className="animate-fade-in">
        <h1 className="subtitle text-smoke">stats</h1>
        <p className="mt-6 text-bone">The reel is jammed.</p>
        <p className="mt-2 text-smoke">Could not load your stats. Try again in a moment.</p>
      </section>
    );
  }

  const { stats } = state;

  if (stats.totals.tests === 0) {
    return (
      <section aria-label="Stats" className="animate-fade-in">
        <h1 className="subtitle text-smoke">stats</h1>
        <p className="mt-6 text-bone">Nothing on the reel yet.</p>
        <p className="mt-2 text-smoke">Finish a passage and your history will appear here.</p>
      </section>
    );
  }

  return (
    <section aria-label="Stats" className="animate-fade-in">
      <h1 className="subtitle text-smoke">stats</h1>

      <div className="mt-8 flex flex-wrap items-baseline gap-x-10 gap-y-4">
        <p>
          <span className="text-[3.6rem] leading-none text-tungsten">
            {stats.bestWpm?.wpm ?? '-'}
          </span>
          <span className="subtitle ml-3 text-smoke">best wpm</span>
        </p>
        {stats.bestWpm !== null ? <Attribution item={stats.bestWpm} /> : null}
      </div>

      <div className="mt-10 grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-3">
        <Metric label="tests" value={String(stats.totals.tests)} />
        <Metric label="time typed" value={formatDuration(stats.totals.timeTypedMs)} />
        <Metric
          label="avg wpm (last 10)"
          value={stats.avgWpmLast10 === null ? '-' : String(stats.avgWpmLast10)}
        />
        <Metric
          label="avg accuracy"
          value={stats.avgAccuracy === null ? '-' : `${String(stats.avgAccuracy)}%`}
        />
        <Metric
          label="avg consistency"
          value={stats.avgConsistency === null ? '-' : `${String(stats.avgConsistency)}%`}
        />
        <Metric label="punctuation tax" value={formatTax(stats.punctuationTaxAvgPct)} />
      </div>

      {stats.history.length >= 2 ? (
        <div className="mt-12">
          <h2 className="subtitle text-smoke">progress</h2>
          <div className="mt-4">
            <ProgressChart history={stats.history} />
          </div>
        </div>
      ) : null}

      {stats.keyStats.length > 0 || stats.bigramStats.length > 0 ? (
        <div className="mt-12">
          <h2 className="subtitle text-smoke">problem keys</h2>
          <p className="mt-2 text-smoke">
            Where your fingers stumble, across your recent runs.
          </p>
          <div className="mt-6 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            <ProblemTable caption="keys" unit="key" rows={stats.keyStats} />
            <ProblemTable caption="bigrams" unit="pair" rows={stats.bigramStats} />
          </div>
        </div>
      ) : null}

      {stats.perAuthor.length > 0 ? (
        <div className="mt-12">
          <h2 className="subtitle text-smoke">by author</h2>
          <table className="mt-4 w-full text-left">
            <thead>
              <tr className="subtitle text-smoke">
                <th className="font-medium">author</th>
                <th className="font-medium">tests</th>
                <th className="font-medium">avg wpm</th>
              </tr>
            </thead>
            <tbody>
              {stats.perAuthor.map((a) => (
                <tr key={a.authorSlug} className="text-bone">
                  <td className="py-1">{a.authorName}</td>
                  <td className="py-1 text-smoke">{a.tests}</td>
                  <td className="py-1">{a.avgWpm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-12">
        <h2 className="subtitle text-smoke">history</h2>
        <ul className="mt-4 space-y-2">
          {stats.history.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-4 text-bone">
              <span className="text-smoke tabular-nums">{formatWhen(r.createdAt)}</span>
              <span className="tabular-nums">{r.wpm} wpm</span>
              <span className="text-smoke tabular-nums">{r.accuracy}%</span>
              <Attribution item={r} />
              {!r.clientMatch ? <span className="subtitle text-smoke">flagged</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
