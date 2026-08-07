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

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const plz = params.get('plz')
    const bundesland = params.get('bundesland')
    const orgParam = params.get('org')
    const orgId = orgParam && UUID_RE.test(orgParam) ? orgParam : DEFAULT_ORG_ID

    if (plz) {
      const lage = await bundeslandLage(plz, orgId)
      return NextResponse.json(lage, {
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
      })
    }

    if (bundesland) {
      const lage = await bundeslandLageFuerLand(bundesland, orgId)
      return NextResponse.json(lage, {
        headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
      })
    }

    // Ohne Parameter: Gesamtübersicht (für Landingpages, Karten, Native-Start)
    const alle = await alleBundeslaender(orgId)
    return NextResponse.json(
      { bundeslaender: alle },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } }
    )
  } catch (err) {
    console.error('[expansion/status] Unerwarteter Fehler:', err)
    // Fail-safe: lieber gar keine Freischaltung melden als eine falsche.
    return NextResponse.json(
      { error: 'Status konnte nicht ermittelt werden', kassenabrechnung: false },
      { status: 500 }
    )
  }
}
