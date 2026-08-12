import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listTagesansicht } from '@/lib/personal/dienstplan'

export async function GET(request: Request) {
  const auth = await requirePersonalAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const datum = url.searchParams.get('datum')
  if (!datum) {
    return NextResponse.json({ error: 'datum is required' }, { status: 400 })
  }
  try {
    const data = await listTagesansicht(supabase, auth.ctx.organizationId, datum)
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
