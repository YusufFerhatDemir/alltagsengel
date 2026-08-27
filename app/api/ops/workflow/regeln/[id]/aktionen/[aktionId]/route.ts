import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { deleteAktion } from '@/lib/workflow/regeln'
import { withTracking } from '@/lib/monitoring/tracker'

export const DELETE = withTracking(async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; aktionId: string }> }
) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const { id, aktionId } = await params
  const supabase = createAdminClient()
  try {
    await deleteAktion(supabase, { organizationId: auth.ctx.organizationId, regelId: id, id: aktionId })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiErrorResponse(e)
  }
})
