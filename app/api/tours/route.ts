import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { datumBerlin } from '@/lib/utils/timezone'
import { logBillingAction } from '@/lib/billing/core/audit'
import {
  aufloeseStops,
  reichereFahrtzeitenAn,
  pruefeCaregiverVerfuegbarkeit,
  uebersetzeDbFehler,
  type StopInput,
} from '@/lib/touren/server'
import { pruefeZeitplan, tourGesamtMinuten, pruefeWochenkapazitaet } from '@/lib/touren/planung'
import { TOUR_SELECT, type TourZeile } from '@/lib/touren/select'

// ── GET /api/tours?start=…&end=…&caregiver_id=…&status=… ──────────
export async function GET(req: NextRequest) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')
  if (!start || !end) {
    return NextResponse.json({ error: 'start und end Parameter erforderlich (YYYY-MM-DD).' }, { status: 400 })
  }

  const admin = createAdminClient()
  let query = admin
    .from('tours')
    .select(TOUR_SELECT)
    .eq('organization_id', auth.ctx.organizationId)
    .gte('tour_date', start)
    .lte('tour_date', end)
    .order('tour_date', { ascending: true })

  const caregiverId = searchParams.get('caregiver_id')
  if (caregiverId) query = query.eq('caregiver_id', caregiverId)
  const status = searchParams.get('status')
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: uebersetzeDbFehler(error) }, { status: 500 })

  const touren = ((data ?? []) as unknown as TourZeile[]).map(t => ({
    ...t,
    tour_stops: [...(t.tour_stops ?? [])].sort((a, b) => a.position - b.position),
  }))
  return NextResponse.json(touren)
}

// ── POST /api/tours — Tour mit Stops anlegen ──────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response

  const body = await req.json()
  const { caregiver_id, tour_date, name, notes, stops, force_override } = body as {
    caregiver_id?: string
    tour_date?: string
    name?: string
    notes?: string
    stops?: StopInput[]
    force_override?: boolean
  }

  if (!caregiver_id || !tour_date) {
    return NextResponse.json({ error: 'Pflichtfelder: caregiver_id, tour_date.' }, { status: 400 })
  }
  if (!Array.isArray(stops) || stops.length === 0) {
    return NextResponse.json({ error: 'Mindestens ein Stop erforderlich.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const warnungen: string[] = []

  const { data: caregiver, error: cgError } = await admin
    .from('caregivers')
    .select('id, first_name, last_name, zip_code, wochenstunden_soll')
    .eq('id', caregiver_id)
    .eq('organization_id', auth.ctx.organizationId)
    .single()
  if (cgError || !caregiver) {
    return NextResponse.json({ error: 'Mitarbeiter nicht gefunden.' }, { status: 404 })
  }

  // ── P1-30 Fix: Verfügbarkeit VOR dem Anlegen neuer Assignments prüfen,
  //    damit bei 422 keine Orphan-Assignments zurückbleiben. ──────────
  // Zeitfenster vorab aus den Input-Stops sammeln
  const vorabStartZeiten: string[] = []
  const vorabEndZeiten: string[] = []
  for (const s of stops) {
    if (s.geplante_ankunft) vorabStartZeiten.push(s.geplante_ankunft)
    if (s.geplantes_ende) vorabEndZeiten.push(s.geplantes_ende)
  }
  // Für assignment_id-Stops die Zeiten aus der DB laden
  const vorhandeneIds = stops.filter(s => s.assignment_id).map(s => s.assignment_id!)
  if (vorhandeneIds.length > 0) {
    const { data: vorhandene } = await admin
      .from('assignments')
      .select('start_time, end_time')
      .in('id', vorhandeneIds)
    for (const a of vorhandene ?? []) {
      if (a.start_time) vorabStartZeiten.push(a.start_time)
      if (a.end_time) vorabEndZeiten.push(a.end_time)
    }
  }
  vorabStartZeiten.sort()
  vorabEndZeiten.sort()

  // Verfügbarkeit: Abwesenheit blockiert (außer force_override), Zeitfenster warnt
  const befund = await pruefeCaregiverVerfuegbarkeit(
    admin, caregiver_id, tour_date,
    vorabStartZeiten[0] ?? null,
    vorabEndZeiten[vorabEndZeiten.length - 1] ?? null
  )
  if (befund.abwesend && !force_override) {
    return NextResponse.json({
      error: `Mitarbeiter ist am ${tour_date} abwesend (${befund.abwesenheitsGrund}).`,
      hinweis: 'Mit force_override: true kann die Tour trotzdem angelegt werden, oder /api/tours/{id}/vertretung nutzen.',
    }, { status: 422 })
  }
  if (befund.abwesend) warnungen.push(`Abwesenheit übersteuert: ${befund.abwesenheitsGrund}.`)
  if (befund.ausserhalbZeitfenster) warnungen.push('Tour liegt außerhalb der gepflegten Verfügbarkeits-Zeitfenster.')

  // Stops auflösen (legt für client_id-Stops neue assignments an —
  // der Doppelbelegungs-Trigger meldet Konflikte als DOPPELBELEGUNG).
  // Verfügbarkeit ist bereits geprüft, kein Orphan-Risiko mehr.
  const aufgeloest = await aufloeseStops(admin, {
    stops,
    caregiverId: caregiver_id,
    tourDate: tour_date,
    organizationId: auth.ctx.organizationId,
    createdBy: auth.ctx.userId,
  })
  if (aufgeloest.fehler) {
    const status = aufgeloest.fehler.includes('DOPPELBELEGUNG') ? 409 : 422
    return NextResponse.json({ error: aufgeloest.fehler }, { status })
  }

  // Fahrtzeiten entlang der Route (Start: Wohn-PLZ des Mitarbeiters)
  const mitFahrt = reichereFahrtzeitenAn(aufgeloest.stops, caregiver.zip_code ?? null)

  // Zeitplan-Konsistenz
  const zeitplanWarnungen = pruefeZeitplan(
    mitFahrt.map((s, i) => ({
      position: i + 1,
      geplante_ankunft: s.geplante_ankunft,
      geplantes_ende: s.geplantes_ende,
      fahrzeit_minuten: s.fahrzeit_minuten,
    }))
  )
  warnungen.push(...zeitplanWarnungen.map(w => w.text))

  // Wochenkapazität (Montag–Sonntag der Tourwoche)
  const datum = new Date(tour_date + 'T00:00:00Z')
  const wochentag = datum.getUTCDay() === 0 ? 7 : datum.getUTCDay()
  const montag = new Date(datum); montag.setUTCDate(datum.getUTCDate() - (wochentag - 1))
  const sonntag = new Date(montag); sonntag.setUTCDate(montag.getUTCDate() + 6)
  const { data: wochenTouren } = await admin
    .from('tours')
    .select('id, gesamt_fahrzeit_minuten, tour_stops(geplante_ankunft, geplantes_ende, fahrzeit_minuten)')
    .eq('caregiver_id', caregiver_id)
    .gte('tour_date', datumBerlin(montag))
    .lte('tour_date', datumBerlin(sonntag))
    .neq('status', 'STORNIERT')
  const verplant = (wochenTouren ?? []).reduce((summe, t) =>
    summe + tourGesamtMinuten((t.tour_stops ?? []).map((s, i) => ({
      position: i + 1,
      geplante_ankunft: s.geplante_ankunft,
      geplantes_ende: s.geplantes_ende,
      fahrzeit_minuten: s.fahrzeit_minuten,
    }))), 0)
  const neueMinuten = tourGesamtMinuten(mitFahrt.map((s, i) => ({
    position: i + 1,
    geplante_ankunft: s.geplante_ankunft,
    geplantes_ende: s.geplantes_ende,
    fahrzeit_minuten: s.fahrzeit_minuten,
  })))
  const kapazitaet = pruefeWochenkapazitaet({
    wochenstundenSoll: caregiver.wochenstunden_soll,
    verplanteMinutenWoche: verplant,
    neueMinuten,
  })
  if (kapazitaet.text) warnungen.push(kapazitaet.text)

  // Tour + Stops schreiben
  const { data: tour, error: tourError } = await admin
    .from('tours')
    .insert({
      organization_id: auth.ctx.organizationId,
      caregiver_id,
      tour_date,
      name: name || null,
      status: 'GEPLANT',
      start_zeit: mitFahrt[0]?.geplante_ankunft ?? null,
      ende_zeit: mitFahrt[mitFahrt.length - 1]?.geplantes_ende ?? null,
      notes: notes || null,
      created_by: auth.ctx.userId,
    })
    .select('id')
    .single()
  if (tourError || !tour) {
    return NextResponse.json({ error: uebersetzeDbFehler(tourError ?? { message: 'Tour konnte nicht angelegt werden.' }) }, { status: 500 })
  }

  const { error: stopsError } = await admin.from('tour_stops').insert(
    mitFahrt.map((s, i) => ({
      organization_id: auth.ctx.organizationId,
      tour_id: tour.id,
      assignment_id: s.assignment_id,
      client_id: s.client_id,
      position: i + 1,
      geplante_ankunft: s.geplante_ankunft,
      geplantes_ende: s.geplantes_ende,
      fahrzeit_minuten: s.fahrzeit_minuten,
      distanz_km: s.distanz_km,
      adresse: s.adresse,
      plz: s.plz,
      status: 'GEPLANT',
      notes: s.notes,
    }))
  )
  if (stopsError) {
    // Tour ohne Stops wieder entfernen, damit kein leerer Torso bleibt
    await admin.from('tours').delete().eq('id', tour.id)
    return NextResponse.json({ error: uebersetzeDbFehler(stopsError) }, { status: 500 })
  }

  // D1-Fix: Audit-Trail bei force_override
  if (force_override && warnungen.length > 0) {
    await logBillingAction(admin, {
      entityType: 'invoice',
      organizationId: auth.ctx.organizationId,
      entityId: `tour-override-${tour.id}`,
      action: 'force_override',
      newState: {
        tour_id: tour.id,
        caregiver_id,
        tour_date,
        overridden_checks: warnungen,
      },
      reason: body.grund || body.override_reason || 'Keine Begruendung angegeben',
      actorId: auth.ctx.userId,
      actorRole: 'admin',
    })
  }

  const { data: komplett } = await admin
    .from('tours')
    .select(TOUR_SELECT)
    .eq('id', tour.id)
    .single()

  return NextResponse.json(
    { ...(komplett as unknown as TourZeile), warnungen: warnungen.length > 0 ? warnungen : undefined },
    { status: 201 }
  )
}
