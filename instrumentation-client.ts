// Sentry Client-Side Init (Browser + Capacitor WebView)
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  // Session Replay komplett entfernt (Perf 2026-07): das Replay-Modul wog
  // ~70 KB gzip im First-Load-JS und zeichnete ALLE Sessions im Puffer-Modus
  // mit (MutationObserver-Dauerlast auf alten Geräten der Zielgruppe).
  // Session-Replays waren ohnehin 0 (PII-Schutz), Error-Replays voll maskiert
  // → kaum Diagnose-Wert. Bei Bedarf: replayIntegration wieder eintragen UND
  // excludeReplay*-Flags in next.config.ts entfernen.
  debug: false,
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  sendDefaultPii: false,
  ignoreErrors: [
    'Non-Error exception captured',
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    // Capacitor / WebView spezifisch
    'The operation was aborted',
    // Browser-Extensions
    'Extension context invalidated',
  ],
  denyUrls: [
    // Chrome Extensions
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    // Safe Facebook/Google Script Errors
    /graph\.facebook\.com/i,
    /connect\.facebook\.net\/en_US\/all\.js/i,
  ],
  beforeSend(event) {
    // Auth-Tokens aus URL entfernen
    if (event.request?.url) {
      event.request.url = event.request.url
        .replace(/access_token=[^&]+/g, 'access_token=[FILTERED]')
        .replace(/refresh_token=[^&]+/g, 'refresh_token=[FILTERED]')
        .replace(/code=[^&]+/g, 'code=[FILTERED]')
    }
    return event
  },
})

// Navigation-Tracking für Next.js Router
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
