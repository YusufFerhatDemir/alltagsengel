'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('App Error:', error)
    Sentry.captureException(error)
  }, [error])

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      textAlign: 'center',
      background: '#1A1612',
      color: '#F7F2EA',
      fontFamily: "'Jost', sans-serif",
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>😇</div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: '#C9963C' }}>
        Etwas ist schiefgelaufen
      </h2>
      <p style={{ fontSize: 14, color: '#B8AC9C', marginBottom: 24, maxWidth: 300 }}>
        Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.
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
          fontFamily: "'Jost', sans-serif",
        }}
      >
        Erneut versuchen
      </button>
    </div>
  )
}
