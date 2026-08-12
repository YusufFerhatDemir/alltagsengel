import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listAuditLog } from '@/lib/personal/audit'

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePersonalAdmin()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const sp = req.nextUrl.searchParams
    const entitaetTyp = sp.get('entitaetTyp') ?? undefined
    const entitaetId = sp.get('entitaetId') ?? undefined
    const caregiverId = sp.get('caregiverId') ?? undefined
    const aktion = sp.get('aktion') ?? undefined
    const limit = sp.get('limit') ? Number(sp.get('limit')) : undefined

    const data = await listAuditLog(supabase, {
      organizationId: auth.ctx.organizationId,
      entitaetTyp: entitaetTyp as any,
      entitaetId,
      caregiverId,
      aktion: aktion as any,
      limit,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
