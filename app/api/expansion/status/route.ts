// ═══════════════════════════════════════════════════════════════
// GET /api/expansion/status
// ═══════════════════════════════════════════════════════════════
// Öffentliche Statusabfrage für Kunden-Web und Native-App.
//
//   /api/expansion/status?plz=60311
//   /api/expansion/status?bundesland=hessen
//   /api/expansion/status                  → alle 16 Bundesländer
//
// Liefert ausschließlich die öffentliche Sicht (state_settings_public):
// keine Bescheid-Pfade, keine Aktenzeichen, keine internen Notizen.
//
// Fail-safe: Bei jedem Fehler wird „Kasse aus" ausgeliefert, nie „Kasse an".
// ═══════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import {
  alleBundeslaender,
  bundeslandLage,
  bundeslandLageFuerLand,
} from '@/lib/expansion/state-settings'
import { DEFAULT_ORG_ID } from '@/lib/organizations/types'
import { logger } from '@/lib/logger'
const log = logger.child('expansion/status')

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const plz = params.get('plz')
    const bundesland = params.get('bundesland')
    const orgParam = params.get('org')
    const orgId = orgParam && UUID_RE.test(orgParam) ? orgParam : DEFAULT_ORG_ID

    // Einzelabfragen sind ENTSCHEIDUNGEN und werden nicht zwischengespeichert.
    //
    // Vorher stand hier 'public, max-age=60, stale-while-revalidate=300'.
    // Nach einer ABSCHALTUNG haette der Browser — und jeder geteilte Cache —
    // bis zu sechs Minuten weiter „Kassenabrechnung moeglich" ausgeliefert.
    // Das ist genau die Richtung, die nie passieren darf. Serverseitig
    // schuetzt die 30-Sekunden-Prozessablage die Datenbank; hier wird
    // deshalb bewusst frisch gelesen (frisch = true).
    if (plz) {
      const lage = await bundeslandLage(plz, orgId, true)
      return NextResponse.json(lage, { headers: { 'Cache-Control': 'no-store' } })
    }

    if (bundesland) {
      const lage = await bundeslandLageFuerLand(bundesland, orgId, true)
      return NextResponse.json(lage, { headers: { 'Cache-Control': 'no-store' } })
    }

    // Gesamtuebersicht ohne Parameter: reine Anzeige (Landingpages, Karten,
    // Native-Start). Hier ist eine kurze private Zwischenspeicherung
    // unkritisch — es haengt keine Abrechnungsentscheidung daran.
    const alle = await alleBundeslaender(orgId)
    return NextResponse.json(
      { bundeslaender: alle },
      { headers: { 'Cache-Control': 'private, max-age=30' } }
    )
  } catch (err) {
    log.errorWithException('Unerwarteter Fehler', err)
    // Fail-safe: lieber gar keine Freischaltung melden als eine falsche.
    return NextResponse.json(
      { error: 'Status konnte nicht ermittelt werden', kassenabrechnung: false },
      { status: 500 }
    )
  }
}
