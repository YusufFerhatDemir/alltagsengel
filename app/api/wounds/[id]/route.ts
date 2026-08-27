import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireWundenAdmin } from '@/lib/wunden/api-auth'
import { getWound, updateWound } from '@/lib/wunden/wunden'
import { logAuditEvent } from '@/lib/audit-log'
import { listAssessments } from '@/lib/wunden/assessments'
import { listTreatments, naechsterVwTermin } from '@/lib/wunden/behandlungen'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireWundenAdmin('pflege.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const admin = createAdminClient()
    const wunde = await getWound(admin, id, organizationId)
    if (!wunde) return NextResponse.json({ error: 'Wunde nicht gefunden.' }, { status: 404 })

    const [assessments, behandlungen] = await Promise.all([
      listAssessments(admin, id, organizationId),
      listTreatments(admin, id, organizationId),
    ])

    return NextResponse.json({
      wunde,
      assessments,
      behandlungen,
      naechsterVw: naechsterVwTermin(behandlungen),
    })
  } catch (err) {
    return safeApiError(err, _request)
  }
})

export const PATCH = withTracking(async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireWundenAdmin('pflege.schreiben')
    if (!auth.ok) return auth.response

    const body = await request.json()
    const admin = createAdminClient()
    const wunde = await updateWound(admin, id, auth.ctx.organizationId, {
      wundTyp: body.wundTyp,
      dekubitusGrad: body.dekubitusGrad,
      lokalisation: body.lokalisation,
      koerperstelleCode: body.koerperstelleCode,
      koerperseite: body.koerperseite,
      entstandenAm: body.entstandenAm,
      status: body.status,
      abgeheiltAm: body.abgeheiltAm,
      bemerkung: body.bemerkung,
    })

    await logAuditEvent({
      action: 'update',
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      actorRole: auth.ctx.role,
      organizationId: auth.ctx.organizationId,
      entityType: 'wunddokumentation',
      entityId: id,
      details: { geaenderte_felder: Object.keys(body).filter(k => body[k] !== undefined) },
      request,
    })

    return NextResponse.json({ wunde })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
})
