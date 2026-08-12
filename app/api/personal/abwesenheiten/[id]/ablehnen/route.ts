import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { ablehnenAbwesenheit } from '@/lib/personal/abwesenheiten'
import { writeAuditLog } from '@/lib/personal/audit'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePersonalAdmin()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const { id } = await params
    const { ablehnungsgrund } = await req.json()
    const data = await ablehnenAbwesenheit(supabase, id, auth.ctx.organizationId, auth.ctx.userId, ablehnungsgrund)

    await writeAuditLog(supabase, {
      entitaetTyp: 'abwesenheit',
      entitaetId: id,
      aktion: 'abgelehnt',
      benutzerId: auth.ctx.userId,
      organizationId: auth.ctx.organizationId,
    })

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
