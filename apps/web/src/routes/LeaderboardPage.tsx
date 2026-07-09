import type { Leaderboard } from '@prosetype/schema';
import { useEffect, useState, type ReactElement } from 'react';
import { useSearchParams } from 'react-router';

import { fetchLeaderboard } from '../lib/api';
import { usePageMeta } from '../lib/head';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; board: Leaderboard };

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * `/leaderboard` (plan §10.3): each profile's best run, highest wpm first.
 * `?passageId=` scopes it to one passage (a fair, same-text board); otherwise
 * it is global. Unclaimed profiles show as "anonymous".
 */
export function LeaderboardPage(): ReactElement {
  usePageMeta({
    title: 'Leaderboard',
    description:
      'The fastest verified runs on prosetype, global, or scoped to a single passage for a fair same-text board.',
  });
  const [params] = useSearchParams();
  const passageParam = params.get('passageId');
  const passageId = passageParam !== null ? Number(passageParam) : undefined;
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const board = await fetchLeaderboard(
          passageId !== undefined && Number.isFinite(passageId) ? passageId : undefined,
        );
        if (!cancelled) setState({ status: 'ready', board });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [passageId]);

  if (state.status === 'loading') {
    return (
      <section aria-label="Leaderboard" className="animate-fade-in">
        <h1 className="subtitle text-smoke">leaderboard</h1>
        <p className="mt-6 text-smoke">developing the reel&hellip;</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section aria-label="Leaderboard" className="animate-fade-in">
        <h1 className="subtitle text-smoke">leaderboard</h1>
        <p className="mt-6 text-bone">The reel is jammed.</p>
        <p className="mt-2 text-smoke">Could not load the leaderboard. Try again in a moment.</p>
      </section>
    );
  }

  const { board } = state;

  return (
    <section aria-label="Leaderboard" className="animate-fade-in">
      <h1 className="subtitle text-smoke">
        leaderboard{board.passageId !== null ? ' · this passage' : ''}
      </h1>

      {board.entries.length === 0 ? (
        <>
          <p className="mt-6 text-bone">No runs on the reel yet.</p>
          <p className="mt-2 text-smoke">Finish a passage and it will appear here.</p>
        </>
      ) : (
        <table className="mt-8 w-full text-left">
          <thead>
            <tr className="subtitle text-smoke">
              <th className="font-medium">#</th>
              <th className="font-medium">who</th>
              <th className="font-medium">wpm</th>
              <th className="font-medium">acc</th>
              <th className="font-medium">passage</th>
              <th className="font-medium">when</th>
            </tr>
          </thead>
          <tbody>
            {board.entries.map((e) => (
              <tr key={`${String(e.rank)}-${e.createdAt}`} className="text-bone">
                <td className="py-1 text-smoke tabular-nums">{e.rank}</td>
                <td className="py-1">
                  {e.displayName ?? <span className="text-smoke italic">anonymous</span>}
                </td>
                <td className="py-1 tabular-nums">{e.wpm}</td>
                <td className="py-1 text-smoke tabular-nums">{e.accuracy}%</td>
                <td className="py-1 font-serif text-smoke italic">
                  {e.workTitle}, {e.authorName}
                </td>
                <td className="py-1 text-smoke tabular-nums">{formatWhen(e.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
