import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsUser } from '@/lib/ops/api-auth'
import { createAntwort } from '@/lib/ops/nachrichten'
import { logAuditEvent } from '@/lib/audit-log'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsUser()
  if (!auth.ok) return auth.response
  const { id: elternId } = await params
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await createAntwort(supabase, {
      organizationId: auth.organizationId,
      elternId,
      data: {
        betreff: body.betreff,
        inhalt: body.inhalt,
        prioritaet: body.prioritaet ?? 'normal',
        kategorie: body.kategorie ?? 'allgemein',
        bezug_typ: body.bezug_typ ?? null,
        bezug_id: body.bezug_id ?? null,
        absender_id: auth.userId,
      },
      empfaengerIds: Array.isArray(body.empfaenger_ids) ? body.empfaenger_ids : [],
    })
    await logAuditEvent({
      action: 'create',
      actorId: auth.userId,
      organizationId: auth.organizationId,
      entityType: 'nachricht_antwort',
      entityId: data?.id ?? null,
      details: { eltern_id: elternId, betreff: body.betreff },
      request,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
