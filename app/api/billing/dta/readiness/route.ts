import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdminMitOrg } from '@/lib/abrechnung/require-admin'
import { ermittleReadiness } from '@/lib/abrechnung/readiness'
import { withTracking } from '@/lib/monitoring/tracker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/dta/readiness
 *
 * Zentrale Bereitschaftsansicht der aktiven Organisation. Antwortet
 * ausschliesslich mit Status- und Zählwerten — keine Zertifikatsinhalte,
 * keine SSH-Keys, keine Passwörter, nur deren Existenz als Ja/Nein.
 */
export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireAdminMitOrg('abrechnung.lesen')
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const readiness = await ermittleReadiness(admin, auth.organizationId)
    return NextResponse.json(readiness)
  } catch (e) {
    return safeApiError(e, request)
  }
})
