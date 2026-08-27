import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePflegeAdmin } from '@/lib/pflege/api-auth'
import { clientGehoertZuOrg } from '@/lib/clients/organization-guard'
import { createRisiko, listRisiken } from '@/lib/pflege/risiken'
import type { RisikoSchweregrad, RisikoTyp } from '@/lib/pflege/types'
import { withTracking } from '@/lib/monitoring/tracker'

export const GET = withTracking(async function GET(request: Request) {
  try {
    const auth = await requirePflegeAdmin('pflege.lesen')
    if (!auth.ok) return auth.response

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()
    const risiken = await listRisiken(admin, {
      organizationId: auth.ctx.organizationId,
      clientId: params.get('clientId') ?? undefined,
      risikoTyp: (params.get('risikoTyp') as RisikoTyp) ?? undefined,
      schweregrad: (params.get('schweregrad') as RisikoSchweregrad) ?? undefined,
      nurAktive: params.get('nurAktive') === 'true',
    })

    return NextResponse.json({ risiken })
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
    if (!body.clientId || !body.risikoTyp || !body.bezeichnung) {
      return NextResponse.json({ error: 'clientId, risikoTyp und bezeichnung sind Pflichtfelder.' }, { status: 400 })
    }

    const admin = createAdminClient()
    if (!(await clientGehoertZuOrg(admin, body.clientId, organizationId))) {
      return NextResponse.json({ error: 'Klient nicht gefunden oder gehört nicht zur Organisation.' }, { status: 404 })
    }
    const risiko = await createRisiko(admin, {
      organizationId,
      clientId: body.clientId,
      risikoTyp: body.risikoTyp,
      bezeichnung: body.bezeichnung,
      beschreibung: body.beschreibung ?? null,
      schweregrad: body.schweregrad,
      massnahmen: body.massnahmen ?? null,
      erkanntAm: body.erkanntAm ?? null,
      erkanntVon: body.erkanntVon ?? userId,
      naechstePruefung: body.naechstePruefung ?? null,
      erstelltVon: userId,
    })

    return NextResponse.json({ risiko })
  } catch (err) {
    return apiErrorResponse(err, request)
  }
})
