import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { playThock, SOUND_STORAGE_KEY, useSoundStore } from '../src/settings/sound';

function installStorage(): void {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage;
}

beforeEach(() => {
  installStorage();
  useSoundStore.setState({ enabled: false });
});

afterEach(() => {
  // @ts-expect-error, tearing down the test-only global.
  delete globalThis.localStorage;
});

describe('sound store', () => {
  it('toggles and persists the mute preference', () => {
    useSoundStore.getState().toggle();
    expect(useSoundStore.getState().enabled).toBe(true);
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe('on');
    useSoundStore.getState().toggle();
    expect(useSoundStore.getState().enabled).toBe(false);
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe('off');
  });
});

describe('playThock', () => {
  it('is a safe no-op when muted', () => {
    useSoundStore.setState({ enabled: false });
    expect(() => playThock('key')).not.toThrow();
  });

  it('does not throw where Web Audio is unavailable (node)', () => {
    useSoundStore.setState({ enabled: true });
    expect(typeof AudioContext).toBe('undefined'); // node test env
    expect(() => playThock('space')).not.toThrow();
  });
});
