import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { logBillingAction } from '@/lib/billing/core/audit'
import {
  findeVertretungsKandidaten,
  pruefeCaregiverVerfuegbarkeit,
  aktualisiereFahrtzeiten,
  uebersetzeDbFehler,
} from '@/lib/touren/server'
import { TOUR_SELECT, type TourZeile } from '@/lib/touren/select'
import { withTracking } from '@/lib/monitoring/tracker'

// ── GET /api/tours/[id]/vertretung — Kandidaten vorschlagen ──────
export const GET = withTracking(async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('einsatz.lesen')
  if (!auth.ok) return auth.response
  const { id } = await params

  const admin = createAdminClient()
  const { data: tour, error } = await admin
    .from('tours')
    .select('id, caregiver_id, tour_date, tour_stops(client_id)')
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .single()
  if (error || !tour) {
    return NextResponse.json({ error: 'Tour nicht gefunden.' }, { status: 404 })
  }

  const kandidaten = await findeVertretungsKandidaten(admin, {
    organizationId: auth.ctx.organizationId,
    tourDate: tour.tour_date,
    ausgeschlossenCaregiverId: tour.caregiver_id,
    clientIds: [...new Set((tour.tour_stops ?? []).map(s => s.client_id).filter((c): c is string => !!c))],
  })
  return NextResponse.json(kandidaten)
})

// ── POST /api/tours/[id]/vertretung — Tour übertragen ────────────
// body: { neuer_caregiver_id, grund, force_override? }
export const POST = withTracking(async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('einsatz.schreiben')
  if (!auth.ok) return auth.response
  const { id } = await params

  const body = await req.json()
  const { neuer_caregiver_id, grund, force_override } = body as {
    neuer_caregiver_id?: string
    grund?: string
    force_override?: boolean
  }
  if (!neuer_caregiver_id || !grund) {
    return NextResponse.json({ error: 'Pflichtfelder: neuer_caregiver_id, grund (z. B. "Krankheit", "Urlaub").' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: tour, error: tourError } = await admin
    .from('tours')
    .select('id, caregiver_id, tour_date, status, start_zeit, ende_zeit, vertretung_fuer_caregiver_id')
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .single()
  if (tourError || !tour) {
    return NextResponse.json({ error: 'Tour nicht gefunden.' }, { status: 404 })
  }
  if (['ABGESCHLOSSEN', 'STORNIERT'].includes(tour.status)) {
    return NextResponse.json({ error: `Tour ist ${tour.status} — keine Vertretung mehr möglich.` }, { status: 422 })
  }
  if (neuer_caregiver_id === tour.caregiver_id) {
    return NextResponse.json({ error: 'Neuer Mitarbeiter ist bereits der Tour zugewiesen.' }, { status: 400 })
  }

  const { data: neuerCaregiver } = await admin
    .from('caregivers')
    .select('id, first_name, last_name, zip_code, einsatzfreigabe, status')
    .eq('id', neuer_caregiver_id)
    .eq('organization_id', auth.ctx.organizationId)
    .single()
  if (!neuerCaregiver) {
    return NextResponse.json({ error: 'Vertretungs-Mitarbeiter nicht gefunden.' }, { status: 404 })
  }

  const warnungen: string[] = []
  if (neuerCaregiver.status !== 'active') warnungen.push(`Mitarbeiter hat Status "${neuerCaregiver.status}".`)
  if (neuerCaregiver.einsatzfreigabe === false) {
    if (!force_override) {
      return NextResponse.json({
        error: 'Vertretungs-Mitarbeiter hat keine Einsatzfreigabe.',
        hinweis: 'Mit force_override: true übersteuern.',
      }, { status: 422 })
    }
    warnungen.push('Einsatzfreigabe übersteuert.')
  }

  const befund = await pruefeCaregiverVerfuegbarkeit(
    admin, neuer_caregiver_id, tour.tour_date, tour.start_zeit, tour.ende_zeit
  )
  if (befund.abwesend && !force_override) {
    return NextResponse.json({
      error: `Vertretung ist am ${tour.tour_date} selbst abwesend (${befund.abwesenheitsGrund}).`,
      hinweis: 'Mit force_override: true übersteuern.',
    }, { status: 422 })
  }
  if (befund.abwesend) warnungen.push(`Abwesenheit der Vertretung übersteuert: ${befund.abwesenheitsGrund}.`)
  if (befund.ausserhalbZeitfenster) warnungen.push('Tour liegt außerhalb der Verfügbarkeits-Zeitfenster der Vertretung.')

  if (force_override && warnungen.length > 0) {
    await logBillingAction(admin, {
      entityType: 'invoice',
      organizationId: auth.ctx.organizationId,
      entityId: `tour-vertretung-override-${id}`,
      action: 'force_override',
      newState: {
        tour_id: id,
        neuer_caregiver_id,
        grund,
        overridden_checks: warnungen,
      },
      reason: grund,
      actorId: auth.ctx.userId,
      actorRole: 'admin',
    })
  }

  // Verknüpfte Assignments umhängen — der Doppelbelegungs-Trigger
  // meldet Terminkonflikte der Vertretung (409)
  const { data: stops } = await admin
    .from('tour_stops')
    .select('id, assignment_id, status')
    .eq('tour_id', id)
  const offeneAssignments = (stops ?? [])
    .filter(s => s.assignment_id && !['ABGESCHLOSSEN', 'AUSGEFALLEN'].includes(s.status))
    .map(s => s.assignment_id as string)

  for (const assignmentId of offeneAssignments) {
    const { error: aError } = await admin
      .from('assignments')
      .update({ caregiver_id: neuer_caregiver_id })
      .eq('id', assignmentId)
    if (aError) {
      if (aError.message.includes('DOPPELBELEGUNG')) {
        return NextResponse.json({
          error: `Vertretung hat einen Terminkonflikt: ${aError.message}`,
        }, { status: 409 })
      }
      return NextResponse.json({ error: uebersetzeDbFehler(aError) }, { status: 500 })
    }
  }

  // Tour selbst umhängen; ursprünglichen Mitarbeiter festhalten
  const { data: aktualisiert, error: updateError } = await admin
    .from('tours')
    .update({
      caregiver_id: neuer_caregiver_id,
      vertretung_fuer_caregiver_id: tour.vertretung_fuer_caregiver_id ?? tour.caregiver_id,
      vertretung_grund: grund,
    })
    .eq('id', id)
    .select(TOUR_SELECT)
    .single()
  if (updateError) {
    return NextResponse.json({ error: uebersetzeDbFehler(updateError) }, { status: 500 })
  }

  // Fahrtzeiten neu: Startpunkt ist jetzt die Wohn-PLZ der Vertretung
  await aktualisiereFahrtzeiten(admin, id, neuerCaregiver.zip_code ?? null)

  return NextResponse.json({
    ...(aktualisiert as unknown as TourZeile),
    warnungen: warnungen.length > 0 ? warnungen : undefined,
  })
})
