// ═══════════════════════════════════════════════════════════════
// EXPANSION — Admin-Guard für die API-Routen
// ═══════════════════════════════════════════════════════════════
// Wie lib/abrechnung/require-admin.ts, liefert zusätzlich die
// User-ID und die aktive Organisation. Jede Freischaltung braucht
// einen namentlich protokollierten Verantwortlichen (actor_id).
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { holeRollenQuellen, quellenDuerfen } from '@/lib/auth/rollen-quelle'
import type { Berechtigung } from '@/lib/auth/rollen'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'

export type AdminKontext =
  | { ok: true; userId: string; orgId: string }
  | { ok: false; response: NextResponse }

/**
 * Rollenkonzept (lib/auth/rollen.ts): der Guard prueft nicht mehr auf
 * „ist Admin", sondern auf eine BERECHTIGUNG. Der Default ist bewusst die
 * strengste ('system.verwalten' = nur Administration) — eine Route, die
 * hier nichts uebergibt, bleibt damit so eng wie vorher. Die Zuordnung
 * pro Bereich steht in lib/auth/bereiche.ts.
 */
export async function requireExpansionAdmin(
  berechtigung: Berechtigung = 'system.verwalten'
): Promise<AdminKontext> {
  const supabase = await createClient()
  const quellen = await holeRollenQuellen(supabase)
  if (!quellen) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 }),
    }
  }

  if (!quellenDuerfen(quellen, berechtigung)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Nur für Administratoren' }, { status: 403 }),
    }
  }

  const orgId = await getActiveOrgId()
  // Fail-closed (Audit MITTEL-1): keine Org-Mitgliedschaft => kein Zugriff.
  if (!orgId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }),
    }
  }
  return { ok: true, userId: quellen.userId, orgId }
}
