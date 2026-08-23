import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listAuditLog } from '@/lib/personal/audit'
import type { AuditEntitaetTyp, AuditAktion } from '@/lib/personal/types'

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePersonalAdmin('personal.lesen')
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
      entitaetTyp: entitaetTyp as AuditEntitaetTyp | undefined,
      entitaetId,
      caregiverId,
      aktion: aktion as AuditAktion | undefined,
      limit,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e, req)
  }
}
