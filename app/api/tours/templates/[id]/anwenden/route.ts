import { NextResponse, type NextRequest } from 'next/server'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { minutenZuZeit, zeitZuMinuten } from '@/lib/availability'
import { fahrtZwischenPlz } from '@/lib/touren/fahrtzeit'
import { pruefeVorlagenStops } from '@/lib/touren/planung'
import { POST as erstelleTour } from '@/app/api/tours/route'
import { withTracking } from '@/lib/monitoring/tracker'

// ── POST /api/tours/templates/[id]/anwenden ──────────────────────
// body: { tour_date, caregiver_id? } — materialisiert die Vorlage
// als konkrete Tour: Zeiten werden ab start_zeit fortlaufend aus
// Stop-Dauer + geschätzter Fahrzeit aufgebaut, dann läuft die
// normale Tour-Anlage (inkl. aller Prüfungen) über POST /api/tours.
export const POST = withTracking(async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('einsatz.schreiben')
  if (!auth.ok) return auth.response
  const { id } = await params

  const body = await req.json()
  const { tour_date, caregiver_id: caregiverOverride, force_override } = body as {
    tour_date?: string
    caregiver_id?: string
    force_override?: boolean
  }
  if (!tour_date) return NextResponse.json({ error: 'tour_date erforderlich (YYYY-MM-DD).' }, { status: 400 })

  const admin = createAdminClient()
  const { data: template, error } = await admin
    .from('tour_templates')
    .select('id, name, caregiver_id, weekday, start_zeit, stops, aktiv')
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .single()
  if (error || !template) return NextResponse.json({ error: 'Vorlage nicht gefunden.' }, { status: 404 })
  if (!template.aktiv) return NextResponse.json({ error: 'Vorlage ist deaktiviert.' }, { status: 422 })

  const caregiverId = caregiverOverride || template.caregiver_id
  if (!caregiverId) {
    return NextResponse.json({ error: 'Vorlage hat keinen Mitarbeiter — caregiver_id mitgeben.' }, { status: 400 })
  }

  const templateStops = (template.stops ?? []) as {
    client_id: string
    dauer_minuten: number
    service_type?: string
    notes?: string
  }[]
  // `stops` ist ein jsonb-Array ohne Struktur-Zusage. Ungeprueft wurde daraus
  // "NaN:NaN" als Uhrzeit, sobald dauer_minuten fehlte — und ein roher
  // Postgres-Formatfehler beim Anlegen des Einsatzes.
  const stopFehler = pruefeVorlagenStops(templateStops)
  if (stopFehler) {
    return NextResponse.json({ error: stopFehler }, { status: 422 })
  }

  // PLZ der Klienten für die Fahrzeit-Schätzung zwischen den Stops
  const clientIds = [...new Set(templateStops.map(s => s.client_id))]
  const { data: clients } = await admin
    .from('clients')
    .select('id, zip_code')
    .in('id', clientIds)
    .eq('organization_id', auth.ctx.organizationId)
  const plzMap = new Map((clients ?? []).map(c => [c.id, c.zip_code]))

  const { data: caregiver } = await admin
    .from('caregivers')
    .select('zip_code')
    .eq('id', caregiverId)
    .eq('organization_id', auth.ctx.organizationId)
    .single()

  // Zeiten fortlaufend aufbauen: Ankunft = vorheriges Ende + Fahrzeit.
  // Eine gesetzte, aber unlesbare start_zeit faellt NICHT still auf 08:00
  // zurueck — die Tour laege dann um Stunden verschoben, ohne dass es jemand
  // merkt. Nur eine leere start_zeit nutzt den Standardbeginn.
  if (template.start_zeit != null && zeitZuMinuten(template.start_zeit) === null) {
    return NextResponse.json(
      { error: `Vorlage: start_zeit "${template.start_zeit}" ist keine gültige Uhrzeit (HH:MM).` },
      { status: 422 },
    )
  }
  let zeiger = zeitZuMinuten(template.start_zeit) ?? 8 * 60
  const stops = templateStops.map((s, i) => {
    const vorherPlz = i === 0 ? caregiver?.zip_code ?? null : plzMap.get(templateStops[i - 1].client_id) ?? null
    const fahrt = fahrtZwischenPlz(vorherPlz, plzMap.get(s.client_id) ?? null)
    if (i > 0 || fahrt) zeiger += fahrt?.fahrzeitMinuten ?? 0
    const ankunft = zeiger
    zeiger += s.dauer_minuten
    return {
      client_id: s.client_id,
      geplante_ankunft: minutenZuZeit(ankunft),
      geplantes_ende: minutenZuZeit(zeiger),
      service_type: s.service_type,
      notes: s.notes,
    }
  })

  // minutenZuZeit deckelt bei 24:00. Reicht die Vorlage ueber den Tag hinaus,
  // wuerden mehrere Stops still auf 24:00 zusammenfallen — daraus entstuenden
  // Einsaetze ohne Dauer.
  if (zeiger > 24 * 60) {
    return NextResponse.json({
      error:
        `Die Vorlage reicht mit Fahrzeiten über den Tag hinaus (rechnerisches Ende `
        + `${Math.floor(zeiger / 60)}:${String(zeiger % 60).padStart(2, '0')} Uhr). `
        + 'Bitte Startzeit oder Stop-Dauern anpassen.',
    }, { status: 422 })
  }

  // Normale Tour-Anlage wiederverwenden (alle Prüfungen inklusive)
  const tourRequest = new Request(new URL('/api/tours', req.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      caregiver_id: caregiverId,
      tour_date,
      name: template.name,
      stops,
      force_override: force_override === true,
    }),
  })
  const antwort = await erstelleTour(tourRequest as unknown as NextRequest)
  if (antwort.status !== 201) return antwort

  // Herkunft an der Tour vermerken
  const tour = await antwort.json()
  if (tour?.id) {
    await admin.from('tours').update({ template_id: template.id }).eq('id', tour.id)
    tour.template_id = template.id
  }
  return NextResponse.json(tour, { status: 201 })
})
