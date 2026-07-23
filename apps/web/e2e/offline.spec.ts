import { expect, test } from '@playwright/test';

/**
 * The offline loop (PWA batch), on the dev server with no service worker -
 * this guards the data layer: corpus sync → offline prose from localStorage →
 * completed run queued in the outbox → replayed when connectivity returns.
 * (The app-shell service worker is prod-build-only and verified manually via
 * `vite build && vite preview`; dev-mode service workers are a debugging
 * tarpit and deliberately never registered.)
 */
test('offline: prose loads from the synced corpus, the run queues, then syncs on reconnect', async ({
  page,
  context,
}) => {
  // Arm the corpus-sync waiter before load - initCorpusSync fires on app start.
  const synced = page.waitForResponse(
    (r) => r.url().includes('/api/v1/passages/sync') && r.ok(),
    { timeout: 15_000 },
  );
  // Warm-up band → shorter passages, and the filter sticks across Tab so the
  // offline pick below stays short too.
  await page.goto('/?band=warmup');
  const board = page.getByTestId('passage');
  await expect(board).toBeVisible();
  const firstText = ((await board.textContent()) ?? '').trim();
  await synced;

  await context.setOffline(true);

  // The quiet footer tag names the state (smoke text, not color-alone).
  await expect(page.getByText('offline', { exact: true })).toBeVisible();

  // Tab abandons the run; with the network gone the next passage must come
  // from the synced corpus (a different one - recent ids are excluded).
  await page.keyboard.press('Tab');
  await expect(async () => {
    const text = ((await board.textContent()) ?? '').trim();
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toBe(firstText);
  }).toPass({ timeout: 10_000 });
  const text = ((await board.textContent()) ?? '').trim();

  // Type it out fully offline. Same cadence rationale as the smoke: ~40ms/char
  // keeps the run inside the server's acceptance window once it replays.
  await page.locator('section[aria-label="Typing stage"]').click();
  await page.keyboard.type(text, { delay: 40 });

  // The result appears and the run is queued, not dropped.
  await expect(page.locator('section[aria-label="Result"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('will sync')).toBeVisible({ timeout: 15_000 });

  // Reconnect: the 'online' listener flushes the outbox (creating the profile
  // first - the whole run happened before one existed). Arm the waiter first.
  const submitted = page.waitForResponse(
    (r) => r.url().includes('/api/v1/results') && r.request().method() === 'POST',
    { timeout: 30_000 },
  );
  await context.setOffline(false);
  const response = await submitted;
  expect(response.ok()).toBeTruthy();

  // And the offline tag stands down.
  await expect(page.getByText('offline', { exact: true })).toHaveCount(0);
});
