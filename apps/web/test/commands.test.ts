import { describe, expect, it, vi } from 'vitest';

import { buildCommands, filterCommands, type CommandContext } from '../src/command/commands';

function makeContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    onStage: true,
    navigate: vi.fn(),
    restart: vi.fn(),
    next: vi.fn(),
    theme: 'noir',
    toggleTheme: vi.fn(),
    soundEnabled: false,
    toggleSound: vi.fn(),
    mode: 'prose',
    startWords: vi.fn(),
    startProse: vi.fn(),
    timedSeconds: 60,
    startTimed: vi.fn(),
    wordPunctuation: false,
    toggleWordPunctuation: vi.fn(),
    wordNumbers: false,
    toggleWordNumbers: vi.fn(),
    rollCredits: vi.fn(),
    musicChannel: 'off',
    setMusicChannel: vi.fn(),
    musicVolume: 0.5,
    adjustMusicVolume: vi.fn(),
    ...overrides,
  };
}

describe('buildCommands', () => {
  it('offers restart and next on the stage, not a "Type" command', () => {
    const ids = buildCommands(makeContext({ onStage: true })).map((c) => c.id);
    expect(ids).toContain('restart');
    expect(ids).toContain('next');
    expect(ids).not.toContain('go-test');
  });

  it('offers a "Type" command off the stage, not restart/next', () => {
    const ids = buildCommands(makeContext({ onStage: false })).map((c) => c.id);
    expect(ids).toContain('go-test');
    expect(ids).not.toContain('restart');
    expect(ids).not.toContain('next');
  });

  it('always offers daily, drill, library, stats, and the four difficulty bands', () => {
    const ids = buildCommands(makeContext({ onStage: false })).map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'daily',
        'drill',
        'go-library',
        'go-stats',
        'go-leaderboard',
        'go-account',
        'credits',
        'words-punctuation',
        'words-numbers',
        'band-warmup',
        'band-standard',
        'band-hard',
        'band-brutal',
      ]),
    );
  });

  it('routes the daily command to /?daily', () => {
    const ctx = makeContext();
    buildCommands(ctx)
      .find((c) => c.id === 'daily')
      ?.run();
    expect(ctx.navigate).toHaveBeenCalledWith('/?daily');
  });

  it('routes the drill command to /?drill', () => {
    const ctx = makeContext();
    buildCommands(ctx)
      .find((c) => c.id === 'drill')
      ?.run();
    expect(ctx.navigate).toHaveBeenCalledWith('/?drill');
  });

  it('names the theme command after its destination and wires the toggle', () => {
    const ctx = makeContext({ theme: 'noir' });
    const noir = buildCommands(ctx).find((c) => c.id === 'theme');
    expect(noir?.title).toBe('Switch to matinee (light)');
    noir?.run();
    expect(ctx.toggleTheme).toHaveBeenCalledOnce();
    const matinee = buildCommands(makeContext({ theme: 'matinee' })).find((c) => c.id === 'theme');
    expect(matinee?.title).toBe('Switch to noir (dark)');
  });

  it('names the sound command after the action it performs', () => {
    expect(
      buildCommands(makeContext({ soundEnabled: false })).find((c) => c.id === 'sound')?.title,
    ).toBe('Enable keystroke sound');
    expect(
      buildCommands(makeContext({ soundEnabled: true })).find((c) => c.id === 'sound')?.title,
    ).toBe('Mute keystroke sound');
  });

  it('offers "Type words"/"Type timed" + presets in prose mode, and switches on run', () => {
    const ctx = makeContext({ mode: 'prose' });
    const commands = buildCommands(ctx);
    const ids = commands.map((c) => c.id);
    expect(ids).toContain('mode-words');
    expect(ids).toContain('mode-timed');
    expect(ids).not.toContain('mode-prose');
    expect(ids).toEqual(expect.arrayContaining(['words-25', 'words-50', 'words-100', 'words-200']));
    expect(ids).toEqual(expect.arrayContaining(['timed-15', 'timed-30', 'timed-60', 'timed-120']));
    commands.find((c) => c.id === 'mode-words')?.run();
    expect(ctx.startWords).toHaveBeenCalledWith(200);
    commands.find((c) => c.id === 'words-50')?.run();
    expect(ctx.startWords).toHaveBeenCalledWith(50);
  });

  it('offers "Type prose" in word mode and wires startProse', () => {
    const ctx = makeContext({ mode: 'words' });
    const commands = buildCommands(ctx);
    expect(commands.map((c) => c.id)).toContain('mode-prose');
    expect(commands.map((c) => c.id)).not.toContain('mode-words');
    commands.find((c) => c.id === 'mode-prose')?.run();
    expect(ctx.startProse).toHaveBeenCalledOnce();
  });

  it('offers "Type timed" (reusing the persisted window) and per-window presets', () => {
    const ctx = makeContext({ mode: 'prose', timedSeconds: 30 });
    const commands = buildCommands(ctx);
    expect(commands.find((c) => c.id === 'timed-60')?.title).toBe('Time · 60s');
    commands.find((c) => c.id === 'mode-timed')?.run();
    expect(ctx.startTimed).toHaveBeenCalledWith(30); // the persisted window
    commands.find((c) => c.id === 'timed-15')?.run();
    expect(ctx.startTimed).toHaveBeenCalledWith(15);
  });

  it('does not offer "Type timed" while already in timed mode', () => {
    const ids = buildCommands(makeContext({ mode: 'timed' })).map((c) => c.id);
    expect(ids).not.toContain('mode-timed');
    expect(ids).toContain('mode-prose');
    expect(ids).toContain('mode-words');
  });

  it('names the punctuation toggle after the action it performs and wires it', () => {
    const ctx = makeContext({ wordPunctuation: false });
    const off = buildCommands(ctx).find((c) => c.id === 'words-punctuation');
    expect(off?.title).toBe('Words · punctuation on');
    off?.run();
    expect(ctx.toggleWordPunctuation).toHaveBeenCalledOnce();
    const on = buildCommands(makeContext({ wordPunctuation: true })).find(
      (c) => c.id === 'words-punctuation',
    );
    expect(on?.title).toBe('Words · punctuation off');
  });

  it('names the numbers toggle after the action it performs and wires it', () => {
    const ctx = makeContext({ wordNumbers: false });
    const off = buildCommands(ctx).find((c) => c.id === 'words-numbers');
    expect(off?.title).toBe('Words · numbers on');
    off?.run();
    expect(ctx.toggleWordNumbers).toHaveBeenCalledOnce();
    const on = buildCommands(makeContext({ wordNumbers: true })).find(
      (c) => c.id === 'words-numbers',
    );
    expect(on?.title).toBe('Words · numbers off');
  });

  it('offers every music channel but no stop/volume while off', () => {
    const ids = buildCommands(makeContext({ musicChannel: 'off' })).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['music-lofi', 'music-classical', 'music-ambient']));
    expect(ids).not.toContain('music-off');
    expect(ids).not.toContain('music-quieter');
    expect(ids).not.toContain('music-louder');
  });

  it('omits the active music channel and offers off/volume while playing', () => {
    const ctx = makeContext({ musicChannel: 'lofi', musicVolume: 0.5 });
    const commands = buildCommands(ctx);
    const ids = commands.map((c) => c.id);
    expect(ids).not.toContain('music-lofi');
    expect(ids).toEqual(
      expect.arrayContaining([
        'music-classical',
        'music-ambient',
        'music-off',
        'music-quieter',
        'music-louder',
      ]),
    );
    expect(commands.find((c) => c.id === 'music-louder')?.hint).toBe('50%');
    commands.find((c) => c.id === 'music-classical')?.run();
    expect(ctx.setMusicChannel).toHaveBeenCalledWith('classical');
    commands.find((c) => c.id === 'music-off')?.run();
    expect(ctx.setMusicChannel).toHaveBeenCalledWith('off');
    commands.find((c) => c.id === 'music-quieter')?.run();
    expect(ctx.adjustMusicVolume).toHaveBeenCalledWith(-0.1);
  });

  it('wires run() to the context callbacks', () => {
    const ctx = makeContext();
    const commands = buildCommands(ctx);
    commands.find((c) => c.id === 'restart')?.run();
    commands.find((c) => c.id === 'next')?.run();
    commands.find((c) => c.id === 'band-hard')?.run();
    commands.find((c) => c.id === 'go-library')?.run();
    expect(ctx.restart).toHaveBeenCalledOnce();
    expect(ctx.next).toHaveBeenCalledOnce();
    expect(ctx.navigate).toHaveBeenCalledWith('/?band=hard');
    expect(ctx.navigate).toHaveBeenCalledWith('/library');
  });
});

describe('filterCommands', () => {
  const commands = buildCommands(makeContext({ onStage: true }));

  it('returns every command for an empty or whitespace query', () => {
    expect(filterCommands(commands, '')).toHaveLength(commands.length);
    expect(filterCommands(commands, '   ')).toHaveLength(commands.length);
  });

  it('matches on the title, case-insensitively', () => {
    const ids = filterCommands(commands, 'RESTART').map((c) => c.id);
    expect(ids).toEqual(['restart']);
  });

  it('matches on keywords too', () => {
    // 'skip' is a keyword of the next-passage command, not in its title.
    expect(filterCommands(commands, 'skip').map((c) => c.id)).toEqual(['next']);
  });

  it('returns nothing when neither title nor keywords match', () => {
    expect(filterCommands(commands, 'zzzz')).toEqual([]);
  });
});
