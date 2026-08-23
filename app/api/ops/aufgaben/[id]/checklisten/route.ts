import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listChecklisten, createChecklistenItem } from '@/lib/ops/checklisten'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('einsatz.lesen')
  if (!auth.ok) return auth.response
  const { id: aufgabeId } = await params
  const supabase = createAdminClient()
  try {
    const data = await listChecklisten(supabase, {
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
    const data = await createChecklistenItem(supabase, {
      organizationId: auth.ctx.organizationId,
      aufgabeId,
      titel: body.titel,
      position: body.position,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
}
