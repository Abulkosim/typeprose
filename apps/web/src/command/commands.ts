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

  commands.push(
    {
      id: 'go-library',
      title: 'Browse library',
      keywords: ['authors', 'themes', 'books'],
      run: () => ctx.navigate('/library'),
    },
    {
      id: 'go-stats',
      title: 'View stats',
      keywords: ['history', 'results', 'progress'],
      run: () => ctx.navigate('/stats'),
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
