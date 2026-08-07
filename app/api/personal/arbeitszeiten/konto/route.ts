import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listArbeitszeitKonto } from '@/lib/personal/arbeitszeiten'

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePersonalAdmin()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const sp = req.nextUrl.searchParams
    const caregiverId = sp.get('caregiverId') ?? undefined
    const jahr = sp.get('jahr') ?? undefined
    const monat = sp.get('monat') ?? undefined

    const data = await listArbeitszeitKonto(supabase, {
      caregiverId,
      jahr,
      monat,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
