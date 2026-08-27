import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import {
  aufloeseStops,
  aktualisiereFahrtzeiten,
  storniereGeloesteAssignments,
  uebersetzeDbFehler,
  type StopInput,
} from '@/lib/touren/server'
import {
  assertStopUebergang,
  assertStopZeiten,
  assertTourOffen,
  assignmentStatusFuerStop,
  pruefeReihenfolge,
  schreibeAufAssignment,
  schreibeReihenfolge,
} from '@/lib/touren/stops'
import { STOP_SELECT, type StopZeile } from '@/lib/touren/select'
import { saveServiceRecord } from '@/lib/admin/service-records'
import { withTracking } from '@/lib/monitoring/tracker'

async function ladeTour(admin: ReturnType<typeof createAdminClient>, id: string, organizationId: string) {
  const { data } = await admin
    .from('tours')
    .select('id, caregiver_id, tour_date, status, caregivers:caregiver_id(first_name, last_name, initials, zip_code)')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()
  return data
}

// ── POST /api/tours/[id]/stops — Stop anhängen ────────────────────
export const POST = withTracking(async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('einsatz.schreiben')
  if (!auth.ok) return auth.response
  const { id } = await params

  const admin = createAdminClient()
  const tour = await ladeTour(admin, id, auth.ctx.organizationId)
  if (!tour) return NextResponse.json({ error: 'Tour nicht gefunden.' }, { status: 404 })

  const body = (await req.json()) as StopInput

  // Eine stornierte oder abgeschlossene Tour nimmt keine Stops mehr auf —
  // vorher liess sich an eine STORNIERTE Tour ein Stop haengen, der dann
  // samt neu angelegtem Einsatz die Zeit des Mitarbeiters blockierte,
  // waehrend die Tour selbst als storniert gefuehrt wurde.
  try {
    assertTourOffen(tour.status, 'Stops anzuhängen')
    assertStopZeiten(body.geplante_ankunft, body.geplantes_ende)
  } catch (err) {
    return apiErrorResponse(err, req, 422)
  }

  const aufgeloest = await aufloeseStops(admin, {
    stops: [body],
    caregiverId: tour.caregiver_id,
    tourDate: tour.tour_date,
    organizationId: auth.ctx.organizationId,
    createdBy: auth.ctx.userId,
  })
  if (aufgeloest.fehler) {
    const status = aufgeloest.fehler.includes('DOPPELBELEGUNG') ? 409 : 422
    return NextResponse.json({ error: aufgeloest.fehler }, { status })
  }

  const { data: maxPos } = await admin
    .from('tour_stops')
    .select('position')
    .eq('tour_id', id)
    .order('position', { ascending: false })
    .limit(1)
  const position = (maxPos?.[0]?.position ?? 0) + 1
  const s = aufgeloest.stops[0]

  const { data: neu, error } = await admin
    .from('tour_stops')
    .insert({
      organization_id: auth.ctx.organizationId,
      tour_id: id,
      assignment_id: s.assignment_id,
      client_id: s.client_id,
      position,
      geplante_ankunft: s.geplante_ankunft,
      geplantes_ende: s.geplantes_ende,
      adresse: s.adresse,
      plz: s.plz,
      status: 'GEPLANT',
      notes: s.notes,
    })
    .select(STOP_SELECT)
    .single()
  if (error) return NextResponse.json({ error: uebersetzeDbFehler(error) }, { status: 500 })

  const caregiver = Array.isArray(tour.caregivers) ? tour.caregivers[0] : tour.caregivers
  await aktualisiereFahrtzeiten(admin, id, caregiver?.zip_code ?? null)

  return NextResponse.json(neu, { status: 201 })
})

// ── PATCH /api/tours/[id]/stops — Stop ändern (Zeiten, Status,
//    Reihenfolge). body: { stop_id, …updates } oder
//    { reihenfolge: [stop_id, …] } für komplettes Umsortieren ─────
export const PATCH = withTracking(async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('einsatz.schreiben')
  if (!auth.ok) return auth.response
  const { id } = await params

  const admin = createAdminClient()
  const tour = await ladeTour(admin, id, auth.ctx.organizationId)
  if (!tour) return NextResponse.json({ error: 'Tour nicht gefunden.' }, { status: 404 })
  const caregiver = Array.isArray(tour.caregivers) ? tour.caregivers[0] : tour.caregivers

  const body = await req.json()

  try {
    assertTourOffen(tour.status, 'Stops zu ändern')
  } catch (err) {
    return apiErrorResponse(err, req, 422)
  }

  // ── Komplettes Umsortieren ──────────────────────────────────────
  if (body.reihenfolge !== undefined) {
    const { data: vorhanden } = await admin
      .from('tour_stops')
      .select('id')
      .eq('tour_id', id)
    const befund = pruefeReihenfolge(body.reihenfolge, (vorhanden ?? []).map(s => s.id as string))
    if (!befund.ok) {
      return NextResponse.json({ error: befund.fehler }, { status: 400 })
    }
    const geschrieben = await schreibeReihenfolge(admin, id, body.reihenfolge as string[])
    if (!geschrieben.ok) {
      return NextResponse.json({ error: geschrieben.fehler }, { status: 500 })
    }
    await aktualisiereFahrtzeiten(admin, id, caregiver?.zip_code ?? null)
    const { data: stops } = await admin
      .from('tour_stops')
      .select(STOP_SELECT)
      .eq('tour_id', id)
      .order('position', { ascending: true })
    return NextResponse.json(stops)
  }

  const { stop_id, ...rest } = body
  if (!stop_id) return NextResponse.json({ error: 'stop_id erforderlich.' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  for (const feld of ['geplante_ankunft', 'geplantes_ende', 'status', 'notes', 'tatsaechliche_ankunft', 'tatsaechliches_ende'] as const) {
    if (rest[feld] !== undefined) updates[feld] = rest[feld]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen übergeben.' }, { status: 400 })
  }

  // ── Bestand VOR der Änderung laden ──────────────────────────────
  // Nötig für drei Dinge, die vorher fehlten: den Statusübergang gegen den
  // Ist-Stand prüfen, die Zeiten im zusammengeführten Stand prüfen, und den
  // Einsatz VOR dem Stop schreiben (siehe unten).
  const { data: bestandRoh, error: bestandFehler } = await admin
    .from('tour_stops')
    .select(STOP_SELECT)
    .eq('id', stop_id)
    .eq('tour_id', id)
    .single()
  if (bestandFehler || !bestandRoh) {
    return NextResponse.json({ error: 'Stop nicht gefunden.' }, { status: 404 })
  }
  const bestand = bestandRoh as unknown as StopZeile

  const neuerStatus = updates.status === undefined ? null : String(updates.status)
  try {
    if (neuerStatus !== null) assertStopUebergang(bestand.status, neuerStatus)
    assertStopZeiten(
      updates.geplante_ankunft === undefined ? bestand.geplante_ankunft : (updates.geplante_ankunft as string | null),
      updates.geplantes_ende === undefined ? bestand.geplantes_ende : (updates.geplantes_ende as string | null),
    )
  } catch (err) {
    return apiErrorResponse(err, req, 422)
  }

  // Zeitstempel für Statuswechsel mitschreiben
  if (neuerStatus === 'BEIM_KLIENTEN' && updates.tatsaechliche_ankunft === undefined) {
    updates.tatsaechliche_ankunft = new Date().toISOString()
  }
  if (neuerStatus === 'ABGESCHLOSSEN' && updates.tatsaechliches_ende === undefined) {
    updates.tatsaechliches_ende = new Date().toISOString()
  }

  // ── Erst der Einsatz, dann der Stop ─────────────────────────────
  // Der Einsatz ist die Wahrheit für Kalender, Doppelbelegungs-Trigger und
  // Abrechnung. Schlägt er fehl, darf der Stop gar nicht erst umgeschrieben
  // werden — vorher lief es andersherum und ein verschluckter Fehler ließ
  // Stop und Einsatz mit verschiedenen Zeiten zurück.
  //
  // Der Status wird nur für die beiden Fälle mitgeschickt, die der
  // DB-Trigger `tour_stop_sync_assignment` NICHT spiegelt (GEPLANT und
  // AUSGEFALLEN). Die Vorwärts-Kette bleibt Sache des Triggers, damit hier
  // keine zweite Wahrheit entsteht. 'AUSGEFALLEN' läuft weiterhin über
  // storniereGeloesteAssignments (dort steht die Regel, wann ein Einsatz
  // wirklich frei ist).
  if (bestand.assignment_id) {
    const assignmentWerte: { start_time?: string; end_time?: string; status?: string } = {}
    if (updates.geplante_ankunft !== undefined) assignmentWerte.start_time = updates.geplante_ankunft as string
    if (updates.geplantes_ende !== undefined) assignmentWerte.end_time = updates.geplantes_ende as string
    if (neuerStatus === 'GEPLANT' && bestand.status !== 'GEPLANT') {
      // Reaktivierung: der Einsatz steht auf STORNIERT/GESTARTET/UNTERWEGS
      // und muss zurück, sonst bleibt der Stop ein Termin ohne Einsatz.
      assignmentWerte.status = assignmentStatusFuerStop('GEPLANT') as string
    }

    const sync = await schreibeAufAssignment(admin, bestand.assignment_id, assignmentWerte)
    if (!sync.ok) {
      return NextResponse.json({ error: sync.fehler }, { status: sync.doppelbelegung ? 409 : 500 })
    }
  }

  const { data: stopRoh, error } = await admin
    .from('tour_stops')
    .update(updates)
    .eq('id', stop_id)
    .eq('tour_id', id)
    .select(STOP_SELECT)
    .single()
  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: uebersetzeDbFehler(error) }, { status })
  }
  const stop = stopRoh as unknown as StopZeile

  // Leistungserfassung: bei Abschluss auf Wunsch Nachweis-Entwurf anlegen
  let serviceRecordFehler: string | null = null
  if (
    neuerStatus === 'ABGESCHLOSSEN' &&
    body.leistungsnachweis_anlegen === true &&
    !stop.service_record_id &&
    stop.client_id
  ) {
    const initialen = caregiver?.initials
      || [caregiver?.first_name?.[0], caregiver?.last_name?.[0]].filter(Boolean).join('.') + '.'
    // Ohne Zeiten am Stop entstünde ein Nachweis über 00:00–00:00, also über
    // null Minuten — er sähe vollständig aus und wäre nicht abrechenbar.
    if (!stop.geplante_ankunft || !stop.geplantes_ende) {
      serviceRecordFehler =
        'Der Stop hat keine Zeiten — ein Leistungsnachweis darüber wäre null Minuten lang. '
        + 'Bitte Ankunft und Ende am Stop eintragen und den Nachweis erneut anlegen.'
    } else {
      const gespeichert = await saveServiceRecord(admin, {
        client_id: stop.client_id,
        caregiver_id: tour.caregiver_id,
        date: tour.tour_date,
        start_time: stop.geplante_ankunft.slice(0, 5),
        end_time: stop.geplantes_ende.slice(0, 5),
        service_type: 'Alltagsbegleitung',
        budget_type: 'entlastung',
        caregiver_initials: initialen,
        status: 'draft',
        notes: `Aus Tourenplanung, Tour ${tour.tour_date}, Stop ${stop.position}`,
      })
      if (gespeichert.id) {
        await admin
          .from('service_records')
          .update({ assignment_id: stop.assignment_id, organization_id: auth.ctx.organizationId })
          .eq('id', gespeichert.id)
        await admin
          .from('tour_stops')
          .update({ service_record_id: gespeichert.id })
          .eq('id', stop_id)
        stop.service_record_id = gespeichert.id
      } else {
        serviceRecordFehler = gespeichert.error
      }
    }
  }

  // AUSGEFALLEN → Fahrtzeiten der Route neu rechnen (Stop wird umfahren)
  // und den verknüpften Einsatz stornieren, damit er die Zeit des
  // Mitarbeiters nicht weiter blockiert und nicht mehr im Kalender steht.
  if (neuerStatus === 'AUSGEFALLEN') {
    await storniereGeloesteAssignments(admin, [stop.assignment_id], { ignoriereStopIds: [stop_id] })
    await aktualisiereFahrtzeiten(admin, id, caregiver?.zip_code ?? null)
  }
  // Reaktivierung: der Stop wird wieder angefahren, die Route ändert sich.
  if (neuerStatus === 'GEPLANT' && bestand.status === 'AUSGEFALLEN') {
    await aktualisiereFahrtzeiten(admin, id, caregiver?.zip_code ?? null)
  }

  return NextResponse.json({
    ...(stop as StopZeile & Record<string, unknown>),
    leistungsnachweis_fehler: serviceRecordFehler ?? undefined,
  })
})

// ── DELETE /api/tours/[id]/stops?stop_id=… — nur geplante Stops ──
export const DELETE = withTracking(async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('einsatz.schreiben')
  if (!auth.ok) return auth.response
  const { id } = await params
  const stopId = new URL(req.url).searchParams.get('stop_id')
  if (!stopId) return NextResponse.json({ error: 'stop_id erforderlich.' }, { status: 400 })

  const admin = createAdminClient()
  const tour = await ladeTour(admin, id, auth.ctx.organizationId)
  if (!tour) return NextResponse.json({ error: 'Tour nicht gefunden.' }, { status: 404 })

  try {
    assertTourOffen(tour.status, 'Stops zu entfernen')
  } catch (err) {
    return apiErrorResponse(err, req, 422)
  }

  const { data: stop } = await admin
    .from('tour_stops')
    .select('id, status, assignment_id')
    .eq('id', stopId)
    .eq('tour_id', id)
    .single()
  if (!stop) return NextResponse.json({ error: 'Stop nicht gefunden.' }, { status: 404 })
  if (stop.status !== 'GEPLANT') {
    return NextResponse.json({ error: 'Nur geplante Stops können entfernt werden — laufende/abgeschlossene stattdessen auf AUSGEFALLEN setzen.' }, { status: 422 })
  }

  const { error } = await admin.from('tour_stops').delete().eq('id', stopId)
  if (error) return NextResponse.json({ error: uebersetzeDbFehler(error) }, { status: 500 })

  // Der Stop ist weg — sein Einsatz darf nicht als Geistertermin
  // zurückbleiben (blockiert sonst die Zeit und den Neu-Ansatz).
  await storniereGeloesteAssignments(admin, [stop.assignment_id])

  const caregiver = Array.isArray(tour.caregivers) ? tour.caregivers[0] : tour.caregivers
  await aktualisiereFahrtzeiten(admin, id, caregiver?.zip_code ?? null)
  return NextResponse.json({ ok: true })
})
