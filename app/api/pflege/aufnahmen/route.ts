import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { clientGehoertZuOrg } from '@/lib/clients/organization-guard'
import { createAufnahme, listAufnahmen } from '@/lib/pflege/aufnahmen'
import type { AufnahmeStatus, Dringlichkeit } from '@/lib/pflege/types'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin('pflege.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()
    const aufnahmen = await listAufnahmen(admin, {
      organizationId,
      clientId: params.get('clientId') ?? undefined,
      status: (params.get('status') as AufnahmeStatus) ?? undefined,
      dringlichkeit: (params.get('dringlichkeit') as Dringlichkeit) ?? undefined,
    })

    return NextResponse.json({ aufnahmen })
  } catch (err) {
    return safeApiError(err, request)
  }
})

export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await requirePflegeAdmin('pflege.schreiben')
    if (!auth.ok) return auth.response
    const { userId, organizationId } = auth.ctx

    const body = await request.json()
    if (!body.clientId) {
      return NextResponse.json({ error: 'clientId ist ein Pflichtfeld.' }, { status: 400 })
    }

    const admin = createAdminClient()
    if (!(await clientGehoertZuOrg(admin, body.clientId, organizationId))) {
      return NextResponse.json({ error: 'Klient nicht gefunden oder gehört nicht zur Organisation.' }, { status: 404 })
    }
    const aufnahme = await createAufnahme(admin, {
      organizationId,
      clientId: body.clientId,
      aufnahmedatum: body.aufnahmedatum,
      aufgenommenVon: body.aufgenommenVon ?? userId,
      aufnahmeOrt: body.aufnahmeOrt,
      pflegegradBeiAufnahme: body.pflegegradBeiAufnahme ?? null,
      vorherigeVersorgung: body.vorherigeVersorgung ?? null,
      grundDerAnfrage: body.grundDerAnfrage ?? null,
      dringlichkeit: body.dringlichkeit,
      wohnsituationDetails: body.wohnsituationDetails ?? null,
      stockwerk: body.stockwerk ?? null,
      aufzugVorhanden: body.aufzugVorhanden ?? null,
      barrierefrei: body.barrierefrei ?? null,
      schluesselregelung: body.schluesselregelung ?? null,
      betreuungsbedarf: body.betreuungsbedarf ?? null,
      gewuenschteZeiten: body.gewuenschteZeiten ?? null,
      gewuenschteHaeufigkeit: body.gewuenschteHaeufigkeit ?? null,
      besondereAnforderungen: body.besondereAnforderungen ?? null,
      erstelltVon: userId,
    })

    return NextResponse.json({ aufnahme })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
})
