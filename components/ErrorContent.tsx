'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { logger } from '@/lib/logger'
const log = logger.child('ui:ErrorContent')

/**
 * Wiederverwendbare Fehlerseiten-Komponente fuer alle Route-Segmente.
 *
 * Zeigt eine nutzerfreundliche Fehlermeldung auf Deutsch, loggt den Fehler
 * nach Sentry und bietet "Erneut versuchen" + optionalen Zurueck-Link.
 *
 * Props:
 * - error / reset: aus Next.js error.tsx
 * - bereich: menschenlesbarer Bereichsname (z.B. "Admin", "Engel-Portal")
 * - zurueckHref: optionaler Link zur Uebersicht des Bereichs
 * - zurueckLabel: Label fuer den Zurueck-Link (Standard: "Zur Uebersicht")
 */
export default function ErrorContent({
  error,
  reset,
  bereich,
  zurueckHref,
  zurueckLabel = 'Zur Übersicht',
}: {
  error: Error & { digest?: string }
  reset: () => void
  bereich: string
  zurueckHref?: string
  zurueckLabel?: string
}) {
  useEffect(() => {
    log.errorWithException('Fehler', error, { bereich })
    Sentry.captureException(error, { tags: { bereich } })
  }, [error, bereich])

  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      textAlign: 'center',
      fontFamily: "var(--font-jost, 'Jost', sans-serif)",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }} aria-hidden="true">
        {/* Goldener Kreis mit Ausrufezeichen */}
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="22" stroke="#C9963C" strokeWidth="2.5" fill="rgba(201,150,60,0.08)" />
          <text x="24" y="30" textAnchor="middle" fill="#C9963C" fontSize="26" fontWeight="700" fontFamily="Jost, sans-serif">!</text>
        </svg>
      </div>

      <h2 style={{
        fontSize: 20,
        fontWeight: 600,
        marginBottom: 8,
        color: 'var(--gold, #C9963C)',
      }}>
        Etwas ist schiefgelaufen
      </h2>

      <p style={{
        fontSize: 14,
        color: 'var(--ink3, #A89C8C)',
        marginBottom: 8,
        maxWidth: 340,
        lineHeight: 1.5,
      }}>
        Im Bereich <strong style={{ color: 'var(--ink2, #D4C8B8)' }}>{bereich}</strong> ist
        ein unerwarteter Fehler aufgetreten. Ihre Daten sind davon nicht betroffen.
      </p>

      {error.digest && (
        <p style={{
          fontSize: 12,
          color: 'var(--ink4, #8A7E6E)',
          marginBottom: 24,
          fontFamily: 'monospace',
        }}>
          Fehler-ID: {error.digest}
        </p>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => reset()}
          style={{
            padding: '12px 28px',
            borderRadius: 12,
            border: 'none',
            background: 'linear-gradient(135deg, #C9963C, #DBA84A)',
            color: '#1A1612',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "var(--font-jost, 'Jost', sans-serif)",
          }}
        >
          Erneut versuchen
        </button>

        {zurueckHref && (
          <a
            href={zurueckHref}
            style={{
              padding: '12px 28px',
              borderRadius: 12,
              border: '1.5px solid var(--border2, rgba(255,255,255,0.12))',
              background: 'transparent',
              color: 'var(--ink2, #D4C8B8)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              textDecoration: 'none',
              fontFamily: "var(--font-jost, 'Jost', sans-serif)",
            }}
          >
            {zurueckLabel}
          </a>
        )}
      </div>
    </div>
  )
}
