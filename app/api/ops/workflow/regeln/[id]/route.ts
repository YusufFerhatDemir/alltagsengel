import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { getRegel, updateRegel, deleteRegel } from '@/lib/workflow/regeln'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    const data = await getRegel(supabase, { organizationId: auth.ctx.organizationId, id })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const { id: _id, organization_id: _oid, created_at: _ca, ...safeData } = body
    const data = await updateRegel(supabase, { organizationId: auth.ctx.organizationId, id, data: safeData })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const supabase = createAdminClient()
  try {
    await deleteRegel(supabase, { organizationId: auth.ctx.organizationId, id })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}
