import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { processPending, checkFristen } from '@/lib/workflow/processing'

export async function POST(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action ?? 'process_pending'

    if (action === 'check_fristen') {
      const data = await checkFristen(supabase)
      return NextResponse.json(data)
    }

    if (action === 'process_pending') {
      const data = await processPending(supabase, { limit: body.limit })
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Unbekannte Aktion. Erlaubt: process_pending, check_fristen' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
