'use client'

// Fatale Root-Layout-Errors — fängt auch Fehler ab, die error.tsx nicht erwischt.
// Rendert ein eigenes <html>, daher komplett self-contained (kein globals.css).
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="de">
      <body style={{
        margin: 0,
        padding: 0,
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        background: '#1A1612',
        color: '#F7F2EA',
        fontFamily: 'system-ui, sans-serif',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }} aria-hidden="true">😇</div>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px', color: '#C9963C' }}>
          Etwas ist schiefgelaufen
        </h1>
        <p style={{ fontSize: 14, color: '#B8AC9C', margin: '0 24px 24px', maxWidth: 340 }}>
          Ein unerwarteter Fehler ist aufgetreten. Bitte laden Sie die Seite neu —
          wir wurden bereits automatisch informiert.
        </p>
        <button
          onClick={() => reset()}
          style={{
            padding: '12px 32px',
            borderRadius: 12,
            border: 'none',
            background: 'linear-gradient(135deg, #C9963C, #DBA84A)',
            color: '#1A1612',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Seite neu laden
        </button>
      </body>
    </html>
  )
}
