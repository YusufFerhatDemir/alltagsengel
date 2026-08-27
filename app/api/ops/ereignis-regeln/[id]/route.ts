import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { updateEreignisRegel, deleteEreignisRegel } from '@/lib/ops/ereignis-regeln'
import { withTracking } from '@/lib/monitoring/tracker'

export const PATCH = withTracking(async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const { id: _id, organization_id: _oid, created_at: _ca, ...safeData } = body
    const data = await updateEreignisRegel(supabase, {
      organizationId: auth.ctx.organizationId,
      id,
      data: safeData,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
})

export const DELETE = withTracking(async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('system.verwalten')
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    const data = await deleteEreignisRegel(supabase, {
      organizationId: auth.ctx.organizationId,
      id,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
})
