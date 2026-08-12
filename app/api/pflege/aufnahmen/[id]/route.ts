import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { getAufnahme, updateAufnahme } from '@/lib/pflege/aufnahmen'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response

    const admin = createAdminClient()
    const aufnahme = await getAufnahme(admin, id, auth.ctx.organizationId)
    if (!aufnahme) return NextResponse.json({ error: 'Aufnahme nicht gefunden.' }, { status: 404 })

    return NextResponse.json({ aufnahme })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await requirePflegeAdmin()
    if (!auth.ok) return auth.response
    const { organizationId, userId } = auth.ctx

    const body = await request.json()
    const admin = createAdminClient()
    const aufnahme = await updateAufnahme(admin, id, organizationId, {
      status: body.status,
      aufnahmedatum: body.aufnahmedatum,
      aufnahmeOrt: body.aufnahmeOrt,
      pflegegradBeiAufnahme: body.pflegegradBeiAufnahme,
      vorherigeVersorgung: body.vorherigeVersorgung,
      grundDerAnfrage: body.grundDerAnfrage,
      dringlichkeit: body.dringlichkeit,
      wohnsituationDetails: body.wohnsituationDetails,
      stockwerk: body.stockwerk,
      aufzugVorhanden: body.aufzugVorhanden,
      barrierefrei: body.barrierefrei,
      schluesselregelung: body.schluesselregelung,
      betreuungsbedarf: body.betreuungsbedarf,
      gewuenschteZeiten: body.gewuenschteZeiten,
      gewuenschteHaeufigkeit: body.gewuenschteHaeufigkeit,
      besondereAnforderungen: body.besondereAnforderungen,
      empfehlung: body.empfehlung,
      abschlussBemerkung: body.abschlussBemerkung,
    }, userId)

    return NextResponse.json({ aufnahme })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
