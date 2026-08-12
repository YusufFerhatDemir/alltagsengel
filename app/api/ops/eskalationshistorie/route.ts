import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { listEskalationshistorie } from '@/lib/ops/eskalationen'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const aufgabeId = url.searchParams.get('aufgabe_id') || undefined
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined
  try {
    const data = await listEskalationshistorie(supabase, {
      organizationId: auth.ctx.organizationId,
      aufgabeId,
      limit,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
