import { expect, test } from '@playwright/test';

/**
 * The single Phase 2 smoke (plan §11): load → type a seeded passage via real
 * keyboard events → result appears → reload → the run shows up in stats. It
 * guards the input wiring and the persistence loop end-to-end; it deliberately
 * does not re-test the engine's numbers (that is the engine's own suite).
 *
 * Typing cadence: ~60ms/char keeps wpm around 200 regardless of passage length
 * (duration scales with length), comfortably inside the server's 3s-minimum /
 * 350-wpm-max acceptance window so the result persists.
 */
test('type a passage, see the result, and find it in stats', async ({ page }) => {
  // Warm-up band → a shorter passage to type.
  await page.goto('/?band=warmup');

  const board = page.getByTestId('passage');
  await expect(board).toBeVisible();
  const text = ((await board.textContent()) ?? '').trim();
  expect(text.length).toBeGreaterThan(0);

  // Arm the submission waiter before typing finishes so we don't miss it. Its
  // timeout must outlast the full type-out (each keystroke re-renders the
  // board), so it is generous; the test timeout is larger still.
  const submitted = page.waitForResponse(
    (r) => r.url().includes('/api/v1/results') && r.request().method() === 'POST',
    { timeout: 75_000 },
  );

  // Focus the hidden textarea (clicking the stage focuses it) and type. 40ms
  // between keys keeps wpm well under the server's 350 ceiling even on a fast
  // machine, while the run stays comfortably longer than the 3s minimum.
  await page.locator('section[aria-label="Typing stage"]').click();
  await page.keyboard.type(text, { delay: 40 });

  // The result view replaces the stage in place after the completion hold.
  const result = page.locator('section[aria-label="Result"]');
  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(result.getByText('wpm').first()).toBeVisible();

  // The run must persist server-side before we reload (reloading would abort an
  // in-flight submission). Assert the server accepted it.
  const response = await submitted;
  expect(response.ok()).toBeTruthy();

  // Reload to prove nothing depends on in-memory state, then open stats.
  await page.reload();
  await page.goto('/stats');

  // The submitted run should appear (submission is fire-and-forget; the
  // web-first assertion retries until it lands).
  await expect(page.getByRole('heading', { name: 'history' })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('section[aria-label="Stats"] li').first()).toBeVisible();
});

/**
 * Word mode (Monkeytype-style): switch via the command palette, type a
 * generated 25-word set, see a result with no attribution epigraph, and find
 * the run in stats tagged "words · 25". Guards the word-mode wiring end to end.
 */
test('switch to word mode via the palette, type, and see it in stats', async ({ page }) => {
  await page.goto('/');
  // Wait for the app to mount (a prose passage loads by default) so the
  // palette's document key listener is attached before we press Esc.
  const board = page.getByTestId('passage');
  await expect(board).toBeVisible();

  // Esc opens the command palette; filter to the 25-word preset and run it.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  const search = page.getByRole('textbox', { name: 'Search commands' });
  await search.fill('25');
  await page.keyboard.press('Enter');

  // The board now holds a generated 25-word set.
  await expect(async () => {
    const text = ((await board.textContent()) ?? '').trim();
    expect(text.split(/\s+/)).toHaveLength(25);
  }).toPass({ timeout: 10_000 });
  const text = ((await board.textContent()) ?? '').trim();

  const submitted = page.waitForResponse(
    (r) => r.url().includes('/api/v1/results') && r.request().method() === 'POST',
    { timeout: 75_000 },
  );

  await page.locator('section[aria-label="Typing stage"]').click();
  await page.keyboard.type(text, { delay: 55 });

  const result = page.locator('section[aria-label="Result"]');
  await expect(result).toBeVisible({ timeout: 15_000 });
  // Word runs show a "words · 25" tag (no attribution epigraph) and, since the
  // §3.5 share-card generalization, the share affordance too.
  await expect(result.getByText('words · 25')).toBeVisible();
  await expect(result.getByText('share result')).toBeVisible();

  const response = await submitted;
  expect(response.ok()).toBeTruthy();

  await page.reload();
  await page.goto('/stats');
  await expect(page.getByRole('heading', { name: 'history' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('words · 25').first()).toBeVisible();
});

/**
 * Custom text: open the paste dialog via the palette, paste text with curly
 * quotes (normalized on the way in), type the canonical result, and find the
 * run in stats tagged "custom · N". Guards the dialog, normalization, and the
 * custom submission path end to end.
 */
test('paste custom text via the dialog, type it, and see it in stats', async ({ page }) => {
  await page.goto('/');
  const board = page.getByTestId('passage');
  await expect(board).toBeVisible();

  // Esc opens the palette; "Type custom text" opens the paste dialog.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search commands' }).fill('custom');
  await page.keyboard.press('Enter');

  // Paste text with curly quotes - the dialog normalizes them to straight ones.
  const dialog = page.getByRole('dialog', { name: 'Custom text' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole('textbox', { name: 'Custom text to type' })
    .fill('so “it goes” on and on');
  await page.keyboard.press('Enter');

  // The board holds the normalized paste.
  const expected = 'so "it goes" on and on';
  await expect(async () => {
    expect(((await board.textContent()) ?? '').trim()).toBe(expected);
  }).toPass({ timeout: 10_000 });

  const submitted = page.waitForResponse(
    (r) => r.url().includes('/api/v1/results') && r.request().method() === 'POST',
    { timeout: 75_000 },
  );

  await page.locator('section[aria-label="Typing stage"]').click();
  await page.keyboard.type(expected, { delay: 150 }); // short text: slow cadence keeps the run over 3s

  const result = page.locator('section[aria-label="Result"]');
  await expect(result).toBeVisible({ timeout: 15_000 });
  await expect(result.getByText('custom · 6')).toBeVisible();

  const response = await submitted;
  expect(response.ok()).toBeTruthy();

  await page.reload();
  await page.goto('/stats');
  await expect(page.getByRole('heading', { name: 'history' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('custom · 6').first()).toBeVisible();
});
