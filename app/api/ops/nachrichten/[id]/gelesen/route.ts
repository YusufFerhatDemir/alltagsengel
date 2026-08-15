import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsUser } from '@/lib/ops/api-auth'
import { markGelesen } from '@/lib/ops/nachrichten'
import { logAuditEvent } from '@/lib/audit-log'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsUser()
  if (!auth.ok) return auth.response
  const { id: nachrichtId } = await params
  const supabase = createAdminClient()
  try {
    const data = await markGelesen(supabase, {
      organizationId: auth.organizationId,
      nachrichtId,
      empfaengerId: auth.userId,
    })
    await logAuditEvent({
      action: 'update',
      actorId: auth.userId,
      organizationId: auth.organizationId,
      entityType: 'nachricht',
      entityId: nachrichtId,
      details: { aktion: 'gelesen' },
      request,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
