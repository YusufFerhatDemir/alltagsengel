'use client'

/**
 * /sentry-example — Smoke-Test für Sentry-Integration
 *
 * Ziel: Nach dem Einrichten der DSN (siehe SENTRY_SETUP.md) öffnet man
 * diese Seite einmal und klickt auf einen der beiden Buttons:
 *
 *   1. "Client-Error auslösen"  — wirft eine echte React-Exception
 *   2. "Server-Error auslösen"  — triggert einen 500er in der API
 *
 * Innerhalb von ~30s sollte im Sentry-Dashboard ein Issue auftauchen.
 * Damit verifizieren wir:
 *   - DSN ist korrekt gesetzt
 *   - Source-Maps sind hochgeladen (Stack-Trace zeigt TS, nicht Minified)
 *   - PII-Filter greift (User-Kontext = nur UUID, keine E-Mail)
 *
 * Diese Seite ist NICHT indexiert (noindex) und hat keinen internen Link.
 * Sie bleibt nach dem Smoke-Test als Debug-Tool für Ops liegen.
 */

import { useState } from 'react'
import Link from 'next/link'

export default function SentryExamplePage() {
  const [serverResult, setServerResult] = useState<string>('')
  const [clientShouldThrow, setClientShouldThrow] = useState(false)

  // Wenn state auf true steht, rendert React einen Throw im JSX-Tree —
  // das simuliert einen echten Render-Fehler, den ErrorBoundary fängt
  // und Sentry automatisch capturen sollte.
  if (clientShouldThrow) {
    throw new Error(`Sentry Smoke-Test (Client Render) ${new Date().toISOString()}`)
  }

  const triggerServer = async () => {
    setServerResult('Sende Request …')
    try {
      const r = await fetch('/sentry-example/api', { method: 'POST' })
      const text = await r.text()
      setServerResult(`${r.status}: ${text}`)
    } catch (err: any) {
      setServerResult(`Netzwerkfehler: ${err?.message || 'unknown'}`)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '80px auto', padding: '0 20px', color: 'var(--ink)', fontFamily: 'var(--font-sans)' }}>
      <h1 style={{ fontSize: 28, marginBottom: 12, color: 'var(--gold)' }}>Sentry Smoke-Test</h1>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink3)', marginBottom: 24 }}>
        Diese Seite ist ausschließlich für Ops/Dev gedacht. Sie löst
        kontrolliert Fehler aus, damit das Monitoring im
        Sentry-Dashboard verifiziert werden kann.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
        <button
          onClick={() => setClientShouldThrow(true)}
          style={{
            padding: '14px 20px', borderRadius: 10, border: '1px solid rgba(201,150,60,.3)',
            background: 'linear-gradient(135deg,var(--gold),var(--gold2))', color: 'var(--coal)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Client-Error auslösen (React-Render-Throw)
        </button>

        <button
          onClick={triggerServer}
          style={{
            padding: '14px 20px', borderRadius: 10, border: '1px solid var(--border)',
            background: 'var(--coal2)', color: 'var(--ink)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Server-Error auslösen (API 500)
        </button>

        {serverResult && (
          <div style={{ padding: 12, borderRadius: 8, background: 'var(--coal3)', fontSize: 13, color: 'var(--ink3)', fontFamily: 'monospace' }}>
            {serverResult}
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--ink4)', lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <strong>Erwartung:</strong> Innerhalb von 30 Sekunden erscheint im Sentry-Dashboard
        ein neues Issue. Stack-Trace sollte lesbaren TypeScript-Code zeigen (Source-Maps).
        User-Kontext enthält nur die UUID, keine E-Mail.
        <br />
        <br />
        <Link href="/" style={{ color: 'var(--gold)' }}>← Zurück zur Startseite</Link>
      </div>
    </div>
  )
}

// Hinweis: noindex wird auf dieser Client-Component-Seite über
// robots.ts (Disallow /sentry-example*) geregelt, nicht über eine
// metadata-Export (das ist mit 'use client' inkompatibel).
