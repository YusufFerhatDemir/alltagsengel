import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ermittleKimReadiness } from '@/lib/kim/readiness'
import { heuteBerlin } from '@/lib/utils/timezone';
import { safeApiError } from '@/lib/api/error-sanitizer'
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * GET /api/billing/kim/readiness?stichtag=2027-02-01
 *
 * Blocker-Übersicht für die KIM/TI-Anbindung — getrennt in intern lösbare
 * und extern zu beschaffende Voraussetzungen. Der Versand selbst bleibt in
 * jedem Fall gesperrt (s. lib/kim/versand.ts), unabhängig vom Ergebnis hier.
 */
export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const { organizationId } = auth.ctx

  try {
    const url = new URL(request.url)
    const stichtagParam = url.searchParams.get('stichtag')
    const stichtag = stichtagParam && /^\d{4}-\d{2}-\d{2}$/.test(stichtagParam)
      ? stichtagParam
      : heuteBerlin()

    const admin = createAdminClient()
    const ergebnis = await ermittleKimReadiness(admin, organizationId, stichtag)

    return NextResponse.json(ergebnis)
  } catch (err) {
    return safeApiError(err, request)
  }
})
