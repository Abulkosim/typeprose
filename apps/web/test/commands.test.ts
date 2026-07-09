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

  it('always offers library, stats, and the four difficulty bands', () => {
    const ids = buildCommands(makeContext({ onStage: false })).map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'go-library',
        'go-stats',
        'band-warmup',
        'band-standard',
        'band-hard',
        'band-brutal',
      ]),
    );
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
