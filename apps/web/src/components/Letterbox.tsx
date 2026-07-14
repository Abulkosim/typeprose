import { useEffect, type ReactElement, type ReactNode } from 'react';
import { NavLink } from 'react-router';

import { CommandPalette } from '../command/CommandPalette';
import { useCommandStore } from '../command/commandStore';
import { useProfileStore } from '../lib/profileInfo';
import { useMusicStore } from '../settings/music';
import { useTypingStore } from '../stage/typingStore';

function BarLink({ to, label }: { to: string; label: string }): ReactElement {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `subtitle transition-opacity duration-150 ${
          isActive ? 'text-bone' : 'text-smoke hover:text-bone'
        }`
      }
    >
      {label}
    </NavLink>
  );
}

/** Caps Lock tag in the bottom bar (§9.3), fed by keydown/keyup getModifierState. */
function CapsLockTag(): ReactElement | null {
  const capsLock = useTypingStore((s) => s.capsLock);
  if (!capsLock) return null;
  return <span className="subtitle text-tungsten">caps lock</span>;
}

/**
 * Quiet music tag in the bottom bar: a lone ♪ when off (the whole discovery
 * affordance), ♪ plus the channel name while selected - dimmed until the
 * first gesture resumes a persisted channel. Clicking opens the palette
 * pre-filtered to the music commands; deliberately smoke, not tungsten
 * (tungsten in this bar means the caps-lock alarm; music is ambience).
 */
function MusicTag(): ReactElement {
  const channel = useMusicStore((s) => s.channel);
  const pending = useMusicStore((s) => s.pending);
  const label = channel === 'off' ? '♪' : `♪ ${channel === 'lofi' ? 'lo-fi' : channel}`;
  const dim = channel === 'off' || pending;
  return (
    <button
      type="button"
      onClick={() => useCommandStore.getState().open('music')}
      aria-label={`Music: ${channel === 'off' ? 'off' : channel} - open music commands`}
      className={`subtitle cursor-pointer transition-colors duration-150 hover:text-bone ${
        dim ? 'text-smoke/60' : 'text-smoke'
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Quiet "not saved" note in the bottom bar (§9.5): a failed result submission
 * surfaces here without blocking the next run. Only the failure state shows.
 */
function SaveStatusTag(): ReactElement | null {
  const saveStatus = useTypingStore((s) => s.saveStatus);
  if (saveStatus !== 'not-saved') return null;
  return <span className="subtitle col-start-1 justify-self-start text-smoke">not saved</span>;
}

/**
 * The signature letterbox (§9.4): thin cinematic bars top and bottom frame
 * every screen. Wordmark in the top bar; keybind hints styled like subtitles
 * in the bottom bar. The stage between the bars carries the film grain and
 * vignette overlays.
 */
export function Letterbox({ children }: { children: ReactNode }): ReactElement {
  const profileInfo = useProfileStore((s) => s.info);
  useEffect(() => {
    // One passive refresh per app mount - the claimed-state indicator below
    // reads whatever localStorage already holds, it never creates a profile.
    void useProfileStore.getState().refresh();
  }, []);
  const accountLabel =
    profileInfo?.claimed === true && profileInfo.displayName !== null
      ? profileInfo.displayName.toLowerCase()
      : 'account';

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-10 shrink-0 items-center justify-between bg-bar px-6">
        <NavLink to="/" className="subtitle text-bone">
          prosetype
        </NavLink>
        <nav className="flex items-center gap-6">
          <BarLink to="/stats" label="stats" />
          <BarLink to="/library" label="library" />
          <BarLink to="/leaderboard" label="leaderboard" />
          <BarLink to="/account" label={accountLabel} />
        </nav>
      </header>

      <main className="film-stage flex flex-1 flex-col bg-stage">
        <div className="animate-fade-in mx-auto flex w-full max-w-[68ch] flex-1 flex-col justify-center px-6 py-16">
          {children}
        </div>
      </main>

      <footer className="grid h-10 shrink-0 grid-cols-3 items-center bg-bar px-6">
        <SaveStatusTag />
        {/* Explicit columns: the save tag is usually null, and auto-placement
            would shift everything a column left. */}
        <p className="subtitle col-start-2 justify-self-center text-smoke">
          tab next &middot; esc commands
        </p>
        <div className="col-start-3 flex items-center gap-4 justify-self-end">
          <CapsLockTag />
          <MusicTag />
        </div>
      </footer>

      <CommandPalette />
    </div>
  );
}
