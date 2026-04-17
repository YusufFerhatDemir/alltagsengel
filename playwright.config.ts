import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E Konfiguration — AlltagsEngel.care
 *
 * Tests liegen in `e2e/`. In CI werden sie gegen einen Preview-Deployment
 * oder die lokale Dev-Instanz ausgeführt (siehe PLAYWRIGHT_BASE_URL).
 *
 * Setup lokal:
 *   npm run test:e2e:install  # browsers installieren (einmalig)
 *   npm run dev               # in Terminal 1
 *   npm run test:e2e          # in Terminal 2
 *
 * Oder mit UI-Mode zum Debuggen:
 *   npm run test:e2e:ui
 */
export default defineConfig({
  testDir: './e2e',
  /* Parallel-Execution in CI: limitiert, um Flakiness zu vermeiden */
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  /* HTML-Report für Local-Debug, JSON für CI-Integration */
  reporter: process.env.CI
    ? [['github'], ['json', { outputFile: 'playwright-report/results.json' }]]
    : [['html', { open: 'never' }]],
  /* Shared Settings für alle Projekte */
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    /* Trace nur bei Fehlern (spart Disk) */
    trace: 'on-first-retry',
    /* Screenshot nur bei Fehler */
    screenshot: 'only-on-failure',
    /* Video nur bei Fehler */
    video: 'retain-on-failure',
    /* Default-Locale: Deutsche App */
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    /* Kein Fail bei Console-Errors — wir tracken sie separat via Sentry */
  },
  /* Browser-Matrix */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
    },
  ],
  /* Dev-Server automatisch starten (nur lokal, nicht in CI) */
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        timeout: 120 * 1000,
        reuseExistingServer: true,
      },
})
