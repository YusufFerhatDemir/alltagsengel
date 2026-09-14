import { NextResponse } from 'next/server'
import { safeApiError } from '@/lib/api/error-sanitizer'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCaregiverSession } from '@/lib/native-auth'
import { checkWithinRadius } from '@/lib/geo'
import { logger } from '@/lib/logger'
import { withTracking } from '@/lib/monitoring/tracker'
const log = logger.child('api/native/geo-events')

// ═══════════════════════════════════════════════════════════════
// POST /api/native/geo-events
// ═══════════════════════════════════════════════════════════════
// Bridge für die Expo-App: Check-in/Check-out-Ereignis (EINMAL-Messung,
// kein Dauertracking). Prüft serverseitig die Distanz zur hinterlegten
// approved_locations-Adresse des Klienten (Haversine) und schreibt
// distance_to_client_m / within_radius. Liegt der Punkt außerhalb des
// Radius, wird das Ereignis trotzdem gespeichert (kein Hard-Block) und
// zusätzlich als review_errors-Eintrag (geo_mismatch) für die
// Büro-Prüfung protokolliert.
//
// MANDANT: geo_events und review_errors tragen organization_id NOT NULL
// mit Default current_org_id(). Diese Funktion liest auth.uid() — beim
// Dienstschluessel gibt es keinen angemeldeten Nutzer, und die Fallback-
// Kette endet in der fest verdrahteten Stamm-Organisation. Beide Inserts
// setzen die Organisation deshalb ausdruecklich aus der Session; ohne das
// landete jedes Standort-Ereignis und jeder Geo-Pruefeintrag jedes
// Mandanten im Bestand der Stamm-Organisation.
//
// Body:
//   {
//     service_record_id: string
//     event_type: 'check_in' | 'check_out'
//     gps_lat: number
//     gps_lng: number
//     accuracy_m?: number
//   }
// ═══════════════════════════════════════════════════════════════

export const POST = withTracking(async function POST(request: Request) {
  try {
    const auth = await requireCaregiverSession(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await request.json()
    const {
      service_record_id,
      event_type,
      gps_lat,
      gps_lng,
      accuracy_m,
    }: {
      service_record_id?: string
      event_type?: 'check_in' | 'check_out'
      gps_lat?: number
      gps_lng?: number
      accuracy_m?: number
    } = body

    if (!service_record_id || !event_type || gps_lat == null || gps_lng == null) {
      return NextResponse.json(
        { error: 'service_record_id, event_type, gps_lat und gps_lng erforderlich' },
        { status: 400 }
      )
    }
    if (!['check_in', 'check_out'].includes(event_type)) {
      return NextResponse.json({ error: 'Ungültiger event_type' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: record, error: recErr } = await admin
      .from('service_records')
      .select('id, caregiver_id, client_id, organization_id')
      .eq('id', service_record_id)
      .eq('organization_id', auth.organizationId)
      .single()

    if (recErr || !record) {
      return NextResponse.json({ error: 'Leistungsnachweis nicht gefunden' }, { status: 404 })
    }
    if (record.caregiver_id !== auth.caregiverId) {
      return NextResponse.json({ error: 'Kein Zugriff auf diesen Leistungsnachweis' }, { status: 403 })
    }

    // BEFUND (Block 54, 14.09.2026): hier stand `const { data: location }`
    // ohne Fehlerpruefung. Faellt die Abfrage aus — Rechteproblem, fehlende
    // Tabelle, Netz —, ist `location` null, und der Radius wird einfach
    // NICHT geprueft. „Kein genehmigter Ort hinterlegt" und „konnte nicht
    // nachsehen" sahen identisch aus, und beide endeten in einem
    // Anwesenheitsnachweis ohne Aussage.
    //
    // Fail-closed: wer nicht nachsehen kann, darf keinen Nachweis
    // schreiben, der so aussieht wie ein geprueter.
    const { data: location, error: ortFehler } = await admin
      .from('approved_locations')
      .select('gps_lat, gps_lng, radius_m')
      .eq('client_id', record.client_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (ortFehler) {
      log.errorWithException('Genehmigter Einsatzort nicht lesbar', ortFehler)
      return NextResponse.json(
        {
          error: 'Der genehmigte Einsatzort konnte nicht gelesen werden. Ohne ihn '
            + 'lässt sich die Anwesenheit nicht belegen; es wurde nichts gespeichert.',
        },
        { status: 503 },
      )
    }

    let distanceM: number | null = null
    let withinRadius: boolean | null = null
    const radiusM = location?.radius_m ?? 150

    if (location) {
      const check = checkWithinRadius(gps_lat, gps_lng, location.gps_lat, location.gps_lng, radiusM)
      distanceM = check.distanceM
      withinRadius = check.withinRadius
    }

    const { data: geoEvent, error: geoErr } = await admin
      .from('geo_events')
      .insert({
        service_record_id,
        organization_id: auth.organizationId,
        caregiver_id: auth.caregiverId,
        event_type,
        gps_lat,
        gps_lng,
        accuracy_m: accuracy_m ?? null,
        distance_to_client_m: distanceM,
        within_radius: withinRadius,
        radius_m: radiusM,
      })
      .select()
      .single()

    if (geoErr || !geoEvent) {
      log.errorWithException('Insert-Fehler', geoErr)
      return NextResponse.json({ error: 'Standort konnte nicht gespeichert werden' }, { status: 500 })
    }

    // Kein genehmigter Ort hinterlegt: der Nachweis entsteht, sagt aber
    // nichts aus.
    //
    // BEFUND (Block 54): fuer `within_radius === false` gab es einen
    // Pruefeintrag, fuer `null` NICHTS. Dabei ist `null` heute der
    // Normalfall — `approved_locations` ist live LEER (0 Zeilen bei 4
    // Klienten). Jeder Check-in waere damit als unpruefbar gespeichert
    // worden, und im Buero waere nie etwas aufgeschlagen: ein
    // Anwesenheitsnachweis, der wie einer aussieht und keiner ist.
    //
    // 'info' statt 'warning': es ist kein verdaechtiges Ereignis, sondern
    // eine fehlende Stammdatenpflege. Sichtbar muss sie trotzdem sein.
    if (withinRadius === null) {
      const { error: hinweisErr } = await admin.from('review_errors').insert({
        service_record_id,
        organization_id: auth.organizationId,
        error_type: 'geo_mismatch',
        severity: 'info',
        description:
          `${event_type === 'check_in' ? 'Check-in' : 'Check-out'} ohne Abgleich: für diesen `
          + 'Klienten ist kein genehmigter Einsatzort mit Koordinaten hinterlegt '
          + '(approved_locations). Der Standort wurde gespeichert, belegt aber keine '
          + 'Anwesenheit.',
      })
      if (hinweisErr) {
        log.errorWithException('review_errors-Hinweis nicht schreibbar', hinweisErr)
      }
    }

    // Außerhalb des Radius: kein Hard-Block, aber Prüfeintrag für das Büro
    if (withinRadius === false) {
      const { error: reviewErr } = await admin.from('review_errors').insert({
        service_record_id,
        organization_id: auth.organizationId,
        error_type: 'geo_mismatch',
        severity: 'warning',
        description: `${event_type === 'check_in' ? 'Check-in' : 'Check-out'} außerhalb des erwarteten Einsatzortes (${distanceM} m entfernt, Radius ${radiusM} m).`,
      })
      if (reviewErr) {
        log.errorWithException('review_errors-Fehler', reviewErr)
      }
    }

    return NextResponse.json({
      success: true,
      geo_event_id: geoEvent.id,
      distance_to_client_m: distanceM,
      within_radius: withinRadius,
      radius_m: radiusM,
      // Die App soll den Unterschied anzeigen koennen: ein Haekchen fuer
      // „im Radius" und dasselbe Haekchen fuer „ungeprueft" waere eine
      // Falschauskunft gegenueber der Pflegekraft.
      hinweis: withinRadius === null
        ? 'Kein genehmigter Einsatzort hinterlegt — der Standort wurde gespeichert, '
          + 'belegt aber keine Anwesenheit.'
        : null,
    })
  } catch (err) {
    return safeApiError(err, request)
  }
})
