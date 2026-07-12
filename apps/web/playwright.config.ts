import { defineConfig, devices } from '@playwright/test';

const WEB_URL = 'http://localhost:5173';
const API_HEALTH = 'http://localhost:3001/api/v1/healthz';
const DATABASE_URL =
  process.env['DATABASE_URL'] ?? 'postgres://prosetype:prosetype@localhost:5432/prosetype';

/**
 * Playwright config for the single Phase 2 smoke (plan §11): it exists to catch
 * input-wiring regressions, not to re-test the engine. Two web servers - the
 * Fastify API (:3001) and the Vite dev server (:5173, which proxies /api) -
 * are started for the run (reused if already up outside CI).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI'] ? 'list' : 'line',
  // Generous: typing a full passage re-renders the board on every keystroke.
  timeout: 120_000,
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter api start',
      url: API_HEALTH,
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000,
      env: {
        DATABASE_URL,
        CORS_ORIGIN: WEB_URL,
        PORT: '3001',
        NODE_ENV: 'development',
      },
    },
    {
      command: 'pnpm --filter web dev',
      url: WEB_URL,
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000,
    },
  ],
});
