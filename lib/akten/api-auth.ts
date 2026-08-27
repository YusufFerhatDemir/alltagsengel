// ═══════════════════════════════════════════════════════════════
// Auth-Guard für app/api/akten/** — analog dem Inline-Pattern aus
// app/api/billing/dta/**/route.ts, hier als Helper gebündelt weil
// von 13 Routen identisch gebraucht.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { holeRollenQuellen, quellenDuerfen } from '@/lib/auth/rollen-quelle'
import type { Berechtigung } from '@/lib/auth/rollen'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'

export interface AktenAuthContext {
  userId: string
  organizationId: string
  role: string
}

export type AktenAuthResult =
  | { ok: true; ctx: AktenAuthContext }
  | { ok: false; response: NextResponse }

/** Admin/Superadmin-Guard mit Organisationszuordnung — für alle /admin/api/akten-Routen. */
/**
 * Rollenkonzept (lib/auth/rollen.ts): der Guard prueft nicht mehr auf
 * „ist Admin", sondern auf eine BERECHTIGUNG. admin/superadmin haben alle,
 * pdl/qm/buchhaltung nur die ihrer Aufgabe. Der Default ist die
 * Lese-Berechtigung des Fachbereichs; schreibende Routen uebergeben die
 * Schreib-Berechtigung ausdruecklich.
 */
export async function requireAktenAdmin(
  berechtigung: Berechtigung = 'stammdaten.lesen'
): Promise<AktenAuthResult> {
  const supabase = await createClient()
  const quellen = await holeRollenQuellen(supabase)
  if (!quellen) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  if (!quellenDuerfen(quellen, berechtigung)) {
    return { ok: false, response: NextResponse.json({ error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' }, { status: 403 }) }
  }

  // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
  // NICHT an profiles — profiles hat keine organization_id-Spalte.
  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  return { ok: true, ctx: { userId: quellen.userId, organizationId, role: quellen.rolle } }
}

/**
 * Auth-Guard für Kunden-/Engel-lesende Routen (z. B. Download).
 * Prüft nur eingeloggten User — die eigentliche Berechtigung auf die
 * konkrete Zeile läuft über RLS (kunde_akten_dokumente_select /
 * engel_akten_dokumente_select / admin_akten_dokumente).
 */
export async function requireAktenUser(): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }
  return { ok: true, userId: user.id }
}
