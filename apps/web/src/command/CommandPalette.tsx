import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useModeStore } from '../settings/mode';
import { useMusicStore } from '../settings/music';
import { useSoundStore } from '../settings/sound';
import { useThemeStore } from '../settings/theme';
import { useTypingStore } from '../stage/typingStore';
import { buildCommands, filterCommands } from './commands';
import { useCommandStore } from './commandStore';

/**
 * The Esc command palette (Phase 3, plan §10.3). A global overlay: Esc toggles
 * it from any route; it searches over the current context's commands (§9.1
 * navigation, the band filters, and — on the stage — restart/next). Motion is
 * a film-cut fade (§9.4). The stage's document key handler bails while this is
 * open, so keystrokes reach the search box instead of the hidden textarea.
 */
export function CommandPalette(): ReactElement | null {
  const isOpen = useCommandStore((s) => s.isOpen);
  const close = useCommandStore((s) => s.close);
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useThemeStore((s) => s.theme);
  const soundEnabled = useSoundStore((s) => s.enabled);
  const mode = useModeStore((s) => s.mode);
  const musicChannel = useMusicStore((s) => s.channel);
  const musicVolume = useMusicStore((s) => s.volume);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);

  // Esc toggles from anywhere. Capture phase so it wins the race with the
  // stage's own document handler (which bails while the palette is open).
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      useCommandStore.getState().toggle();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  // Reset the query/selection and focus the search box on each open. The
  // query is seeded from the opener (e.g. the footer music tag); Esc's toggle
  // path leaves it empty.
  useEffect(() => {
    if (isOpen) {
      setQuery(useCommandStore.getState().initialQuery);
      setSelected(0);
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const commands = useMemo(
    () =>
      buildCommands({
        onStage: location.pathname === '/',
        navigate,
        restart: () => useTypingStore.getState().restart(),
        next: () => void useTypingStore.getState().loadNext(),
        theme,
        toggleTheme: () => useThemeStore.getState().toggle(),
        soundEnabled,
        toggleSound: () => useSoundStore.getState().toggle(),
        mode,
        startWords: (count) => {
          const m = useModeStore.getState();
          m.setMode('words');
          m.setWordCount(count);
          // Load directly (a returning stage keeps its in-progress test, so a
          // bare navigation wouldn't reload); navigate first if off-stage.
          if (location.pathname !== '/') navigate('/');
          void useTypingStore.getState().loadNext();
        },
        startProse: () => {
          useModeStore.getState().setMode('prose');
          if (location.pathname !== '/') navigate('/');
          void useTypingStore.getState().loadNext({});
        },
        musicChannel,
        setMusicChannel: (channel) => useMusicStore.getState().setChannel(channel),
        musicVolume,
        adjustMusicVolume: (delta) => useMusicStore.getState().adjustVolume(delta),
      }),
    [location.pathname, navigate, theme, soundEnabled, mode, musicChannel, musicVolume],
  );
  const results = useMemo(() => filterCommands(commands, query), [commands, query]);

  if (!isOpen) return null;

  const active = results.length === 0 ? 0 : Math.min(selected, results.length - 1);

  const run = (index: number): void => {
    const command = results[index];
    if (command === undefined) return;
    close();
    command.run();
  };

  const move = (delta: number): void => {
    if (results.length === 0) return;
    setSelected((i) => (Math.min(i, results.length - 1) + delta + results.length) % results.length);
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(active);
    }
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center bg-black/75 px-6 pt-[18vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-full max-w-[48ch] bg-stage">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={onInputKeyDown}
          className="w-full bg-transparent px-4 py-3 text-bone placeholder:text-smoke"
          placeholder="type a command…"
          aria-label="Search commands"
          autoComplete="off"
          spellCheck={false}
        />
        <ul className="max-h-[40vh] overflow-y-auto pb-2">
          {results.length === 0 ? (
            <li className="subtitle px-4 py-3 text-smoke">no commands</li>
          ) : (
            results.map((command, index) => (
              <li key={command.id}>
                <button
                  type="button"
                  onMouseMove={() => setSelected(index)}
                  onClick={() => run(index)}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left transition-colors duration-150 ${
                    index === active ? 'bg-tungsten/15 text-bone' : 'text-smoke hover:text-bone'
                  }`}
                >
                  <span className="text-sm">{command.title}</span>
                  {command.hint !== undefined ? (
                    <span className="subtitle text-smoke">{command.hint}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
