import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listZeitkorrekturen } from '@/lib/personal/zeitkorrekturen'

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePersonalAdmin()
    if (!auth.ok) return auth.response
    const supabase = createAdminClient()

    const sp = req.nextUrl.searchParams
    const caregiverId = sp.get('caregiverId') ?? undefined
    const arbeitszeitId = sp.get('arbeitszeitId') ?? undefined
    const limit = sp.get('limit') ? Number(sp.get('limit')) : undefined

    const data = await listZeitkorrekturen(supabase, {
      caregiverId,
      arbeitszeitId,
      limit,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
