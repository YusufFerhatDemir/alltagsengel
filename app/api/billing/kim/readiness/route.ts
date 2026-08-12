import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ermittleKimReadiness } from '@/lib/kim/readiness'

/**
 * GET /api/billing/kim/readiness?stichtag=2027-02-01
 *
 * Blocker-Übersicht für die KIM/TI-Anbindung — getrennt in intern lösbare
 * und extern zu beschaffende Voraussetzungen. Der Versand selbst bleibt in
 * jedem Fall gesperrt (s. lib/kim/versand.ts), unabhängig vom Ergebnis hier.
 */
export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { organizationId } = auth.ctx

  try {
    const url = new URL(request.url)
    const stichtagParam = url.searchParams.get('stichtag')
    const stichtag = stichtagParam && /^\d{4}-\d{2}-\d{2}$/.test(stichtagParam)
      ? stichtagParam
      : new Date().toISOString().slice(0, 10)

    const admin = createAdminClient()
    const ergebnis = await ermittleKimReadiness(admin, organizationId, stichtag)

    return NextResponse.json(ergebnis)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Interner Serverfehler'
    console.error('[billing/kim/readiness] Fehler:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
