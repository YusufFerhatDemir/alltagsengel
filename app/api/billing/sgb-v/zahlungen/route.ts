import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { automatischeZahlungszuordnungSgbV, sgbVOffenePostenListe } from '@/lib/abrechnung/sgb-v/zahlungsabgleich'
import { withTracking } from '@/lib/monitoring/tracker'

/** GET /api/billing/sgb-v/zahlungen — OPOS-Liste der § 302-Läufe. */
export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.lesen')
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const offenePosten = await sgbVOffenePostenListe(admin, auth.ctx.organizationId)
    return NextResponse.json({ offenePosten })
  } catch (err) {
    return safeApiError(err, request)
  }
})

/** POST /api/billing/sgb-v/zahlungen — automatischen Zahlungsabgleich anstossen. */
export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const ergebnis = await automatischeZahlungszuordnungSgbV(admin, auth.ctx.organizationId, auth.ctx.userId)
    return NextResponse.json(ergebnis)
  } catch (err) {
    return safeApiError(err, request)
  }
})
