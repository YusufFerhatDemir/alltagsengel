// ═══════════════════════════════════════════════════════════════════
// GET /api/tours/[id]/optimierung — Reihenfolge-Vorschlag
// ═══════════════════════════════════════════════════════════════════
// Bewusst GET und bewusst schreibfrei. Der Vorschlag verschiebt
// Klienten-Termine; wer ihn uebernimmt, ist eine Entscheidung der
// Disposition und laeuft weiterhin ueber
// PATCH /api/tours/[id]/stops mit `reihenfolge` — dort pruefen die
// bestehenden Riegel Vollstaendigkeit und Zugehoerigkeit der Stop-IDs
// und der Doppelbelegungs-Trigger die Zeiten.
//
// `flexibel` (Minuten, Standard 0) sagt, wie weit ein Termin verschoben
// werden DARF. Ohne Angabe verschiebt der Vorschlag nichts: eine
// stillschweigende Toleranz waere eine Zusage, die niemand gegeben hat.
// ═══════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { optimiereReihenfolge, type OptiStop } from '@/lib/touren/optimierung'
import { TOUR_SELECT, type TourZeile } from '@/lib/touren/select'
import { withTracking } from '@/lib/monitoring/tracker'

/** Obergrenze fuer `flexibel`: mehr als 4 h Verschiebung ist kein Termin mehr. */
const FLEXIBEL_MAX_MINUTEN = 240

export const GET = withTracking(async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('einsatz.lesen')
  if (!auth.ok) return auth.response
  const { id } = await params

  const url = new URL(req.url)
  const flexibelRoh = url.searchParams.get('flexibel')
  const flexibel = flexibelRoh === null ? 0 : Number(flexibelRoh)
  if (!Number.isFinite(flexibel) || !Number.isInteger(flexibel) || flexibel < 0) {
    return NextResponse.json(
      { error: 'flexibel muss eine ganze Zahl von Minuten (>= 0) sein.' },
      { status: 400 },
    )
  }
  if (flexibel > FLEXIBEL_MAX_MINUTEN) {
    return NextResponse.json(
      { error: `flexibel ist auf ${FLEXIBEL_MAX_MINUTEN} Minuten begrenzt — `
        + `wer einen Termin weiter verschiebt, plant ihn neu.` },
      { status: 400 },
    )
  }
  const rueckfahrt = url.searchParams.get('rueckfahrt') === '1'

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('tours')
      .select(TOUR_SELECT)
      .eq('id', id)
      .eq('organization_id', auth.ctx.organizationId)
      .single()
    if (error || !data) {
      return NextResponse.json({ error: 'Tour nicht gefunden.' }, { status: 404 })
    }
    const tour = data as unknown as TourZeile

    const stops: OptiStop[] = (tour.tour_stops ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        position: s.position,
        plz: s.plz,
        status: s.status,
        clientName: s.clients
          ? [s.clients.first_name, s.clients.last_name].filter(Boolean).join(' ') || null
          : null,
        geplante_ankunft: s.geplante_ankunft,
        geplantes_ende: s.geplantes_ende,
        flexibel_minuten: flexibel,
      }))

    const ergebnis = optimiereReihenfolge({
      stops,
      // Startpunkt ist der Wohnort der Kraft — dieselbe Quelle, aus der
      // die bestehende Fahrtzeit-Anreicherung rechnet.
      startPlz: tour.caregivers?.zip_code ?? null,
      rueckfahrt,
    })

    return NextResponse.json({
      tour_id: tour.id,
      tour_date: tour.tour_date,
      flexibel_minuten: flexibel,
      rueckfahrt,
      ...ergebnis,
    })
  } catch (err) {
    return apiErrorResponse(err, req, 400)
  }
})
