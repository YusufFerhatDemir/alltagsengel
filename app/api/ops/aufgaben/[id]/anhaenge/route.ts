import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listAnhaenge, createAnhang, deleteAnhang } from '@/lib/ops/anhaenge'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('einsatz.lesen')
  if (!auth.ok) return auth.response
  const { id: aufgabeId } = await params
  const supabase = createAdminClient()
  try {
    const data = await listAnhaenge(supabase, {
      organizationId: auth.ctx.organizationId,
      aufgabeId,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('einsatz.schreiben')
  if (!auth.ok) return auth.response
  const { id: aufgabeId } = await params
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await createAnhang(supabase, {
      organizationId: auth.ctx.organizationId,
      aufgabeId,
      dokumentId: body.dokument_id,
      hinzugefuegtVon: body.hinzugefuegt_von || auth.ctx.userId,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('einsatz.schreiben')
  if (!auth.ok) return auth.response
  await params
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const anhangId = url.searchParams.get('id')
  if (!anhangId) {
    return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 })
  }
  try {
    const data = await deleteAnhang(supabase, {
      organizationId: auth.ctx.organizationId,
      id: anhangId,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}
