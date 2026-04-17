// Sentry Instrumentation für Server + Edge Runtime
// Läuft einmal pro Prozess beim Start
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      debug: false,
      environment: process.env.NODE_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      // PII-Schutz: keine Request-Bodies senden
      sendDefaultPii: false,
      ignoreErrors: [
        // Capacitor auf iOS sendet manchmal leere Errors
        'Non-Error exception captured',
        'ResizeObserver loop limit exceeded',
      ],
      beforeSend(event) {
        // Sensitive Header entfernen falls doch eingeflogen
        if (event.request?.headers) {
          delete event.request.headers.authorization
          delete event.request.headers.cookie
          delete event.request.headers['x-supabase-auth']
        }
        return event
      },
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      debug: false,
      environment: process.env.NODE_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      sendDefaultPii: false,
    })
  }
}

// Next.js 15+ / 16: onRequestError für Server-Komponenten
export const onRequestError = Sentry.captureRequestError
