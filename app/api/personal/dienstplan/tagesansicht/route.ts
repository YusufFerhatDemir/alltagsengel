import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import { listTagesansicht } from '@/lib/personal/dienstplan'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  const auth = await requirePersonalAdmin('personal.lesen')
  if (!auth.ok) return auth.response
  const supabase = createAdminClient()
  const url = new URL(request.url)
  const datum = url.searchParams.get('datum')
  const datumVon = url.searchParams.get('datumVon')
  const datumBis = url.searchParams.get('datumBis')
  const caregiverId = url.searchParams.get('caregiverId')

  if (!datum && !(datumVon && datumBis)) {
    return NextResponse.json(
      { error: 'datum oder datumVon und datumBis erforderlich (JJJJ-MM-TT).' },
      { status: 400 },
    )
  }
  // Format VOR der Abfrage pruefen: PostgREST wuerde ein unbrauchbares Datum
  // als Postgres-Fehler zurueckgeben, und der kaeme hier als 500 an — ein
  // Serverfehler fuer eine Eingabe, die schlicht falsch ist.
  for (const [name, wert] of [['datum', datum], ['datumVon', datumVon], ['datumBis', datumBis]] as const) {
    if (wert !== null && !/^\d{4}-\d{2}-\d{2}$/.test(wert)) {
      return NextResponse.json({ error: `${name} muss ein Datum im Format JJJJ-MM-TT sein.` }, { status: 400 })
    }
  }

  try {
    const data = await listTagesansicht(supabase, auth.ctx.organizationId, {
      datum: datum || undefined,
      datumVon: datumVon || undefined,
      datumBis: datumBis || undefined,
      caregiverId: caregiverId || undefined,
    })
    return NextResponse.json(data)
  } catch (e: any) {
    // Zeitraum-Verstoesse sind Eingabefehler des Aufrufers, keine
    // Serverfehler: als 500 durchgereicht saehe eine zu weite Anfrage aus
    // wie ein Ausfall, und niemand kaeme auf die Idee, sie einzugrenzen.
    const text = e instanceof Error ? e.message : ''
    if (/Zeitraum|datumBis liegt vor|gültiges Datum/.test(text)) {
      return NextResponse.json({ error: text }, { status: 400 })
    }
    return apiErrorResponse(e, request)
  }
})
