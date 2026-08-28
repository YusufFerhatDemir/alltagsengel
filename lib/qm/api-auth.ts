// ═══════════════════════════════════════════════════════════════
// Auth-Guard für app/api/qm/** — analog lib/pflege/api-auth.ts
//
// Eigener Guard und nicht `requirePflegeAdmin`, obwohl beide
// berechtigungsparametrisiert sind: die QM-Routen pruefen `qm.lesen` /
// `qm.schreiben`, und ein Guard, der „Pflege" heisst, aber ueber
// Qualitaetsmanagement entscheidet, laedt beim naechsten Umbau dazu ein,
// versehentlich die falsche Berechtigung als Default zu nehmen.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { holeRollenQuellen, quellenDuerfen, type RollenQuellen } from '@/lib/auth/rollen-quelle'
import type { Berechtigung } from '@/lib/auth/rollen'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'

export interface QmAuthContext {
  userId: string
  organizationId: string
  /** Wirksame Rolle als BESCHRIFTUNG (Protokoll, Anzeige). */
  role: string
  /** Beide Rollenquellen, fuer nachgelagerte Entscheidungen im Handler. */
  quellen: RollenQuellen
  name: string
}

export type QmAuthResult =
  | { ok: true; ctx: QmAuthContext }
  | { ok: false; response: NextResponse }

/**
 * Rollenkonzept (lib/auth/rollen.ts): geprueft wird eine BERECHTIGUNG,
 * nicht „ist Admin". admin/superadmin haben alle, pdl und qm haben
 * `qm.lesen` und `qm.schreiben`.
 *
 * Der Default ist die LESE-Berechtigung; schreibende Routen uebergeben
 * `qm.schreiben` ausdruecklich. Routen, die den Regelkreis schliessen
 * (eine Massnahme mit einem Befund verknuepfen), verlangen dagegen
 * `pflege.schreiben` — die hat die Rolle `qm` bewusst NICHT, weil sonst
 * dieselbe Stelle feststellt und abstellt.
 */
export async function requireQmAdmin(
  berechtigung: Berechtigung = 'qm.lesen'
): Promise<QmAuthResult> {
  const supabase = await createClient()
  const quellen = await holeRollenQuellen(supabase)
  if (!quellen) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  if (!quellenDuerfen(quellen, berechtigung)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' }, { status: 403 }),
    }
  }

  // Die Organisation haengt am organization_members-Mapping
  // (Org-Switcher-Cookie), NICHT an profiles — profiles hat keine
  // organization_id-Spalte.
  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  return {
    ok: true,
    ctx: {
      userId: quellen.userId,
      organizationId,
      role: quellen.rolle,
      quellen,
      name: quellen.name,
    },
  }
}
