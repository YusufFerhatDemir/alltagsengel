import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { ladePdlCockpit, standardZeitraumAktuellerMonat } from '@/lib/analytics/pdl-cockpit'

export async function GET(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const von = url.searchParams.get('von')
  const bis = url.searchParams.get('bis')
  const zeitraum = von && bis ? { von, bis } : standardZeitraumAktuellerMonat()

  try {
    const supabase = await createClient()
    const data = await ladePdlCockpit(supabase, auth.ctx.organizationId, zeitraum)
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
