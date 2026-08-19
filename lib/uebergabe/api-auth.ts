// ═══════════════════════════════════════════════════════════════
// Auth-Guard für app/api/uebergaben/** — analog lib/pflege/api-auth.ts
// Übergaben werden von Betreuungskräften geschrieben, nicht nur von
// Administratoren. Deshalb gibt es hier zusätzlich einen Guard, der
// jeden angemeldeten Mitarbeitenden samt Organisation auflöst.
// ═══════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserOrgId } from '@/lib/organizations/server'

export interface UebergabeAuthContext {
  userId: string
  organizationId: string
  role: string
  name: string
  caregiverId: string | null
  istAdmin: boolean
}

export type UebergabeAuthResult =
  | { ok: true; ctx: UebergabeAuthContext }
  | { ok: false; response: NextResponse }

const ADMIN_ROLLEN = ['admin', 'superadmin']

/** Jeder angemeldete Mitarbeitende mit gültiger Organisation. */
export async function requireUebergabeUser(): Promise<UebergabeAuthResult> {
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

  // Gültiger Token ohne Profil-Zeile darf nicht still durchrutschen.
  if (!profile) {
    return { ok: false, response: NextResponse.json({ error: 'Kein Profil gefunden.' }, { status: 403 }) }
  }

  const role = profile.role ?? 'engel'
  // Kunden und Angehörige haben in der Dienstübergabe nichts zu suchen.
  if (!['admin', 'superadmin', 'engel', 'caregiver', 'mitarbeiter'].includes(role)) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Berechtigung für Übergaben.' }, { status: 403 }) }
  }

  // Die Organisation haengt am organization_members-Mapping (Org-Switcher-Cookie),
  // NICHT an profiles — profiles hat keine organization_id-Spalte.
  const organizationId = await resolveUserOrgId()
  if (!organizationId) {
    return { ok: false, response: NextResponse.json({ error: 'Keine Organisation zugewiesen.' }, { status: 403 }) }
  }

  const { data: caregiver } = await supabase
    .from('caregivers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Alltagsengel'

  return {
    ok: true,
    ctx: {
      userId: user.id,
      organizationId,
      role,
      name,
      caregiverId: caregiver?.id ?? null,
      istAdmin: ADMIN_ROLLEN.includes(role),
    },
  }
}

/** Nur Administratoren — für löschende und protokollübergreifende Zugriffe. */
export async function requireUebergabeAdmin(): Promise<UebergabeAuthResult> {
  const auth = await requireUebergabeUser()
  if (!auth.ok) return auth
  if (!auth.ctx.istAdmin) {
    return { ok: false, response: NextResponse.json({ error: 'Nur für Administratoren.' }, { status: 403 }) }
  }
  return auth
}
