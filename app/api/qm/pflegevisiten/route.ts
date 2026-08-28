import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireQmAdmin } from '@/lib/qm/api-auth'
import {
  planeVisite,
  listVisiten,
  berechneVisitenKennzahlen,
  listOffeneAbweichungen,
} from '@/lib/qm/pflegevisite'
import type { VisiteStatus, VisiteTyp } from '@/lib/qm/types'
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * GET — Pflegevisiten der eigenen Organisation.
 *
 * `?kennzahlen=true`   liefert stattdessen die Auswertung (wie viel wurde
 *                      geprueft, was kam heraus, was ist offen).
 * `?abweichungen=true` liefert die Arbeitsliste: alle festgestellten,
 *                      noch nicht erledigten Abweichungen mit dem Hinweis,
 *                      welche ihre Frist gerissen haben.
 */
export const GET = withTracking(async function GET(request: Request) {
  try {
    const auth = await requireQmAdmin('qm.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()

    if (params.get('kennzahlen') === 'true') {
      const von = params.get('von')
      const bis = params.get('bis')
      const kennzahlen = await berechneVisitenKennzahlen(
        admin, organizationId,
        von && bis ? { von, bis } : undefined,
      )
      return NextResponse.json({ kennzahlen })
    }

    if (params.get('abweichungen') === 'true') {
      const abweichungen = await listOffeneAbweichungen(admin, organizationId)
      return NextResponse.json({ abweichungen })
    }

    const visiten = await listVisiten(admin, {
      organizationId,
      clientId: params.get('clientId') ?? undefined,
      status: (params.get('status') as VisiteStatus) ?? undefined,
      visiteTyp: (params.get('visiteTyp') as VisiteTyp) ?? undefined,
      nurOffen: params.get('nurOffen') === 'true',
      vonDatum: params.get('von') ?? undefined,
      bisDatum: params.get('bis') ?? undefined,
    })
    return NextResponse.json({ visiten })
  } catch (err) {
    return safeApiError(err, request)
  }
})

/** POST — eine Pflegevisite planen. */
export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await requireQmAdmin('qm.schreiben')
    if (!auth.ok) return auth.response
    const { organizationId, userId } = auth.ctx

    const body = await request.json()
    const admin = createAdminClient()

    // organizationId und erstelltVon kommen NACH dem Body aus dem
    // Auth-Kontext: beide sind vertrauenswuerdig und duerfen aus dem
    // Request nicht ueberschreibbar sein.
    const visite = await planeVisite(admin, {
      clientId: body.clientId,
      caregiverId: body.caregiverId ?? null,
      visiteTyp: body.visiteTyp,
      geplantAm: body.geplantAm,
      anlass: body.anlass ?? null,
      organizationId,
      erstelltVon: userId,
    })
    return NextResponse.json({ visite }, { status: 201 })
  } catch (err) {
    return safeApiError(err, request)
  }
})
