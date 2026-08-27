/**
 * GET /api/health
 *
 * Oeffentlicher Health-Check-Endpunkt. Prueft:
 * - App antwortet (immer, wenn diese Route laeuft)
 * - Supabase-Verbindung (SELECT 1)
 * - Kritische Tabellen erreichbar (profiles, bookings, organizations)
 *
 * Gibt JSON mit Status, einzelnen Checks, Timestamp und Version zurueck.
 * Leakt KEINE Secrets, Connection-Strings oder interne Fehlerdetails.
 *
 * Drei Zustaende:
 *   healthy    alles antwortet innerhalb seines Zeitbudgets  → HTTP 200
 *   degraded   alles antwortet, mindestens eines zu langsam  → HTTP 200
 *   unhealthy  mindestens ein Check ist gescheitert          → HTTP 503
 *
 * Warum 'degraded' 200 bekommt: .github/workflows/uptime.yml legt bei jeder
 * Nicht-2xx-Antwort ein GitHub-Issue an. Eine Datenbankabfrage, die statt
 * 200 ms eben 1,6 s braucht, ist ein Hinweis, kein Ausfall — und ein
 * Alarmkanal, in dem Hinweise stehen, wird nach zwei Wochen ignoriert. Die
 * Verlangsamung steht im Feld `status` und in `hinweis`; wer sie ueberwachen
 * will, liest den Rumpf statt des Statuscodes.
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CheckResult {
  name: string
  status: 'pass' | 'fail'
  durationMs: number
  message?: string
  /** true, wenn der Check zwar bestanden hat, aber ueber dem Zeitbudget lag. */
  slow?: boolean
}

/**
 * Zeitbudget je Check in Millisekunden.
 *
 * Warum ueberhaupt eines: ein Health-Check, der nur pass/fail kennt, meldet
 * bis zur letzten Sekunde vor dem Ausfall „healthy". Eine Datenbank, die
 * 4 Sekunden fuer ein SELECT 1 braucht, ist nicht gesund — sie ist kurz vor
 * dem Timeout. 'degraded' ist genau dieser Zustand: erreichbar, aber nicht
 * in Ordnung.
 *
 * Die Werte sind gemessen, nicht geschaetzt (Production, 27.08.2026, je drei
 * Laeufe): der database-Check liegt warm bei 667-759 ms und beim Kaltstart bei
 * 1126 ms; die Tabellen-Checks bei 127-398 ms. Ein Budget von 1500 ms haette
 * damit auf jedem etwas langsameren Kaltstart 'degraded' gemeldet — eine
 * Schwelle, die im Normalbetrieb regelmaessig anschlaegt, ist keine Schwelle.
 * 2500 ms lassen den Kaltstart durch und fangen trotzdem das Doppelte des
 * schlechtesten gemessenen Werts ab. 800 ms fuer die Tabellen sind gut das
 * Doppelte des dort gemessenen Maximums.
 */
const ZEITBUDGET_MS = {
  database: 2500,
  tabelle: 800,
} as const

export async function GET() {
  const checks: CheckResult[] = []
  const start = performance.now()

  // 1. App-Check (implizit bestanden, wenn wir hier ankommen)
  checks.push({
    name: 'app',
    status: 'pass',
    durationMs: 0,
    message: 'App ist erreichbar',
  })

  // 2. Supabase-Verbindung
  const dbCheck = await checkSupabase()
  checks.push(dbCheck)

  // 3. Kritische Tabellen
  const tableChecks = await checkCriticalTables()
  checks.push(...tableChecks)

  const totalDuration = Math.round(performance.now() - start)

  // Drei Zustaende statt zwei: 'unhealthy' heisst „etwas antwortet nicht",
  // 'degraded' heisst „alles antwortet, aber zu langsam". Beides mit 503 zu
  // beantworten waere richtig, beides gleich zu BENENNEN nicht — wer den
  // Endpunkt ueberwacht, muss den Unterschied sehen.
  const fehler = checks.filter(c => c.status === 'fail')
  const langsam = checks.filter(c => c.status === 'pass' && c.slow)
  const overallStatus =
    fehler.length > 0 ? 'unhealthy' : langsam.length > 0 ? 'degraded' : 'healthy'

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
      durationMs: totalDuration,
      checks,
      ...(langsam.length > 0
        ? {
            hinweis:
              `${langsam.length} Check(s) ueber dem Zeitbudget: `
              + langsam.map(c => `${c.name} (${c.durationMs} ms)`).join(', '),
          }
        : {}),
    },
    {
      status: overallStatus === 'unhealthy' ? 503 : 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  )
}

// ---------------------------------------------------------------------------
// Einzelne Checks
// ---------------------------------------------------------------------------

async function checkSupabase(): Promise<CheckResult> {
  const start = performance.now()
  try {
    // Dynamischer Import: admin.ts hat `server-only` + Runtime-Guard,
    // aber in Route-Handlern (immer Server) ist das kein Problem.
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    const { error } = await supabase.rpc('version' as any)

    // Fallback: manche Supabase-Instanzen haben keine version()-RPC.
    // In dem Fall machen wir einen einfachen Select.
    if (error) {
      const { error: selectError } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })

      if (selectError) {
        return {
          name: 'database',
          status: 'fail',
          durationMs: Math.round(performance.now() - start),
          message: 'Datenbankverbindung fehlgeschlagen',
        }
      }
    }

    const dauer = Math.round(performance.now() - start)
    return {
      name: 'database',
      status: 'pass',
      durationMs: dauer,
      ...(dauer > ZEITBUDGET_MS.database
        ? {
            slow: true,
            message: `Verbindung erreichbar, aber ${dauer} ms — Budget ${ZEITBUDGET_MS.database} ms.`,
          }
        : {}),
    }
  } catch {
    return {
      name: 'database',
      status: 'fail',
      durationMs: Math.round(performance.now() - start),
      message: 'Datenbankverbindung fehlgeschlagen',
    }
  }
}

async function checkCriticalTables(): Promise<CheckResult[]> {
  const tables = ['profiles', 'bookings', 'organizations']
  const results: CheckResult[] = []

  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    for (const table of tables) {
      const start = performance.now()
      try {
        const { error } = await supabase
          .from(table)
          .select('id', { count: 'exact', head: true })

        const dauer = Math.round(performance.now() - start)
        results.push({
          name: `table:${table}`,
          status: error ? 'fail' : 'pass',
          durationMs: dauer,
          ...(error
            ? { message: `Tabelle ${table} nicht erreichbar` }
            : dauer > ZEITBUDGET_MS.tabelle
              ? {
                  slow: true,
                  message: `Tabelle ${table} erreichbar, aber ${dauer} ms — Budget ${ZEITBUDGET_MS.tabelle} ms.`,
                }
              : {}),
        })
      } catch {
        results.push({
          name: `table:${table}`,
          status: 'fail',
          durationMs: Math.round(performance.now() - start),
          message: `Tabelle ${table} nicht erreichbar`,
        })
      }
    }
  } catch {
    // Wenn der Admin-Client nicht erstellt werden kann
    for (const table of tables) {
      results.push({
        name: `table:${table}`,
        status: 'fail',
        durationMs: 0,
        message: 'Datenbankverbindung nicht verfuegbar',
      })
    }
  }

  return results
}
