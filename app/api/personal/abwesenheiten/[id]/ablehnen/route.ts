import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { ablehnenAbwesenheit } from '@/lib/personal/abwesenheiten'
import { writeAuditLog } from '@/lib/personal/audit'
import { withTracking } from '@/lib/monitoring/tracker'

export const POST = withTracking(async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePersonalAdmin('personal.schreiben')
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
    return apiErrorResponse(e)
  }
})
