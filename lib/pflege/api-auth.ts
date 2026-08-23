// ═══════════════════════════════════════════════════════════════
// Auth-Guard für app/api/pflege/** — analog lib/akten/api-auth.ts
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { rolleDarf } from '@/lib/auth/guard'
import type { Berechtigung } from '@/lib/auth/rollen'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'

export interface PflegeAuthContext {
  userId: string
  organizationId: string
  role: string
  name: string
}

export type PflegeAuthResult =
  | { ok: true; ctx: PflegeAuthContext }
  | { ok: false; response: NextResponse }

/**
 * Guard mit Organisationszuordnung — für alle /api/pflege-Routen.
 *
 * Rollenkonzept (lib/auth/rollen.ts): der Guard prueft nicht mehr auf
 * „ist Admin", sondern auf eine BERECHTIGUNG. admin/superadmin haben alle,
 * pdl/qm/buchhaltung nur die ihrer Aufgabe. Der Default ist die
 * Lese-Berechtigung des Fachbereichs; schreibende Routen uebergeben die
 * Schreib-Berechtigung ausdruecklich.
 */
export async function requirePflegeAdmin(
  berechtigung: Berechtigung = 'pflege.lesen'
): Promise<PflegeAuthResult> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  if (!profile || !rolleDarf(profile.role, berechtigung)) {
    return { ok: false, response: NextResponse.json({ error: 'Für diesen Bereich fehlt Ihnen die Berechtigung.' }, { status: 403 }) }
  }

  // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
  // NICHT an profiles — profiles hat keine organization_id-Spalte.
  const organizationId = await getActiveOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Alltagsengel'

  return {
    ok: true,
    ctx: { userId: user.id, organizationId, role: profile.role, name },
  }
}

/**
 * Auth-Guard für schreibende Engel-Routen (Verlaufseintrag erstellen).
 * Prüft nur den eingeloggten User — welche Kunden er sehen/beschreiben darf,
 * entscheidet RLS (engel_pflege_verlauf_insert über aktive assignments).
 */
export async function requirePflegeUser(): Promise<
  { ok: true; userId: string; role: string; name: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Nicht autorisiert.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .single()

  // Gültiger Token ohne Profil-Zeile darf NICHT still als 'engel' durchrutschen —
  // sonst bekäme ein profilloser Account Engel-Schreibrechte (analog requirePflegeAdmin).
  if (!profile) {
    return { ok: false, response: NextResponse.json({ error: 'Kein Profil gefunden.' }, { status: 403 }) }
  }

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Alltagsengel'
  return { ok: true, userId: user.id, role: profile.role ?? 'engel', name }
}
