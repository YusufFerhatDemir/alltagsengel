'use client'

// Fatale Root-Layout-Errors — fängt auch Fehler ab, die error.tsx nicht erwischt
import * as Sentry from '@sentry/nextjs'
import NextError from 'next/error'
import { useEffect } from 'react'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="de">
      <body style={{ margin: 0, padding: 0, background: '#1A1612', color: '#F7F2EA', fontFamily: 'sans-serif' }}>
        <NextError statusCode={0} />
      </body>
    </html>
  )
}
