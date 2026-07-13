// ═══════════════════════════════════════════════════════════
// GET /api/engel/match — Engel-Discovery MIT Standort-Filter
// ═══════════════════════════════════════════════════════════
// Warum serverseitig? Die PLZ der Engel ist PII und wird bewusst
// NICHT an den Browser geliefert (siehe Migration
// 20260705_engel_cards_rpc_safe_columns.sql). Der PLZ-Vergleich
// muss also auf dem Server passieren:
//   1. Karten über die bestehende sichere RPC get_engel_cards
//      (User-Session, kein PII im Payload).
//   2. Engel-PLZ nur serverseitig per Service-Role lesen und mit
//      der Kunden-PLZ abgleichen (Distanz, s. lib/plz-match.ts).
//   3. Nur die gematchten Karten zurückgeben — Response-Form ist
//      identisch zur RPC, plus Meta-Flag `filtered`.
//
// Edge Cases:
//   - Kunde ohne PLZ  → kein Filter möglich → alle Engel + filtered:false
//   - Engel ohne PLZ  → wird beim Filtern ausgeschlossen (fail-safe)
//   - Zone unbekannt + Geocoding down → Leitregions-Fallback
// ═══════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { geocodePLZ } from '@/lib/geocoding'
import { resolvePlz } from '@/lib/hessen-plz'
import { matchPlz } from '@/lib/plz-match'

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

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  }

  // Sichere Karten mit der Session des Users laden (RPC filtert
  // Test-Engel + Offline-Engel bereits serverseitig raus)
  const { data: cards, error: rpcError } = await supabase.rpc('get_engel_cards', {
    p_only_online: true,
  })
  if (rpcError) {
    return NextResponse.json({ error: 'Engel konnten nicht geladen werden' }, { status: 500 })
  }
  const allCards: any[] = cards || []

  const admin = createAdminClient()

  // Kunden-PLZ (postal_code, sonst PLZ aus location-Freitext)
  const { data: me } = await admin
    .from('profiles')
    .select('postal_code, location')
    .eq('id', user.id)
    .single()
  const customerPlz = resolvePlz(me?.postal_code, me?.location)

  // Ohne Kunden-PLZ ist kein Standort-Filter möglich → alle zeigen,
  // das Frontend weist den Kunden auf die fehlende PLZ hin.
  if (!customerPlz) {
    return NextResponse.json({ engel: allCards, filtered: false, customerPlz: null })
  }

  // Engel-PLZ NUR serverseitig lesen — verlässt den Server nicht
  const engelIds = allCards.map(c => c.id).filter(Boolean)
  const plzById = new Map<string, string | null>()
  if (engelIds.length > 0) {
    const { data: engelRows } = await admin
      .from('profiles')
      .select('id, postal_code, location')
      .in('id', engelIds)
    for (const row of engelRows || []) {
      plzById.set(row.id, resolvePlz(row.postal_code, row.location))
    }
  }

  const matched = (
    await Promise.all(
      allCards.map(async card => {
        const engelPlz = plzById.get(card.id)
        // Engel ohne hinterlegte PLZ: Standort unbekannt → nicht anzeigen
        if (!engelPlz) return null
        return (await matchPlz(customerPlz, engelPlz, geocodeCached)) ? card : null
      })
    )
  ).filter(Boolean)

  return NextResponse.json({ engel: matched, filtered: true, customerPlz })
}
