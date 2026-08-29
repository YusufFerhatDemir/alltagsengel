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
        // Gleiche Bedingungen wie im CI-Job (.github/workflows/ci.yml).
        // Playwright spricht den Server direkt an, ohne Reverse-Proxy —
        // `x-forwarded-for` fehlt, und getClientIP() vergibt fuer JEDE
        // Anfrage aus JEDER Browser-Sitzung denselben Schluessel. Alle
        // Tests beider Browser-Projekte teilen sich damit EIN Budget von
        // 120 Anfragen/Minute, und der Zaehler schlaegt mitten im Lauf zu.
        //
        // Gemessen am 29.08.2026: in e2e/pflegecoach.spec.ts fielen genau
        // die Faelle /belastung und /verlauf um — reproduzierbar, auch bei
        // warmem Server, einzeln aber gruen. Die Seite zeigte „Zu viele
        // Anfragen": /api/coach/profil antwortete 429 statt 401, und der
        // Zugangs-Guard leitet nur bei 401 auf die Startseite (das bleibt
        // richtig so — bei 429 ist der Anmeldestand schlicht unbekannt).
        // Ohne diese Zeile prueft der lokale Lauf den Ratenzaehler mit,
        // nicht den Zugangsschutz, um den es geht.
        //
        // Der Schalter gilt NUR fuer den Server, den Playwright selbst
        // startet. Ein bereits laufender `npm run dev` wird per
        // `reuseExistingServer` weiterverwendet und behaelt sein scharfes
        // Limit — dort schlaegt der Lauf also weiterhin fehl.
        env: { DISABLE_RATE_LIMIT_FOR_E2E: '1' },
      },
})
