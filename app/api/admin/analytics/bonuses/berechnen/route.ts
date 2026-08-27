import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireBonusVerwaltung } from '@/lib/analytics/bonus-auth'
import { fuehreBerechnungslaufDurch } from '@/lib/analytics/bonusEngine'
import { withTracking } from '@/lib/monitoring/tracker'

export const POST = withTracking(async function POST(request: Request) {
  const auth = await requireBonusVerwaltung()
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
    // `uebersprungen` gehoert in die Antwort: ein Lauf, der bereits
    // entschiedene Praemien bewusst NICHT ueberschreibt, sieht sonst aus wie
    // ein Lauf, der alles neu berechnet hat.
    const uebersprungen = ergebnisse.filter(e => e.uebersprungen).length
    return NextResponse.json({
      anzahl: ergebnisse.length,
      erfuellt: ergebnisse.filter(e => e.erfuellt).length,
      uebersprungen,
      gespeichert: ergebnisse.length - uebersprungen,
      ergebnisse,
    })
  } catch (e: any) {
    return apiErrorResponse(e, request)
  }
})
