import { useEffect, useState, type ReactElement } from 'react';

import { useTypingStore } from './typingStore';

function formatClock(elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Live HUD (§9.3): wpm + elapsed, dim, hidden until the first keystroke.
 * Repaints on a 100ms interval - display only; the numbers come straight
 * from the engine and the interval is never used for stat math. Space is
 * reserved while hidden so the passage never shifts.
 */
export function Hud(): ReactElement {
  const status = useTypingStore((s) => s.snapshot?.status ?? 'idle');
  const startedAtMs = useTypingStore((s) => s.snapshot?.startedAtMs ?? null);
  const [display, setDisplay] = useState({ wpm: 0, elapsedMs: 0 });

  useEffect(() => {
    if (status !== 'running' || startedAtMs === null) return;
    const update = (): void => {
      const stats = useTypingStore.getState().getLiveStats();
      setDisplay({ wpm: stats?.wpm ?? 0, elapsedMs: performance.now() - startedAtMs });
    };
    update();
    const id = setInterval(update, 100);
    return () => {
      clearInterval(id);
    };
  }, [status, startedAtMs]);

  return (
    <p
      className={`subtitle mb-10 transition-opacity duration-150 ${
        status === 'idle' ? 'opacity-0' : ''
      }`}
      aria-hidden={status === 'idle'}
    >
      <span className="text-tungsten">{Math.round(display.wpm)} wpm</span>
      <span className="text-smoke"> &middot; {formatClock(display.elapsedMs)}</span>
    </p>
  );
}
