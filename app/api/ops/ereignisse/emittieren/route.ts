import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { emitEreignis } from '@/lib/ops/ereignis-emitter'

export async function POST(request: Request) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  try {
    const body = await request.json()
    const data = await emitEreignis(supabase, {
      organizationId: auth.ctx.organizationId,
      ereignisTyp: body.ereignis_typ,
      entitaetId: body.entitaet_id,
      akteurId: body.akteur_id || auth.ctx.userId,
      kontext: body.kontext,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
