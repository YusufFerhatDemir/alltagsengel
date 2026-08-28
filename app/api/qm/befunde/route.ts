import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireQmAdmin } from '@/lib/qm/api-auth'
import { erfasseBefund, aendereBefund, verknuepfeMassnahme } from '@/lib/qm/pflegevisite'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { withTracking } from '@/lib/monitoring/tracker'

/** POST — einen Befund zu einem Prüfpunkt erfassen. */
export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await requireQmAdmin('qm.schreiben')
    if (!auth.ok) return auth.response
    const { organizationId, userId } = auth.ctx

    const body = await request.json()
    const admin = createAdminClient()

    const befund = await erfasseBefund(admin, {
      visiteId: body.visiteId,
      pruefpunkt: body.pruefpunkt,
      bewertung: body.bewertung,
      feststellung: body.feststellung ?? null,
      empfehlung: body.empfehlung ?? null,
      frist: body.frist ?? null,
      massnahmeBeantragt: body.massnahmeBeantragt === true,
      organizationId,
      erstelltVon: userId,
    })
    return NextResponse.json({ befund }, { status: 201 })
  } catch (err) {
    return safeApiError(err, request)
  }
})

/**
 * PATCH — einen Befund ändern, oder den Regelkreis schließen.
 *
 * Die zwei Fälle haben BEWUSST verschiedene Berechtigungen:
 *
 *   • Befund ändern            → `qm.schreiben`  (das Qualitätsmanagement
 *                                 pflegt seinen eigenen Bestand)
 *   • Maßnahme verknüpfen /    → `pflege.schreiben` (die Antwort der
 *     Erledigung nachtragen       Pflegedienstleitung auf den Befund)
 *
 * Das ist keine Förmlichkeit: die Rollenmatrix hält für `qm` fest, dass es
 * die geprüften Daten NICHT ändert — „sonst prüfte es die eigene
 * Korrektur". Dürfte QM die Erledigung selbst eintragen, könnte dieselbe
 * Stelle feststellen und für erledigt erklären, und der Regelkreis wäre
 * einer mit sich selbst.
 */
export const PATCH = withTracking(async function PATCH(request: Request) {
  try {
    // Erst die Tuer, dann der Inhalt: der Request-Koerper wird NICHT
    // gelesen, bevor der Aufrufer ueberhaupt in diesen Bereich darf.
    // Welche der beiden Berechtigungen es am Ende sein muss, entscheidet
    // die Aktion — die engere wird darunter noch einmal geprueft.
    const zutritt = await requireQmAdmin('qm.lesen')
    if (!zutritt.ok) return zutritt.response

    const body = await request.json()
    const admin = createAdminClient()

    if (body.aktion === 'massnahme') {
      const auth = await requireQmAdmin('pflege.schreiben')
      if (!auth.ok) return auth.response
      const befund = await verknuepfeMassnahme(
        admin, body.befundId, auth.ctx.organizationId,
        body.massnahmeId ?? null, body.erledigtAm,
      )
      return NextResponse.json({ befund })
    }

    const auth = await requireQmAdmin('qm.schreiben')
    if (!auth.ok) return auth.response

    if (!body.befundId) throw new UserFacingError('Befund ist ein Pflichtfeld.', 400)
    const befund = await aendereBefund(admin, body.befundId, auth.ctx.organizationId, {
      bewertung: body.bewertung,
      feststellung: body.feststellung,
      empfehlung: body.empfehlung,
      frist: body.frist,
      massnahmeBeantragt: body.massnahmeBeantragt,
    })
    return NextResponse.json({ befund })
  } catch (err) {
    return safeApiError(err, request)
  }
})
