import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireQmAdmin } from '@/lib/qm/api-auth'
import {
  getVisite,
  updateVisite,
  listBefunde,
  fuehreVisiteDurch,
  werteVisiteAus,
  schliesseVisiteAb,
} from '@/lib/qm/pflegevisite'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { withTracking } from '@/lib/monitoring/tracker'

/** GET — eine Visite samt ihren Befunden. */
export const GET = withTracking(async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireQmAdmin('qm.lesen')
    if (!auth.ok) return auth.response
    const { organizationId } = auth.ctx
    const { id } = await params

    const admin = createAdminClient()
    const visite = await getVisite(admin, id, organizationId)
    if (!visite) {
      return NextResponse.json({ error: 'Pflegevisite nicht gefunden.' }, { status: 404 })
    }
    const befunde = await listBefunde(admin, id, organizationId)
    return NextResponse.json({ visite, befunde })
  } catch (err) {
    return safeApiError(err, request)
  }
})

/**
 * PATCH — die Visite weiterschalten oder ihre Angaben aendern.
 *
 * Die drei Schritte der Kette bekommen eigene `aktion`-Werte, statt den
 * Status roh durchzureichen: `durchfuehren`, `auswerten` und
 * `abschliessen` bringen jeweils eigene Pflichtangaben und eigene
 * Fail-Closed-Pruefungen mit (ein Abschluss verlangt zu jeder Abweichung
 * eine Empfehlung UND eine Frist). Wer nur `{status: 'abgeschlossen'}`
 * schicken koennte, umginge genau die.
 */
export const PATCH = withTracking(async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireQmAdmin('qm.schreiben')
    if (!auth.ok) return auth.response
    const { organizationId, userId } = auth.ctx
    const { id } = await params

    const body = await request.json()
    const admin = createAdminClient()

    switch (body.aktion) {
      case 'durchfuehren': {
        const visite = await fuehreVisiteDurch(admin, id, organizationId, userId, body.durchgefuehrtAm)
        return NextResponse.json({ visite })
      }
      case 'auswerten': {
        const visite = await werteVisiteAus(admin, id, organizationId, body.gesamtbewertung, body.zusammenfassung)
        return NextResponse.json({ visite })
      }
      case 'abschliessen': {
        const visite = await schliesseVisiteAb(admin, id, organizationId, userId)
        return NextResponse.json({ visite })
      }
      case 'absagen': {
        const visite = await updateVisite(admin, id, organizationId, {
          status: 'abgesagt', anlass: body.grund ?? undefined,
        })
        return NextResponse.json({ visite })
      }
      case undefined: {
        // Reine Stammdatenaenderung an einer noch offenen Visite.
        // `status` wird hier bewusst NICHT angenommen — dafuer gibt es die
        // Aktionen oben, samt ihrer Pruefungen.
        if ('status' in body) {
          throw new UserFacingError(
            'Der Status wird über die Aktionen durchfuehren/auswerten/abschliessen/absagen gesetzt.',
            400,
          )
        }
        const visite = await updateVisite(admin, id, organizationId, {
          caregiverId: body.caregiverId,
          visiteTyp: body.visiteTyp,
          geplantAm: body.geplantAm,
          anlass: body.anlass,
          zusammenfassung: body.zusammenfassung,
        })
        return NextResponse.json({ visite })
      }
      default:
        throw new UserFacingError(`Unbekannte Aktion "${body.aktion}".`, 400)
    }
  } catch (err) {
    return safeApiError(err, request)
  }
})
