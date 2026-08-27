import { NextResponse } from 'next/server'
import { apiErrorResponse, safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { genehmigeHkpVerordnung, ladeHkpVerordnung } from '@/lib/abrechnung/sgb-v/verordnung-service'
import { withTracking } from '@/lib/monitoring/tracker'

/** GET /api/billing/sgb-v/verordnungen/[id] */
export const GET = withTracking(async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOpsAdmin('abrechnung.lesen')
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const admin = createAdminClient()
    const verordnung = await ladeHkpVerordnung(admin, auth.ctx.organizationId, id)
    if (!verordnung) return NextResponse.json({ error: 'Verordnung nicht gefunden.' }, { status: 404 })
    return NextResponse.json({ verordnung })
  } catch (err) {
    return safeApiError(err, request)
  }
})

/** PATCH /api/billing/sgb-v/verordnungen/[id] — Kassengenehmigung eintragen. */
export const PATCH = withTracking(async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOpsAdmin('abrechnung.schreiben')
  if (!auth.ok) return auth.response

  try {
    const { id } = await params
    const body = await request.json()
    const admin = createAdminClient()
    await genehmigeHkpVerordnung(admin, auth.ctx.organizationId, id, {
      genehmigungBis: body.genehmigungBis ?? null,
      aktenzeichen: body.aktenzeichen ?? null,
    }, auth.ctx.userId)
    return NextResponse.json({ success: true })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
})
