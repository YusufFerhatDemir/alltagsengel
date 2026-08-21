'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
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
      <div style={{ marginBottom: 16 }} aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="22" stroke="#C9963C" strokeWidth="2.5" fill="rgba(201,150,60,0.08)" />
          <text x="24" y="30" textAnchor="middle" fill="#C9963C" fontSize="26" fontWeight="700" fontFamily="Jost, sans-serif">!</text>
        </svg>
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: '#C9963C' }}>
        Etwas ist schiefgelaufen
      </h2>
      <p style={{ fontSize: 14, color: '#B8AC9C', marginBottom: 24, maxWidth: 300 }}>
        Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.
      </p>
      {error.digest && (
        <p style={{ fontSize: 12, color: '#8A7E6E', marginBottom: 24, fontFamily: 'monospace' }}>
          Fehler-ID: {error.digest}
        </p>
      )}
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
