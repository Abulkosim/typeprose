import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { THEME_STORAGE_KEY, useThemeStore } from '../src/settings/theme';

/** Minimal localStorage + documentElement.dataset stubs for the node test env. */
function installDom(): void {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const dataset: Record<string, string> = {};
  globalThis.localStorage = localStorage as unknown as Storage;
  globalThis.document = { documentElement: { dataset } } as unknown as Document;
}

beforeEach(() => {
  installDom();
  useThemeStore.setState({ theme: 'noir' });
});

afterEach(() => {
  // @ts-expect-error, tearing down the test-only globals.
  delete globalThis.localStorage;
  // @ts-expect-error, tearing down the test-only globals.
  delete globalThis.document;
});

describe('theme store', () => {
  it('toggles between noir and matinee, persisting and stamping the element', () => {
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe('matinee');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('matinee');
    expect(document.documentElement.dataset['theme']).toBe('matinee');

    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe('noir');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('noir');
    expect(document.documentElement.dataset['theme']).toBe('noir');
  });

  it('setTheme applies a specific theme', () => {
    useThemeStore.getState().setTheme('matinee');
    expect(document.documentElement.dataset['theme']).toBe('matinee');
  });
});
