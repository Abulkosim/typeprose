import { WORD_COUNTS, type WordCount } from '../lib/words';
import type { Mode } from '../settings/mode';
import type { MusicChannel } from '../settings/music';

/**
 * The command set for the Esc palette (Phase 3, plan §10.3). Pure and
 * DOM-free so it can be unit-tested without a renderer: the component supplies
 * a context of side-effecting callbacks and renders whatever this returns.
 */
export interface Command {
  id: string;
  title: string;
  /** Small right-aligned affordance (a keybind or the kind of command). */
  hint?: string;
  /** Extra match terms beyond the title, for the search filter. */
  keywords?: readonly string[];
  run: () => void;
}

export interface CommandContext {
  /** True on the test route (`/`), where the run-specific commands apply. */
  onStage: boolean;
  navigate: (to: string) => void;
  /** Esc's former direct action, now a command: restart the same passage. */
  restart: () => void;
  /** Tab's action, also offered here: abandon and load a new passage. */
  next: () => void;
  /** Active theme, so the toggle command can name its destination. */
  theme: 'noir' | 'matinee';
  toggleTheme: () => void;
  /** Whether keystroke sound is on, so its command can name the action. */
  soundEnabled: boolean;
  toggleSound: () => void;
  /** Active test mode, so the mode commands can name their destination. */
  mode: Mode;
  /** Switch to word mode at the given length and start a fresh word set. */
  startWords: (count: WordCount) => void;
  /** Switch to prose mode and start a fresh random passage. */
  startProse: () => void;
  /** Active music channel, so its commands can omit the current one. */
  musicChannel: MusicChannel;
  setMusicChannel: (channel: MusicChannel) => void;
  /** Music volume in [0.1, 1], surfaced as the volume commands' hint. */
  musicVolume: number;
  adjustMusicVolume: (delta: number) => void;
}

/** The four difficulty bands (§6.4); picking one starts a filtered test. */
const BANDS = [
  ['warmup', 'Warm up'],
  ['standard', 'Standard'],
  ['hard', 'Hard'],
  ['brutal', 'Brutal'],
] as const;

/**
 * Build the visible command list for the current context. Run-specific
 * commands (restart/next) only appear on the stage; a "Type" command replaces
 * them elsewhere. Band picks navigate to `/?band=…`, reusing the same query
 * mechanism a library pick uses, so there is one filtered-load path.
 */
export function buildCommands(ctx: CommandContext): Command[] {
  const commands: Command[] = [];

  if (ctx.onStage) {
    commands.push(
      { id: 'restart', title: 'Restart passage', keywords: ['again', 'reset'], run: ctx.restart },
      { id: 'next', title: 'Next passage', hint: 'tab', keywords: ['skip', 'new'], run: ctx.next },
    );
  } else {
    commands.push({
      id: 'go-test',
      title: 'Type',
      keywords: ['test', 'home', 'stage'],
      run: () => ctx.navigate('/'),
    });
  }

  // Mode toggle: word mode is a departure from the default prose. Offer the
  // opposite mode plus the word-length presets (each also switches to words).
  if (ctx.mode === 'words') {
    commands.push({
      id: 'mode-prose',
      title: 'Type prose',
      hint: 'mode',
      keywords: ['prose', 'passage', 'literary', 'quote', 'corpus'],
      run: ctx.startProse,
    });
  } else {
    commands.push({
      id: 'mode-words',
      title: 'Type words',
      hint: 'mode',
      keywords: ['words', 'word list', 'monkeytype', 'random', 'practice'],
      run: () => ctx.startWords(200),
    });
  }
  for (const count of WORD_COUNTS) {
    commands.push({
      id: `words-${String(count)}`,
      title: `Words · ${String(count)}`,
      hint: 'words',
      keywords: ['words', 'word list', 'length', String(count)],
      run: () => ctx.startWords(count),
    });
  }

  commands.push(
    {
      id: 'daily',
      title: 'Daily passage',
      hint: 'daily',
      keywords: ['today', 'passage of the day', 'daily'],
      run: () => ctx.navigate('/?daily'),
    },
    {
      id: 'go-library',
      title: 'Browse library',
      keywords: ['authors', 'themes', 'books'],
      run: () => ctx.navigate('/library'),
    },
    {
      id: 'go-stats',
      title: 'View stats',
      keywords: ['history', 'results', 'progress', 'keys', 'bigram', 'errors', 'charts'],
      run: () => ctx.navigate('/stats'),
    },
    {
      id: 'go-leaderboard',
      title: 'Leaderboard',
      keywords: ['ranking', 'top', 'best', 'fastest'],
      run: () => ctx.navigate('/leaderboard'),
    },
    {
      id: 'go-claim',
      title: 'Claim account (email)',
      keywords: ['account', 'email', 'sign in', 'magic link', 'name', 'save'],
      run: () => ctx.navigate('/claim'),
    },
  );

  for (const [band, label] of BANDS) {
    commands.push({
      id: `band-${band}`,
      title: label,
      hint: 'band',
      keywords: ['difficulty', 'band', band],
      run: () => ctx.navigate(`/?band=${band}`),
    });
  }

  commands.push({
    id: 'theme',
    title: ctx.theme === 'noir' ? 'Switch to matinee (light)' : 'Switch to noir (dark)',
    hint: 'theme',
    keywords: ['theme', 'appearance', 'light', 'dark', 'matinee', 'noir'],
    run: ctx.toggleTheme,
  });

  commands.push({
    id: 'sound',
    title: ctx.soundEnabled ? 'Mute keystroke sound' : 'Enable keystroke sound',
    hint: 'sound',
    keywords: ['sound', 'audio', 'thock', 'typewriter', 'mute', 'click'],
    run: ctx.toggleSound,
  });

  // Music: offer every channel except the active one (same logic as the theme
  // command naming only its destination), plus stop/volume while playing.
  const musicChannels: readonly [Exclude<MusicChannel, 'off'>, string, readonly string[]][] = [
    ['lofi', 'Music · lo-fi', ['music', 'background', 'focus', 'lofi', 'chill', 'beats']],
    ['classical', 'Music · classical', ['music', 'background', 'focus', 'classical', 'piano']],
    ['ambient', 'Music · ambient', ['music', 'background', 'focus', 'ambient', 'noise', 'rain']],
  ];
  for (const [channel, title, keywords] of musicChannels) {
    if (channel === ctx.musicChannel) continue;
    commands.push({
      id: `music-${channel}`,
      title,
      hint: 'music',
      keywords,
      run: () => ctx.setMusicChannel(channel),
    });
  }
  if (ctx.musicChannel !== 'off') {
    const volumeHint = `${String(Math.round(ctx.musicVolume * 100))}%`;
    commands.push(
      {
        id: 'music-off',
        title: 'Music · off',
        hint: 'music',
        keywords: ['music', 'stop', 'mute', 'quiet', 'silence'],
        run: () => ctx.setMusicChannel('off'),
      },
      {
        id: 'music-quieter',
        title: 'Music quieter',
        hint: volumeHint,
        keywords: ['volume', 'music', 'quieter', 'softer', 'down'],
        run: () => ctx.adjustMusicVolume(-0.1),
      },
      {
        id: 'music-louder',
        title: 'Music louder',
        hint: volumeHint,
        keywords: ['volume', 'music', 'louder', 'up'],
        run: () => ctx.adjustMusicVolume(0.1),
      },
    );
  }

  return commands;
}

/**
 * Case-insensitive substring match over title and keywords (boring choice over
 * a fuzzy matcher — the command set is small and stable). Empty query = all.
 */
export function filterCommands(commands: readonly Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...commands];
  return commands.filter(
    (c) =>
      c.title.toLowerCase().includes(q) ||
      (c.keywords ?? []).some((k) => k.toLowerCase().includes(q)),
  );
}
