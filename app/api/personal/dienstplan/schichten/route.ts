import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listSchichten, createSchicht } from '@/lib/personal/dienstplan'

export async function GET(request: Request) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const nurAktive = url.searchParams.get('nurAktive')
  try {
    const data = await listSchichten(supabase, auth.ctx.organizationId, nurAktive === 'true')
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await createSchicht(supabase, {
      ...body,
      // Mandant kommt aus dem Auth-Kontext und darf nicht aus dem Body kommen.
      organizationId: auth.ctx.organizationId,
    })
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
