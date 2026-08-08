import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listEskalationsregeln, createEskalationsregel } from '@/lib/ops/eskalationen'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const aktiv = url.searchParams.get('aktiv')
  try {
    const data = await listEskalationsregeln(supabase, {
      organizationId: auth.organizationId,
      aktiv: aktiv !== null ? aktiv === 'true' : undefined,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}

export async function POST(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await createEskalationsregel(supabase, {
      organizationId: auth.organizationId,
      data: body,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
