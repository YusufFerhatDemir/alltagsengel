// ═══════════════════════════════════════════════════════════
// GET /api/engel/match — Engel-Discovery mit Standort- UND
//                        Verfügbarkeits-Filter
// ═══════════════════════════════════════════════════════════
// Warum serverseitig? Die PLZ der Engel ist PII und wird bewusst
// NICHT an den Browser geliefert (siehe Migration
// 20260705_engel_cards_rpc_safe_columns.sql). Der PLZ-Vergleich
// muss also auf dem Server passieren:
//   1. Karten über die bestehende sichere RPC get_engel_cards
//      (User-Session, kein PII im Payload).
//   2. Engel-PLZ nur serverseitig per Service-Role lesen und mit
//      der Kunden-PLZ abgleichen (Distanz, s. lib/plz-match.ts).
//      Nach außen geht nur die gerundete Distanz in km, nie die PLZ.
//   3. Optional: Zeitfenster aus angel_availability gegen den
//      Wunschtermin prüfen (s. lib/availability.ts).
//
// Query-Parameter (alle optional):
//   radius   Umkreis in km (Standard ENGEL_MATCH_RADIUS_KM)
//   date     Wunschtermin "YYYY-MM-DD"
//   time     Wunsch-Startzeit "HH:MM"
//   duration Dauer in Stunden (Standard 1)
// Nur wenn date UND time gesetzt sind, wird auf Verfügbarkeit gefiltert.
//
// Edge Cases:
//   - Kunde ohne PLZ  → kein Filter möglich → alle Engel + filtered:false
//   - Engel ohne PLZ  → wird beim Filtern ausgeschlossen (fail-safe)
//   - Engel ohne gepflegte Zeitfenster → Fallback auf Wochentags-Array,
//     sonst nicht ausgeschlossen (fail-open, s. lib/availability.ts)
// ═══════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { geocodePLZ, haversineDistance } from '@/lib/geocoding'
import { resolvePlz } from '@/lib/hessen-plz'
import { ENGEL_MATCH_RADIUS_KM, plzDistanceKm } from '@/lib/plz-match'
import { istVerfuegbar, type Zeitfenster } from '@/lib/availability'
import { getActiveOrgIdOrDefault } from '@/lib/organizations/server'
import { withTracking } from '@/lib/monitoring/tracker'

export const dynamic = 'force-dynamic'

// PLZ-Koordinaten ändern sich nie → Cache über Requests derselben
// Lambda-Instanz hinweg (null = Geocoding fehlgeschlagen, nicht cachen,
// damit ein API-Aussetzer sich nicht festsetzt).
const geoCache = new Map<string, { lat: number; lng: number }>()

async function geocodeCached(plz: string): Promise<{ lat: number; lng: number } | null> {
  const hit = geoCache.get(plz)
  if (hit) return hit
  // zippopotam.us antwortet normal <300ms — hartes Timeout, damit ein
  // Hänger die Buchungsstrecke nicht blockiert (dann Offline-Fallback).
  const result = await Promise.race([
    geocodePLZ(plz),
    new Promise<null>(resolve => setTimeout(() => resolve(null), 4000)),
  ])
  if (result) geoCache.set(plz, result)
  return result
}

/** Distanz in km — offline zuerst, Geocoding nur als Notnagel. */
async function distanzKm(plzA: string, plzB: string): Promise<number | null> {
  const offline = plzDistanceKm(plzA, plzB)
  if (offline !== null) return offline
  const [a, b] = await Promise.all([geocodeCached(plzA), geocodeCached(plzB)])
  if (a && b) return haversineDistance(a.lat, a.lng, b.lat, b.lng)
  // Letzter Fallback: gleiche Leitregion → als "im Umkreis" werten
  return plzA.slice(0, 2) === plzB.slice(0, 2) ? 0 : null
}

export const GET = withTracking(async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const radiusRoh = Number(params.get('radius'))
  const radiusKm = Number.isFinite(radiusRoh) && radiusRoh > 0
    ? Math.min(radiusRoh, 500)
    : ENGEL_MATCH_RADIUS_KM
  const datum = params.get('date')
  const uhrzeit = params.get('time')
  const dauerRoh = Number(params.get('duration'))
  const dauerStunden = Number.isFinite(dauerRoh) && dauerRoh > 0 ? dauerRoh : 1
  const pruefeZeit = Boolean(datum && uhrzeit)

  // Sichere Karten mit der Session des Users laden (RPC filtert
  // Test-Engel + Offline-Engel bereits serverseitig raus)
  const { data: cards, error: rpcError } = await supabase.rpc('get_engel_cards', {
    p_only_online: true,
  })
  if (rpcError) {
    return NextResponse.json({ error: 'Engel konnten nicht geladen werden' }, { status: 500 })
  }
  const allCards: any[] = cards || []
  const engelIds = allCards.map(c => c.id).filter(Boolean)

  const admin = createAdminClient()
  // Kundschaft ist nicht in organization_members gefuehrt — bewusster
  // Stamm-Org-Fallback (Audit MITTEL-1, dokumentierte Ausnahme).
  const orgId = await getActiveOrgIdOrDefault()

  // Kunden-PLZ (postal_code, sonst PLZ aus location-Freitext)
  const { data: me } = await admin
    .from('profiles')
    .select('postal_code, location')
    .eq('id', user.id)
    .single()
  const customerPlz = resolvePlz(me?.postal_code, me?.location)

  // Zeitfenster aller Engel in einem Rutsch laden (nur wenn gebraucht)
  const fensterById = new Map<string, Zeitfenster[]>()
  if (pruefeZeit && engelIds.length > 0) {
    const { data: slots } = await admin
      .from('angel_availability')
      .select('angel_id, weekday, start_time, end_time')
      .in('angel_id', engelIds)
    for (const slot of slots || []) {
      const liste = fensterById.get(slot.angel_id) || []
      liste.push(slot as Zeitfenster)
      fensterById.set(slot.angel_id, liste)
    }
  }

  const zeitPasst = (card: any) =>
    !pruefeZeit ||
    istVerfuegbar(
      fensterById.get(card.id) || [],
      card.availability,
      datum!,
      uhrzeit!,
      dauerStunden
    )

  // Ohne Kunden-PLZ ist kein Standort-Filter möglich → alle zeigen,
  // das Frontend weist den Kunden auf die fehlende PLZ hin.
  if (!customerPlz) {
    return NextResponse.json({
      engel: allCards.filter(zeitPasst),
      filtered: false,
      timeFiltered: pruefeZeit,
      radiusKm,
      customerPlz: null,
    })
  }

  // Engel-PLZ NUR serverseitig lesen — verlässt den Server nicht
  // org_fence: nur Engel der eigenen Organisation
  const plzById = new Map<string, string | null>()
  if (engelIds.length > 0) {
    let filteredIds = engelIds
    {
      const { data: members } = await admin
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', orgId)
        .in('user_id', engelIds)
      filteredIds = (members || []).map(m => m.user_id)
    }
    if (filteredIds.length > 0) {
      const { data: engelRows } = await admin
        .from('profiles')
        .select('id, postal_code, location')
        .in('id', filteredIds)
      for (const row of engelRows || []) {
        plzById.set(row.id, resolvePlz(row.postal_code, row.location))
      }
    }
  }

  const matched = (
    await Promise.all(
      allCards.map(async card => {
        if (!zeitPasst(card)) return null
        const engelPlz = plzById.get(card.id)
        // Engel ohne hinterlegte PLZ: Standort unbekannt → nicht anzeigen
        if (!engelPlz) return null
        const distanz = await distanzKm(customerPlz, engelPlz)
        if (distanz === null || distanz > radiusKm) return null
        // Gerundete Distanz ist unkritisch — die PLZ selbst bleibt intern
        return { ...card, distance_km: Math.round(distanz) }
      })
    )
  ).filter(Boolean) as any[]

  // Nächstgelegene Engel zuerst
  matched.sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0))

  return NextResponse.json({
    engel: matched,
    filtered: true,
    timeFiltered: pruefeZeit,
    radiusKm,
    customerPlz,
  })
})
