import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import {
  aufloeseStops,
  aktualisiereFahrtzeiten,
  storniereGeloesteAssignments,
  uebersetzeDbFehler,
  type StopInput,
} from '@/lib/touren/server'
import { STOP_SELECT, type StopZeile } from '@/lib/touren/select'
import { saveServiceRecord } from '@/lib/admin/service-records'

const STOP_STATUS = ['GEPLANT', 'UNTERWEGS', 'BEIM_KLIENTEN', 'ABGESCHLOSSEN', 'AUSGEFALLEN']

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
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const admin = createAdminClient()
  const tour = await ladeTour(admin, id, auth.ctx.organizationId)
  if (!tour) return NextResponse.json({ error: 'Tour nicht gefunden.' }, { status: 404 })

  const body = (await req.json()) as StopInput
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
}

// ── PATCH /api/tours/[id]/stops — Stop ändern (Zeiten, Status,
//    Reihenfolge). body: { stop_id, …updates } oder
//    { reihenfolge: [stop_id, …] } für komplettes Umsortieren ─────
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  const admin = createAdminClient()
  const tour = await ladeTour(admin, id, auth.ctx.organizationId)
  if (!tour) return NextResponse.json({ error: 'Tour nicht gefunden.' }, { status: 404 })
  const caregiver = Array.isArray(tour.caregivers) ? tour.caregivers[0] : tour.caregivers

  const body = await req.json()

  // Komplettes Umsortieren
  if (Array.isArray(body.reihenfolge)) {
    const ids: string[] = body.reihenfolge
    const { data: vorhanden } = await admin
      .from('tour_stops')
      .select('id')
      .eq('tour_id', id)
    const vorhandenIds = new Set((vorhanden ?? []).map(s => s.id))
    if (ids.length !== vorhandenIds.size || ids.some(sid => !vorhandenIds.has(sid))) {
      return NextResponse.json({ error: 'reihenfolge muss exakt alle Stop-IDs der Tour enthalten.' }, { status: 400 })
    }
    // Zweiphasig gegen die (deferrable) Unique-Constraint
    for (let i = 0; i < ids.length; i++) {
      await admin.from('tour_stops').update({ position: 1000 + i }).eq('id', ids[i])
    }
    for (let i = 0; i < ids.length; i++) {
      await admin.from('tour_stops').update({ position: i + 1 }).eq('id', ids[i])
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
  if (updates.status && !STOP_STATUS.includes(updates.status as string)) {
    return NextResponse.json({ error: `Ungültiger Stop-Status. Erlaubt: ${STOP_STATUS.join(', ')}.` }, { status: 400 })
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen übergeben.' }, { status: 400 })
  }

  // Zeitstempel für Statuswechsel mitschreiben
  if (updates.status === 'BEIM_KLIENTEN' && updates.tatsaechliche_ankunft === undefined) {
    updates.tatsaechliche_ankunft = new Date().toISOString()
  }
  if (updates.status === 'ABGESCHLOSSEN' && updates.tatsaechliches_ende === undefined) {
    updates.tatsaechliches_ende = new Date().toISOString()
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

  // Zeiten auf assignments zurückschreiben, damit check_assignment_overlap greift
  if (stop.assignment_id && (updates.geplante_ankunft || updates.geplantes_ende)) {
    const assignmentUpdates: Record<string, unknown> = {}
    if (updates.geplante_ankunft) assignmentUpdates.start_time = updates.geplante_ankunft
    if (updates.geplantes_ende) assignmentUpdates.end_time = updates.geplantes_ende
    const { error: aErr } = await admin
      .from('assignments')
      .update(assignmentUpdates)
      .eq('id', stop.assignment_id)
    if (aErr) {
      const msg = uebersetzeDbFehler(aErr)
      if (msg.includes('DOPPELBELEGUNG') || aErr.code === '23514') {
        await admin.from('tour_stops').update({
          geplante_ankunft: stop.geplante_ankunft,
          geplantes_ende: stop.geplantes_ende,
        }).eq('id', stop_id)
        return NextResponse.json({ error: msg }, { status: 409 })
      }
    }
  }

  // Leistungserfassung: bei Abschluss auf Wunsch Nachweis-Entwurf anlegen
  let serviceRecordFehler: string | null = null
  if (
    updates.status === 'ABGESCHLOSSEN' &&
    body.leistungsnachweis_anlegen === true &&
    !stop.service_record_id &&
    stop.client_id
  ) {
    const initialen = caregiver?.initials
      || [caregiver?.first_name?.[0], caregiver?.last_name?.[0]].filter(Boolean).join('.') + '.'
    const gespeichert = await saveServiceRecord(admin, {
      client_id: stop.client_id,
      caregiver_id: tour.caregiver_id,
      date: tour.tour_date,
      start_time: (stop.geplante_ankunft ?? '00:00').slice(0, 5),
      end_time: (stop.geplantes_ende ?? '00:00').slice(0, 5),
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

  // AUSGEFALLEN → Fahrtzeiten der Route neu rechnen (Stop wird umfahren)
  // und den verknüpften Einsatz stornieren, damit er die Zeit des
  // Mitarbeiters nicht weiter blockiert und nicht mehr im Kalender steht.
  if (updates.status === 'AUSGEFALLEN') {
    await storniereGeloesteAssignments(admin, [stop.assignment_id], { ignoriereStopIds: [stop_id] })
    await aktualisiereFahrtzeiten(admin, id, caregiver?.zip_code ?? null)
  }

  return NextResponse.json({
    ...(stop as StopZeile & Record<string, unknown>),
    leistungsnachweis_fehler: serviceRecordFehler ?? undefined,
  })
}

// ── DELETE /api/tours/[id]/stops?stop_id=… — nur geplante Stops ──
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params
  const stopId = new URL(req.url).searchParams.get('stop_id')
  if (!stopId) return NextResponse.json({ error: 'stop_id erforderlich.' }, { status: 400 })

  const admin = createAdminClient()
  const tour = await ladeTour(admin, id, auth.ctx.organizationId)
  if (!tour) return NextResponse.json({ error: 'Tour nicht gefunden.' }, { status: 404 })

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
}
