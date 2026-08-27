import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOpsAdmin } from '@/lib/ops/api-auth'
import { apiErrorResponse } from '@/lib/api/error-sanitizer'
import { storniereGeloesteAssignments, uebersetzeDbFehler } from '@/lib/touren/server'
import { assertTourUebergang, schreibeAufAssignment } from '@/lib/touren/stops'
import { TOUR_SELECT, type TourZeile } from '@/lib/touren/select'
import { withTracking } from '@/lib/monitoring/tracker'

/**
 * Einsätze einer stornierten Tour mitstornieren. Ohne das bleiben sie
 * GEPLANT: sie blockieren die Zeit des Mitarbeiters über
 * check_assignment_overlap und stehen weiter in Kalender und Engel-App.
 * Bereits abgeschlossene Stops bleiben unangetastet (Leistungsnachweis).
 */
async function storniereTourEinsaetze(
  admin: ReturnType<typeof createAdminClient>,
  tourId: string
): Promise<void> {
  const { data: stops } = await admin
    .from('tour_stops')
    .select('id, assignment_id, status')
    .eq('tour_id', tourId)
  const offen = (stops ?? []).filter(s => s.status !== 'ABGESCHLOSSEN')
  if (offen.length === 0) return
  await storniereGeloesteAssignments(
    admin,
    offen.map(s => s.assignment_id),
    { ignoriereStopIds: offen.map(s => s.id) }
  )
}

// ── GET /api/tours/[id] ───────────────────────────────────────────
export const GET = withTracking(async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('einsatz.lesen')
  if (!auth.ok) return auth.response
  const { id } = await params

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tours')
    .select(TOUR_SELECT)
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .single()
  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: uebersetzeDbFehler(error) }, { status })
  }
  const tour = data as unknown as TourZeile
  return NextResponse.json({
    ...tour,
    tour_stops: [...(tour.tour_stops ?? [])].sort((a, b) => a.position - b.position),
  })
})

// ── PATCH /api/tours/[id] — Tourfelder/Status ändern ─────────────
export const PATCH = withTracking(async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('einsatz.schreiben')
  if (!auth.ok) return auth.response
  const { id } = await params

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  for (const feld of ['name', 'notes', 'status', 'start_zeit', 'ende_zeit', 'tour_date'] as const) {
    if (body[feld] !== undefined) updates[feld] = body[feld]
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen übergeben.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Ist-Stand VOR der Aenderung: ohne ihn liess sich der Status frei setzen
  // (eine ABGESCHLOSSENE Tour zurueck auf GEPLANT) und das Tourdatum
  // verschieben, ohne dass die Einsaetze mitwanderten.
  const { data: bestand } = await admin
    .from('tours')
    .select('id, status, tour_date, caregiver_id')
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .maybeSingle()
  if (!bestand) return NextResponse.json({ error: 'Tour nicht gefunden.' }, { status: 404 })

  const neuerStatus = updates.status === undefined ? null : String(updates.status)
  try {
    if (neuerStatus !== null) assertTourUebergang(bestand.status, neuerStatus)
  } catch (err) {
    return apiErrorResponse(err, req, 422)
  }

  // ── Tourdatum verschieben ───────────────────────────────────────
  // Die Einsaetze tragen das Datum selbst (assignments.assignment_date). Ein
  // Tourdatum ohne sie zu verschieben hiess: die Tour lag am neuen Tag, jeder
  // Einsatz weiterhin am alten — Kalender, Engel-App und Leistungsnachweis
  // folgten dem Einsatz, die Tourenuebersicht dem neuen Datum.
  if (updates.tour_date !== undefined && String(updates.tour_date) !== String(bestand.tour_date)) {
    const neuesDatum = String(updates.tour_date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(neuesDatum)) {
      return NextResponse.json({ error: 'tour_date muss das Format JJJJ-MM-TT haben.' }, { status: 400 })
    }
    const { data: stops } = await admin
      .from('tour_stops')
      .select('assignment_id, status')
      .eq('tour_id', id)
    const offene = (stops ?? []).filter(
      s => s.assignment_id && !['ABGESCHLOSSEN', 'AUSGEFALLEN'].includes(s.status),
    )
    // Ein abgeschlossener Stop bleibt, wo er war — sein Leistungsnachweis
    // traegt das Datum, an dem tatsaechlich gearbeitet wurde.
    if ((stops ?? []).some(s => s.status === 'ABGESCHLOSSEN')) {
      return NextResponse.json({
        error: 'Die Tour hat bereits abgeschlossene Stops — ihr Datum lässt sich nicht mehr verschieben.',
      }, { status: 422 })
    }
    const verschoben: string[] = []
    for (const s of offene) {
      const { error: aErr } = await admin
        .from('assignments')
        .update({ assignment_date: neuesDatum })
        .eq('id', s.assignment_id as string)
      if (aErr) {
        for (const id2 of verschoben) {
          await admin.from('assignments').update({ assignment_date: bestand.tour_date }).eq('id', id2)
        }
        const konflikt = aErr.message.includes('DOPPELBELEGUNG')
        return NextResponse.json({
          error: konflikt
            ? `Am ${neuesDatum} hat der Mitarbeiter bereits einen kollidierenden Termin — die Tour wurde NICHT verschoben.`
            : `${uebersetzeDbFehler(aErr)} — die Tour wurde NICHT verschoben.`,
        }, { status: konflikt ? 409 : 500 })
      }
      verschoben.push(s.assignment_id as string)
    }
  }

  // ── Stornierung aufheben ────────────────────────────────────────
  // Beim Stornieren werden die Einsaetze mitstorniert. Wird die Tour wieder
  // geoeffnet, muessen sie zurueck — sonst steht eine geplante Tour da, hinter
  // der kein einziger gueltiger Einsatz mehr haengt.
  if (neuerStatus === 'GEPLANT' && bestand.status === 'STORNIERT') {
    const { data: stops } = await admin
      .from('tour_stops')
      .select('assignment_id, status')
      .eq('tour_id', id)
    for (const s of (stops ?? []).filter(x => x.assignment_id && x.status === 'GEPLANT')) {
      const sync = await schreibeAufAssignment(admin, s.assignment_id as string, { status: 'GEPLANT' })
      if (!sync.ok) {
        return NextResponse.json(
          { error: `${sync.fehler} — die Tour bleibt storniert.` },
          { status: sync.doppelbelegung ? 409 : 500 },
        )
      }
    }
  }

  const { data, error } = await admin
    .from('tours')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .select(TOUR_SELECT)
    .single()
  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: uebersetzeDbFehler(error) }, { status })
  }
  if (neuerStatus === 'STORNIERT') await storniereTourEinsaetze(admin, id)
  return NextResponse.json(data)
})

// ── DELETE /api/tours/[id] — storniert (kein Hard-Delete) ────────
export const DELETE = withTracking(async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOpsAdmin('einsatz.schreiben')
  if (!auth.ok) return auth.response
  const { id } = await params

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tours')
    .update({ status: 'STORNIERT' })
    .eq('id', id)
    .eq('organization_id', auth.ctx.organizationId)
    .select('id, status')
    .single()
  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: uebersetzeDbFehler(error) }, { status })
  }
  await storniereTourEinsaetze(admin, id)
  return NextResponse.json(data)
})
