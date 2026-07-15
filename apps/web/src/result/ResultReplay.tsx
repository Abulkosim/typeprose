import { createReplayEngine, type EngineSnapshot } from '@typeprose/engine';
import type { CharEvents } from '@typeprose/schema';
import { useEffect, useRef, useState, type ReactElement } from 'react';

import { PassageBoard } from '../stage/PassageBoard';

/** 1x or 2x playback speed for the watch-replay action (plan §3.2). */
type Speed = 1 | 2;

export interface ResultReplayProps {
  /** The passage/test text that was typed. */
  text: string;
  /** The §7.5 charEvents wire log to replay. */
  log: CharEvents;
  /** Leave the replay and go back to the static heatmap. */
  onExit: () => void;
}

/**
 * "Watch replay" (plan §3.2): re-renders the passage board driven by the
 * completed run's own charEvents timeline, at 1x or 2x speed. Purely
 * client-side - it owns a `ReplayEngine` (packages/engine) and a rAF loop
 * that advances a virtual clock; `PassageBoard` renders whatever snapshot
 * that clock currently produces, identically to how it renders the live
 * typing stage.
 *
 * The clock and the engine live in refs (mutated every frame); only the
 * derived snapshot, and the play/speed/finished flags a user can toggle,
 * live in state so re-renders happen once per applied event rather than
 * once per frame.
 */
export function ResultReplay({ text, log, onExit }: ResultReplayProps): ReactElement {
  const engineRef = useRef(createReplayEngine(text, log));
  const clockRef = useRef(0);
  const lastFrameRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const speedRef = useRef<Speed>(1);
  const playingRef = useRef(true);

  const [snapshot, setSnapshot] = useState<EngineSnapshot>(() => engineRef.current.getSnapshot());
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const [finished, setFinished] = useState(false);

  const stopLoop = (): void => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastFrameRef.current = null;
  };

  const tick = (now: number): void => {
    const engine = engineRef.current;
    const last = lastFrameRef.current;
    lastFrameRef.current = now;
    if (last !== null) {
      clockRef.current += (now - last) * speedRef.current;
      const applied = engine.advanceTo(clockRef.current);
      if (applied) setSnapshot(engine.getSnapshot());
    }
    if (engine.done) {
      stopLoop();
      setFinished(true);
      setPlaying(false);
      playingRef.current = false;
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const startLoop = (): void => {
    if (rafRef.current !== null) return;
    lastFrameRef.current = null;
    rafRef.current = requestAnimationFrame(tick);
  };

  // Autoplay on mount; clean up the rAF on unmount.
  useEffect(() => {
    startLoop();
    return stopLoop;
  }, []);

  const togglePlaying = (): void => {
    const next = !playingRef.current;
    playingRef.current = next;
    setPlaying(next);
    if (next) startLoop();
    else stopLoop();
  };

  const toggleSpeed = (): void => {
    const next: Speed = speedRef.current === 1 ? 2 : 1;
    speedRef.current = next;
    setSpeed(next);
  };

  const watchAgain = (): void => {
    engineRef.current.restart();
    clockRef.current = 0;
    setSnapshot(engineRef.current.getSnapshot());
    setFinished(false);
    playingRef.current = true;
    setPlaying(true);
    startLoop();
  };

  return (
    <div>
      <PassageBoard snapshot={snapshot} />
      <div className="mt-6 flex flex-wrap items-center gap-x-10 gap-y-4">
        {finished ? (
          <button
            type="button"
            onClick={watchAgain}
            className="subtitle text-smoke transition-opacity duration-150 hover:text-bone"
          >
            watch again
          </button>
        ) : (
          <button
            type="button"
            onClick={togglePlaying}
            className="subtitle text-smoke transition-opacity duration-150 hover:text-bone"
          >
            {playing ? 'pause' : 'resume'}
          </button>
        )}
        {finished ? null : (
          <button
            type="button"
            onClick={toggleSpeed}
            className="subtitle text-smoke transition-opacity duration-150 hover:text-bone"
          >
            {speed === 1 ? '2× speed' : '1× speed'}
          </button>
        )}
        <button
          type="button"
          onClick={onExit}
          className="subtitle text-smoke transition-opacity duration-150 hover:text-bone"
        >
          back to heatmap
        </button>
      </div>
    </div>
  );
}
