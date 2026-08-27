import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listKommentare, createKommentar } from '@/lib/ops/kommentare'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('einsatz.lesen')
  if (!auth.ok) return auth.response
  const { id: aufgabeId } = await params
  const supabase = createAdminClient()
  try {
    const data = await listKommentare(supabase, {
      organizationId: auth.ctx.organizationId,
      aufgabeId,
      includeIntern: true,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
})

export const POST = withTracking(async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('einsatz.schreiben')
  if (!auth.ok) return auth.response
  const { id: aufgabeId } = await params
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await createKommentar(supabase, {
      organizationId: auth.ctx.organizationId,
      aufgabeId,
      inhalt: body.inhalt,
      autorId: body.autor_id || auth.ctx.userId,
      istIntern: body.ist_intern,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiErrorResponse(e)
  }
})
