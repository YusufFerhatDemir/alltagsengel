import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireWundenAdmin } from '@/lib/wunden/api-auth'
import { getWound } from '@/lib/wunden/wunden'
import { createAssessment, listAssessments } from '@/lib/wunden/assessments'
import { logAuditEvent } from '@/lib/audit-log'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireWundenAdmin()
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const assessments = await listAssessments(admin, id, auth.ctx.organizationId)
    return NextResponse.json({ assessments })
  } catch (err) {
    return safeApiError(err, _request)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requireWundenAdmin()
    if (!auth.ok) return auth.response
    const { userId, organizationId } = auth.ctx

    const admin = createAdminClient()
    // Org-Zugehörigkeit der Wunde prüfen, bevor daran dokumentiert wird.
    const wunde = await getWound(admin, id, organizationId)
    if (!wunde) return NextResponse.json({ error: 'Wunde nicht gefunden.' }, { status: 404 })

    const body = await request.json()
    const assessment = await createAssessment(admin, {
      organizationId,
      woundId: id,
      erhobenVon: userId,
      erhobenAm: body.erhobenAm ?? null,
      laengeCm: body.laengeCm ?? null,
      breiteCm: body.breiteCm ?? null,
      tiefeCm: body.tiefeCm ?? null,
      granulationPct: body.granulationPct ?? null,
      fibrinPct: body.fibrinPct ?? null,
      nekrosePct: body.nekrosePct ?? null,
      epithelPct: body.epithelPct ?? null,
      wundrand: body.wundrand ?? null,
      umgebungshaut: body.umgebungshaut ?? null,
      exsudatMenge: body.exsudatMenge ?? null,
      exsudatArt: body.exsudatArt ?? null,
      geruch: body.geruch ?? null,
      schmerzNrs: body.schmerzNrs ?? null,
      infektionszeichen: body.infektionszeichen ?? false,
      bemerkung: body.bemerkung ?? null,
    })

    await logAuditEvent({
      action: 'create',
      actorId: auth.ctx.userId,
      actorName: auth.ctx.name,
      actorRole: auth.ctx.role,
      organizationId: auth.ctx.organizationId,
      entityType: 'wund_assessment',
      entityId: assessment.id,
      details: { wound_id: id },
      request,
    })

    return NextResponse.json({ assessment })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
