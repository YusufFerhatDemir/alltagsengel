import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCaregiverSession } from '@/lib/native-auth'
import { checkWithinRadius } from '@/lib/geo'

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
// Body:
//   {
//     service_record_id: string
//     event_type: 'check_in' | 'check_out'
//     gps_lat: number
//     gps_lng: number
//     accuracy_m?: number
//   }
// ═══════════════════════════════════════════════════════════════

export async function POST(request: Request) {
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
      .select('id, caregiver_id, client_id')
      .eq('id', service_record_id)
      .single()

    if (recErr || !record) {
      return NextResponse.json({ error: 'Leistungsnachweis nicht gefunden' }, { status: 404 })
    }
    if (record.caregiver_id !== auth.caregiverId) {
      return NextResponse.json({ error: 'Kein Zugriff auf diesen Leistungsnachweis' }, { status: 403 })
    }

    const { data: location } = await admin
      .from('approved_locations')
      .select('gps_lat, gps_lng, radius_m')
      .eq('client_id', record.client_id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

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
      console.error('[api/native/geo-events] Insert-Fehler:', geoErr)
      return NextResponse.json({ error: 'Standort konnte nicht gespeichert werden' }, { status: 500 })
    }

    // Außerhalb des Radius: kein Hard-Block, aber Prüfeintrag für das Büro
    if (withinRadius === false) {
      const { error: reviewErr } = await admin.from('review_errors').insert({
        service_record_id,
        error_type: 'geo_mismatch',
        severity: 'warning',
        description: `${event_type === 'check_in' ? 'Check-in' : 'Check-out'} außerhalb des erwarteten Einsatzortes (${distanceM} m entfernt, Radius ${radiusM} m).`,
      })
      if (reviewErr) {
        console.error('[api/native/geo-events] review_errors-Fehler:', reviewErr)
      }
    }

    return NextResponse.json({
      success: true,
      geo_event_id: geoEvent.id,
      distance_to_client_m: distanceM,
      within_radius: withinRadius,
      radius_m: radiusM,
    })
  } catch (err) {
    console.error('[api/native/geo-events] Unerwarteter Fehler:', err)
    return NextResponse.json({ error: 'Interner Fehler' }, { status: 500 })
  }
}
