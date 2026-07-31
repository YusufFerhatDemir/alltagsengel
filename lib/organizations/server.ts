// ═══════════════════════════════════════════════════════════════
// Multi-Mandant — Serverseitige Helper (nur in API-Routen/RSC nutzen)
// ═══════════════════════════════════════════════════════════════
// Kontrakt: Serverseitiger Code läuft mit dem Service-Role-Key und
// umgeht RLS (BYPASSRLS). Deshalb MUSS jede org-bewusste Server-Query
// die aktive Organisation explizit filtern/setzen:
//
//   const orgId = await getActiveOrgId()
//   supabase.from('clients').select().eq('organization_id', orgId)
//
// Die aktive Org kommt aus dem Cookie (Org-Switcher), wird gegen die
// tatsächliche Mitgliedschaft validiert und fällt sonst auf die
// Stamm-Org Alltagsengel zurück (Bestandsverhalten bleibt identisch).

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ACTIVE_ORG_COOKIE, DEFAULT_ORG_ID, type Organization, type OrgRole } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Alle Organisationen, in denen der User Mitglied ist (leer bei Fehler/fehlender Migration). */
export async function getUserOrganizations(userId: string): Promise<Array<Organization & { member_role: OrgRole }>> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('organization_members')
      .select('role, organizations(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    if (error || !data) return []
    return data
      .filter(row => row.organizations)
      .map(row => ({ ...(row.organizations as unknown as Organization), member_role: row.role as OrgRole }))
  } catch {
    return []
  }
}

/**
 * Aktive Organisation des eingeloggten Users bestimmen.
 * Reihenfolge: Cookie (validiert gegen Mitgliedschaft) → erste Mitgliedschaft → Stamm-Org.
 * Läuft auch, solange die Phase-3-Migration noch nicht angewendet ist
 * (dann immer Stamm-Org).
 */
export async function getActiveOrgId(): Promise<string> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return DEFAULT_ORG_ID

    const cookieStore = await cookies()
    const fromCookie = cookieStore.get(ACTIVE_ORG_COOKIE)?.value
    const orgs = await getUserOrganizations(user.id)
    if (orgs.length === 0) return DEFAULT_ORG_ID
    if (fromCookie && UUID_RE.test(fromCookie) && orgs.some(o => o.id === fromCookie)) {
      return fromCookie
    }
    return orgs[0].id
  } catch {
    return DEFAULT_ORG_ID
  }
}

/**
 * Auth-Guard für org-bezogene API-Routen: eingeloggter User, der Mitglied
 * der Ziel-Org ist (optional mit Mindestrolle).
 */
export async function requireOrgRole(
  organizationId: string,
  roles: OrgRole[] = ['owner', 'admin', 'staff']
): Promise<{ ok: true; userId: string; role: OrgRole } | { ok: false; status: number; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Nicht autorisiert' }

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership || !roles.includes(membership.role as OrgRole)) {
    return { ok: false, status: 403, error: 'Keine Berechtigung für diese Organisation' }
  }
  return { ok: true, userId: user.id, role: membership.role as OrgRole }
}
