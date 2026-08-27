import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { genehmigenAbwesenheit } from '@/lib/personal/abwesenheiten'
import { writeAuditLog } from '@/lib/personal/audit'
import { withTracking } from '@/lib/monitoring/tracker'

export const POST = withTracking(async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePersonalAdmin('personal.schreiben')
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const { id } = await params
    const data = await genehmigenAbwesenheit(
      supabase,
      id,
      auth.ctx.organizationId,
      auth.ctx.userId
    )

    await writeAuditLog(supabase, {
      entitaetTyp: 'abwesenheit',
      entitaetId: id,
      aktion: 'genehmigt',
      benutzerId: auth.ctx.userId,
      organizationId: auth.ctx.organizationId,
    })

    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
})
