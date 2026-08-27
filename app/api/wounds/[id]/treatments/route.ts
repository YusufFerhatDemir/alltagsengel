import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireWundenAdmin } from '@/lib/wunden/api-auth'
import { getWound } from '@/lib/wunden/wunden'
import { createTreatment, listTreatments, naechsterVwTermin } from '@/lib/wunden/behandlungen'
import { logAuditEvent } from '@/lib/audit-log'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireWundenAdmin('pflege.lesen')
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const behandlungen = await listTreatments(admin, id, auth.ctx.organizationId)
    return NextResponse.json({ behandlungen, naechsterVw: naechsterVwTermin(behandlungen) })
  } catch (err) {
    return safeApiError(err, _request)
  }
})

export const POST = withTracking(async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireWundenAdmin('pflege.schreiben')
    if (!auth.ok) return auth.response
    const { userId, organizationId } = auth.ctx

    const admin = createAdminClient()
    const wunde = await getWound(admin, id, organizationId)
    if (!wunde) return NextResponse.json({ error: 'Wunde nicht gefunden.' }, { status: 404 })

    const body = await request.json()
    if (!body.massnahme) {
      return NextResponse.json({ error: 'massnahme ist Pflichtfeld.' }, { status: 400 })
    }

    const behandlung = await createTreatment(admin, {
      organizationId,
      woundId: id,
      durchgefuehrtVon: userId,
      durchgefuehrtAm: body.durchgefuehrtAm ?? null,
      massnahme: body.massnahme,
      wundreinigung: body.wundreinigung ?? null,
      materialien: body.materialien ?? [],
      schmerzmittelGegeben: body.schmerzmittelGegeben ?? false,
      besonderheiten: body.besonderheiten ?? null,
      naechsterVwAm: body.naechsterVwAm ?? null,
    })

    await logAuditEvent({
      action: 'create',
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      actorRole: auth.ctx.role,
      organizationId: auth.ctx.organizationId,
      entityType: 'wund_behandlung',
      entityId: behandlung.id,
      details: { wound_id: id, massnahme: body.massnahme },
      request,
    })

    return NextResponse.json({ behandlung })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
})
