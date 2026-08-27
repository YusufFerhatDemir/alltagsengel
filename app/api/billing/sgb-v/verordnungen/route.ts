import { NextResponse } from 'next/server'
import { apiErrorResponse, safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { legeHkpVerordnungAn, listeHkpVerordnungen } from '@/lib/abrechnung/sgb-v/verordnung-service'
import { withTracking } from '@/lib/monitoring/tracker'

/** GET /api/billing/sgb-v/verordnungen — Liste der HKP-Verordnungen (§ 37 SGB V). */
export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.lesen')
  if (!auth.ok) return auth.response

  try {
    const admin = createAdminClient()
    const verordnungen = await listeHkpVerordnungen(admin, auth.ctx.organizationId)
    return NextResponse.json({ verordnungen })
  } catch (err) {
    return safeApiError(err, request)
  }
})

/** POST /api/billing/sgb-v/verordnungen — neue HKP-Verordnung anlegen. */
export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    if (!body.clientId || !body.ausstellungsdatum) {
      return NextResponse.json({ error: 'clientId und ausstellungsdatum sind Pflicht.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const id = await legeHkpVerordnungAn(admin, auth.ctx.organizationId, {
      clientId: body.clientId,
      ausstellungsdatum: body.ausstellungsdatum,
      arztName: body.arztName ?? null,
      arztPraxis: body.arztPraxis ?? null,
      diagnose: body.diagnose ?? null,
      leistungBeschreibung: body.leistungBeschreibung ?? null,
      gueltigVon: body.gueltigVon ?? null,
      gueltigBis: body.gueltigBis ?? null,
      verordnungNummer: body.verordnungNummer ?? null,
      kostentraegerIkNummer: body.kostentraegerIkNummer ?? null,
      kostentraegerName: body.kostentraegerName ?? null,
    }, auth.ctx.userId)

    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
})
