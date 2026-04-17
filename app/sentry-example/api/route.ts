import { NextResponse } from 'next/server'

/**
 * POST /sentry-example/api — kontrolliertes Server-Error-Trigger
 *
 * Wirft eine Exception, die Sentry (via instrumentation.ts) automatisch
 * als Server-Side-Issue capturen soll. Rückgabe ist ein 500er mit
 * generischer Message (AUTH-002-Style, keine Details nach außen).
 *
 * Diese Route existiert **nur** für den Sentry-Smoke-Test und ist weder
 * im Navigationsbaum sichtbar noch in `robots.ts` erlaubt.
 */
export async function POST() {
  // Das folgende Object-Access triggert einen echten TypeError, der im
  // Server-Log + Sentry-Issue auftaucht. Wir `throw`en bewusst, damit
  // der Next.js-Runtime die Exception an unseren Sentry-Handler weiterleitet.
  const notDefined: any = undefined
  // eslint-disable-next-line no-unused-expressions
  notDefined.das_feld_existiert_nicht // ← TypeError

  // Unerreichbar, aber für TypeScript-Return-Type sauber.
  return NextResponse.json({ ok: true })
}

// Fallback für GET, damit der Endpoint nicht "405 Method Not Allowed"
// zeigt, wenn jemand per Browser die URL aufruft.
export async function GET() {
  return NextResponse.json(
    {
      error: 'Nutze POST /sentry-example/api um einen kontrollierten 500er zu triggern.',
    },
    { status: 405 }
  )
}
