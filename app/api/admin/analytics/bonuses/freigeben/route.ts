import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { freigebenBerechnung } from '@/lib/analytics/bonusEngine'

export async function POST(request: Request) {
  const auth = await requireOpsAdmin('berichte.lesen')
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    const { berechnungId, entscheidung, kommentar } = body || {}
    if (!berechnungId || (entscheidung !== 'freigegeben' && entscheidung !== 'abgelehnt')) {
      return NextResponse.json({ error: 'berechnungId und entscheidung (freigegeben|abgelehnt) sind erforderlich.' }, { status: 400 })
    }
    const supabase = await createClient()
    const berechnung = await freigebenBerechnung(supabase, {
      organizationId: auth.ctx.organizationId,
      berechnungId,
      entscheidung,
      kommentar,
      userId: auth.ctx.userId,
    })
    return NextResponse.json(berechnung)
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
}
