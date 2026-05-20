import { defineConfig, devices } from '@playwright/test';

const PORT = 5179;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Playwright config for `<xflip-card>` e2e suite (P3.9).
 *
 * Three projects mirror AGENTS.md §5 Phase 3 DoD: Chromium + Firefox + WebKit.
 * The webServer is the source-aliased Vite dev server under `tests/e2e/`, so
 * specs hit live TypeScript with no prior `pnpm build` required.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm exec vite --config tests/e2e/vite.config.ts --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
