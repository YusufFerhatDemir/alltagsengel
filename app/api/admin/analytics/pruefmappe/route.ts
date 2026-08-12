import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { erstellePruefmappe } from '@/lib/analytics/pruefmappe'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const clientId = url.searchParams.get('client_id')
  const von = url.searchParams.get('von')
  const bis = url.searchParams.get('bis')
  if (!clientId || !von || !bis) {
    return NextResponse.json({ error: 'client_id, von und bis sind erforderlich.' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const mappe = await erstellePruefmappe(supabase, { organizationId: auth.ctx.organizationId, clientId, von, bis })
    return NextResponse.json(mappe)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
