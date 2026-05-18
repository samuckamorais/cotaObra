import { defineConfig, devices } from '@playwright/test';

/**
 * CotaObra — Playwright config (Sprint 0 smoke).
 *
 * Roda em CI via .github/workflows/e2e.yml.
 * Localmente: `pnpm install && pnpm exec playwright install chromium && pnpm test`
 * Backend precisa estar rodando em BASE_URL_API; frontend em BASE_URL.
 *
 * AC do CO-0-12: 5 cenários P0 + 3 runs consecutivos verdes em CI.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: false, // Sprint 0: sequencial para evitar interferência no banco
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['html'], ['line']] : 'list',
  timeout: 30_000,

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
