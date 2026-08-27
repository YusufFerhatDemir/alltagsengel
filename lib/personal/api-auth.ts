import { NextResponse } from 'next/server'
import { holeRollenQuellen, quellenDuerfen } from '@/lib/auth/rollen-quelle'
import type { Berechtigung } from '@/lib/auth/rollen'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'

export interface PersonalAuthContext {
  userId: string
  organizationId: string
  role: string
  name: string
}

export type PersonalAuthResult =
  | { ok: true; ctx: PersonalAuthContext }
  | { ok: false; response: NextResponse }

/**
 * Rollenkonzept (lib/auth/rollen.ts): der Guard prueft nicht mehr auf
 * „ist Admin", sondern auf eine BERECHTIGUNG. admin/superadmin haben alle,
 * pdl/qm/buchhaltung nur die ihrer Aufgabe. Der Default ist die
 * Lese-Berechtigung des Fachbereichs; schreibende Routen uebergeben die
 * Schreib-Berechtigung ausdruecklich.
 */
export async function requirePersonalAdmin(
  berechtigung: Berechtigung = 'personal.lesen'
): Promise<PersonalAuthResult> {
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

  const name = quellen.name

  return {
    ok: true,
    ctx: { userId: quellen.userId, organizationId, role: quellen.rolle, name },
  }
}

export async function requirePersonalUser(): Promise<
  { ok: true; userId: string; role: string; name: string; caregiverId: string | null } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const quellen = await holeRollenQuellen(supabase)
  if (!quellen) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  // WICHTIG: NIE direkt gegen caregivers selektieren — die Tabelle hat fuer
  // Engel keine Self-Select-Policy (nur admin_all), ein direktes .from()
  // liefert hier still "keine Zeile" statt eines Fehlers und caregiverId
  // waere fuer JEDEN Engel dauerhaft null. eigene_caregiver_ids() ist eine
  // SECURITY DEFINER RPC und umgeht das (siehe Memory-Eintrag
  // engel-rls-caregivers-join-falle).
  const { data: caregiverIds } = await supabase.rpc('eigene_caregiver_ids')

  const name = quellen.name
  return { ok: true, userId: quellen.userId, role: quellen.rolle || 'engel', name, caregiverId: caregiverIds?.[0] ?? null }
}
