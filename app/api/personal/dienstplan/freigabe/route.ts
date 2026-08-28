import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePersonalAdmin } from '@/lib/personal/api-auth'
import {
  ladeWochenUebersicht,
  gibWocheFrei,
  ziehefreigabeZurueck,
  listFreigaben,
  quittiereVerstoss,
  aktuelleWoche,
} from '@/lib/pdl/dienstplanfreigabe'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * GET — Wochenübersicht der Pflegedienstleitung.
 *
 * `?woche=YYYY-MM-DD`  ein beliebiges Datum in der gewünschten Woche
 * `?verlauf=true`      stattdessen die Liste der bisherigen Freigaben
 */
export const GET = withTracking(async function GET(request: Request) {
  try {
    const auth = await requirePersonalAdmin('einsatz.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx

    const params = new URL(request.url).searchParams
    const admin = createAdminClient()

    if (params.get('verlauf') === 'true') {
      const freigaben = await listFreigaben(admin, organizationId)
      return NextResponse.json({ freigaben })
    }

    const uebersicht = await ladeWochenUebersicht(
      admin, organizationId, params.get('woche') ?? aktuelleWoche(),
    )
    return NextResponse.json({ uebersicht })
  } catch (err) {
    return safeApiError(err, request)
  }
})

/**
 * POST — die Entscheidungen der Pflegedienstleitung.
 *
 *   aktion 'freigeben'   Woche verbindlich machen
 *   aktion 'zurueckziehen'  Freigabe mit Grund zurücknehmen
 *   aktion 'quittieren'  einen ArbZG-Verstoß mit Begründung zur Kenntnis
 *                        nehmen — der Schreibweg, den es bisher nirgends
 *                        gab, obwohl die Migration ihn voraussetzt
 *                        („PDL entscheidet", 20260920060000)
 *
 * Alle drei verlangen `einsatz.schreiben`: sie greifen in die Planung ein.
 */
export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await requirePersonalAdmin('einsatz.schreiben')
    if (!auth.ok) return auth.response
    const { organizationId, userId } = auth.ctx

    const body = await request.json()
    const admin = createAdminClient()

    switch (body.aktion) {
      case 'freigeben': {
        const freigabe = await gibWocheFrei(
          admin, organizationId, body.woche ?? aktuelleWoche(), userId,
          { trotzLuecken: body.trotzLuecken === true, hinweis: body.hinweis ?? null },
        )
        return NextResponse.json({ freigabe }, { status: 201 })
      }
      case 'zurueckziehen': {
        const freigabe = await ziehefreigabeZurueck(
          admin, organizationId, body.woche, userId, body.grund,
        )
        return NextResponse.json({ freigabe })
      }
      case 'quittieren': {
        await quittiereVerstoss(admin, body.verstossId, organizationId, userId, body.bemerkung)
        return NextResponse.json({ ok: true })
      }
      default:
        throw new UserFacingError(`Unbekannte Aktion "${body.aktion}".`, 400)
    }
  } catch (err) {
    return safeApiError(err, request)
  }
})
