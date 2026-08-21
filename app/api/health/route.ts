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
 */

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CheckResult {
  name: string
  status: 'pass' | 'fail'
  durationMs: number
  message?: string
}

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

  const overallStatus = checks.every(c => c.status === 'pass') ? 'healthy' : 'degraded'
  const totalDuration = Math.round(performance.now() - start)

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
      durationMs: totalDuration,
      checks,
    },
    {
      status: overallStatus === 'healthy' ? 200 : 503,
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

    return {
      name: 'database',
      status: 'pass',
      durationMs: Math.round(performance.now() - start),
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

        results.push({
          name: `table:${table}`,
          status: error ? 'fail' : 'pass',
          durationMs: Math.round(performance.now() - start),
          ...(error ? { message: `Tabelle ${table} nicht erreichbar` } : {}),
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
