import type { ReactElement, ReactNode } from 'react';
import { NavLink } from 'react-router';

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

/**
 * The signature letterbox (§9.4): thin cinematic bars top and bottom frame
 * every screen. Wordmark in the top bar; keybind hints styled like subtitles
 * in the bottom bar. The stage between the bars carries the film grain and
 * vignette overlays.
 */
export function Letterbox({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-10 shrink-0 items-center justify-between bg-bar px-6">
        <NavLink to="/" className="subtitle text-bone">
          prosetype
        </NavLink>
        <nav className="flex items-center gap-6">
          <BarLink to="/stats" label="stats" />
          <BarLink to="/library" label="library" />
        </nav>
      </header>

      <main className="film-stage flex flex-1 flex-col bg-stage">
        <div className="animate-fade-in mx-auto flex w-full max-w-[68ch] flex-1 flex-col justify-center px-6 py-16">
          {children}
        </div>
      </main>

      <footer className="flex h-10 shrink-0 items-center justify-center bg-bar px-6">
        <p className="subtitle text-smoke">tab next &middot; esc restart</p>
      </footer>
    </div>
  );
}
