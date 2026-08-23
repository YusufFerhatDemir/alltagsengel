import { NextResponse } from 'next/server'
import { rolleDarf } from '@/lib/auth/guard'
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

export async function requirePersonalUser(): Promise<
  { ok: true; userId: string; role: string; name: string; caregiverId: string | null } | { ok: false; response: NextResponse }
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

  // WICHTIG: NIE direkt gegen caregivers selektieren — die Tabelle hat fuer
  // Engel keine Self-Select-Policy (nur admin_all), ein direktes .from()
  // liefert hier still "keine Zeile" statt eines Fehlers und caregiverId
  // waere fuer JEDEN Engel dauerhaft null. eigene_caregiver_ids() ist eine
  // SECURITY DEFINER RPC und umgeht das (siehe Memory-Eintrag
  // engel-rls-caregivers-join-falle).
  const { data: caregiverIds } = await supabase.rpc('eigene_caregiver_ids')

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Alltagsengel'
  return { ok: true, userId: user.id, role: profile?.role ?? 'engel', name, caregiverId: caregiverIds?.[0] ?? null }
}
