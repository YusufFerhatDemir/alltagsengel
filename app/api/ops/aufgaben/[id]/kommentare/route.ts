import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listKommentare, createKommentar } from '@/lib/ops/kommentare'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id: aufgabeId } = await params
  const supabase = createAdminClient()
  try {
    const data = await listKommentare(supabase, {
      organizationId: auth.organizationId,
      aufgabeId,
      includeIntern: true,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id: aufgabeId } = await params
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await createKommentar(supabase, {
      organizationId: auth.organizationId,
      aufgabeId,
      inhalt: body.inhalt,
      autorId: body.autor_id || auth.userId,
      istIntern: body.ist_intern,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
