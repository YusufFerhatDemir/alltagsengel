import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { updateChecklistenItem, deleteChecklistenItem } from '@/lib/ops/checklisten'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; checkId: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { checkId } = await params
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const { id: _id, organization_id: _oid, created_at: _ca, aufgabe_id: _aid, ...safeData } = body
    const data = await updateChecklistenItem(supabase, {
      organizationId: auth.ctx.organizationId,
      id: checkId,
      data: safeData,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; checkId: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { checkId } = await params
  const supabase = createAdminClient()
  try {
    const data = await deleteChecklistenItem(supabase, {
      organizationId: auth.ctx.organizationId,
      id: checkId,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}
