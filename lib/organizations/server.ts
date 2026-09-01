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
 * Reihenfolge: Cookie (validiert gegen Mitgliedschaft) → erste Mitgliedschaft.
 *
 * FAIL-CLOSED (Security-Audit 2026-08-19, MITTEL-1):
 * Ohne eingeloggten User, ohne Mitgliedschaft in `organization_members` und
 * bei jeder Exception wird `null` geliefert — NICHT mehr still die Stamm-Org.
 * Vorher landete ein Admin ohne Mitgliedschaftszeile (oder ein transienter
 * DB-Fehler) unbemerkt in der Stamm-Organisation und sah deren Daten; die
 * Guards prüfen auf `!organizationId` und konnten deshalb nie greifen.
 *
 * Aufrufer, die bewusst einen Fallback auf die Stamm-Org wollen (z. B.
 * öffentliche Schreibpfade ohne Login), nutzen `getActiveOrgIdOrDefault()`.
 */
export async function getActiveOrgId(): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const cookieStore = await cookies()
    const fromCookie = cookieStore.get(ACTIVE_ORG_COOKIE)?.value
    const orgs = await getUserOrganizations(user.id)
    if (orgs.length === 0) return null
    if (fromCookie && UUID_RE.test(fromCookie) && orgs.some(o => o.id === fromCookie)) {
      return fromCookie
    }
    return orgs[0].id
  } catch {
    return null
  }
}

/**
 * Wie `getActiveOrgId()`, fällt aber bewusst auf die Stamm-Org zurück.
 *
 * NUR für Pfade ohne Auth-Kontext benutzen, bei denen eine Zuordnung
 * fachlich erzwungen ist (öffentliche Tracking-/Lead-Endpunkte, Onboarding
 * vor der ersten Mitgliedschaft). Für alles hinter einem Guard ist
 * `getActiveOrgId()` die richtige Funktion — ein `null` MUSS dort zu 403
 * führen, nicht zu einer stillen Stamm-Org-Zuordnung.
 */
export async function getActiveOrgIdOrDefault(): Promise<string> {
  return (await getActiveOrgId()) ?? DEFAULT_ORG_ID
}

/**
 * Organisation eines beliebigen eingeloggten Nutzers auflösen — auch für
 * Rollen, die NICHT in `organization_members` geführt werden.
 *
 * Reihenfolge:
 *   1. `organization_members` (Admins/Staff, inkl. Org-Switcher-Cookie)
 *   2. `caregivers.organization_id` (Engel)
 *   3. `clients.organization_id`    (Kundschaft / Angehörige über den Klienten)
 *   4. `null` — fail-closed
 *
 * Hintergrund (Security-Audit 2026-08-19, MITTEL-1): `organization_members`
 * wurde 2026-08-01 nur mit den damaligen Plattform-Admins befüllt. Engel und
 * Kundschaft haben dort keine Zeile — ein reines Membership-Lookup würde sie
 * fälschlich als „ohne Organisation" einstufen. Ihr Mandant steht aber sauber
 * am eigenen Datensatz (`caregivers` bzw. `clients` haben `organization_id`).
 * Damit ist diese Auflösung fail-closed UND korrekt mandantenbezogen — im
 * Gegensatz zum früheren stillen Fallback auf die Stamm-Org.
 */
export async function resolveUserOrgId(): Promise<string | null> {
  try {
    const vonMitgliedschaft = await getActiveOrgId()
    if (vonMitgliedschaft) return vonMitgliedschaft

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const admin = createAdminClient()

    // GEPRUEFT 01.09.2026 (Dienstschluessel-Pass) — die verworfenen
    // Fehler der beiden folgenden Abfragen sind hier die RICHTIGE
    // Richtung und bleiben bewusst stehen.
    //
    // Beide enden bei einem Fehler in `return null`, und `null` heisst
    // fuer jeden Aufrufer „keine Organisation" — also 403, nicht Zugang.
    // Der Kopf dieser Funktion nennt das fail-closed; das gilt fuer den
    // Fehlerfall genauso wie fuer den Fall ohne Treffer. Ein
    // Unterscheiden waere hier keine Verbesserung, sondern die Gefahr,
    // dass jemand den Fehlerzweig spaeter „grosszuegiger" behandelt.
    const { data: caregiver } = await admin
      .from('caregivers')
      .select('organization_id')
      .eq('user_id', user.id)
      .not('organization_id', 'is', null)
      .limit(1)
      .maybeSingle()
    if (caregiver?.organization_id) return caregiver.organization_id as string

    const { data: client } = await admin
      .from('clients')
      .select('organization_id')
      .eq('user_id', user.id)
      .not('organization_id', 'is', null)
      .limit(1)
      .maybeSingle()
    if (client?.organization_id) return client.organization_id as string

    return null
  } catch {
    return null
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
