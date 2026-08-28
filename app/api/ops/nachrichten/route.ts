import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsPostfachUser } from '@/lib/ops/api-auth'
import { listPosteingang, createNachricht } from '@/lib/ops/nachrichten'
import { logAuditEvent } from '@/lib/audit-log'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requireOpsPostfachUser()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const data = await listPosteingang(supabase, {
      organizationId: auth.organizationId,
      empfaengerId: auth.userId,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireOpsPostfachUser()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await createNachricht(supabase, {
      organizationId: auth.organizationId,
      data: {
        betreff: body.betreff,
        inhalt: body.inhalt,
        prioritaet: body.prioritaet,
        kategorie: body.kategorie,
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
      entityType: 'nachricht',
      entityId: data?.id ?? null,
      details: { betreff: body.betreff, kategorie: body.kategorie },
      request,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})
