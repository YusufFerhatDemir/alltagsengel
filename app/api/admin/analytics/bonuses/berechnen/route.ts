import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { fuehreBerechnungslaufDurch } from '@/lib/analytics/bonusEngine'

export async function POST(request: Request) {
  const auth = await requireOpsAdmin('berichte.lesen')
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    const { regelId, von, bis } = body || {}
    if (!regelId || !von || !bis) return NextResponse.json({ error: 'regelId, von und bis sind erforderlich.' }, { status: 400 })

    const supabase = await createClient()
    const ergebnisse = await fuehreBerechnungslaufDurch(supabase, {
      organizationId: auth.ctx.organizationId,
      regelId,
      von,
      bis,
      userId: auth.ctx.userId,
    })
    return NextResponse.json({ anzahl: ergebnisse.length, erfuellt: ergebnisse.filter(e => e.erfuellt).length, ergebnisse })
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
}
