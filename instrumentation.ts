// Sentry Instrumentation für Server + Edge Runtime
// Läuft einmal pro Prozess beim Start
import * as Sentry from '@sentry/nextjs'
import { pruefeEnvBeimStart } from '@/lib/env'
import { pruefeVersandFlagsBeimStart } from '@/lib/config/versand-flags'

export async function register() {
  // ENV-Prüfung VOR allem anderen: sie bricht ab, wenn das Datenbank-Trio
  // fehlt oder ein Geheimnis unter einem NEXT_PUBLIC_-Namen steht. Beides
  // fiel bisher erst im Betrieb auf — als 500er bzw. gar nicht.
  // Nur in der Node-Laufzeit: die Edge-Runtime bekommt von Vercel nur die
  // Variablen, die eine Edge-Funktion tatsächlich referenziert, ein Befund
  // dort wäre nicht aussagekräftig.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    pruefeEnvBeimStart()

    // Lage der beiden Versand-Schalter einmal pro Prozess ins Protokoll.
    // Bricht bewusst NICHT ab (siehe lib/config/versand-flags.ts): der Zweck
    // ist Sichtbarkeit. Nach einem Deployment steht damit im Vercel-Protokoll,
    // ob automatisch verschickt wird — und ob ein Wert ungueltig ist, statt
    // dass ein System schweigend nichts verschickt.
    pruefeVersandFlagsBeimStart()

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      // Kein tracesSampleRate mehr: Tracing ist per excludeTracing in
      // next.config.ts aus ALLEN Bundles geshaked (CWV 2026-07) — das Flag
      // wirkt global (Client+Server+Edge), ein serverseitiges Sample-Rate
      // wäre toter Config-Code. Error-Tracking bleibt vollständig aktiv.
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
      // Tracing global deaktiviert (excludeTracing, s. o.)
      debug: false,
      environment: process.env.NODE_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      sendDefaultPii: false,
    })
  }
}

// Next.js 15+ / 16: onRequestError für Server-Komponenten
export const onRequestError = Sentry.captureRequestError
