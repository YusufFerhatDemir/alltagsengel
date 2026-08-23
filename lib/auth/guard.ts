// ═══════════════════════════════════════════════════════════════════════
// Serverseitiger Berechtigungs-Guard
// ═══════════════════════════════════════════════════════════════════════
//
// Fuer API-Routen, die eine bestimmte Berechtigung verlangen. Ergaenzt
// die Bereichs-Sperre in proxy.ts: die haelt die Oberflaeche zu, dieser
// Guard haelt die Schnittstelle zu. Ein Client-Guard, der ein Menue
// ausblendet, ist keine Sperre — er ist Kosmetik.
//
// Die Rolle wird IMMER serverseitig ermittelt und NIE aus user_metadata
// gelesen; siehe lib/auth/rollen.ts, Grundsatz 2.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/organizations/server'
import {
  hatAlleBerechtigungen,
  istAdministration,
  type Berechtigung,
} from './rollen'

export interface AuthKontext {
  userId: string
  rolle: string
  organizationId: string
  name: string
}

export type GuardErgebnis =
  | { ok: true; ctx: AuthKontext }
  | { ok: false; response: NextResponse }

function fehler(status: number, text: string): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error: text }, { status }) }
}

/**
 * Zweiter Faktor. Bewusst fail-open fuer Konten OHNE eingerichteten
 * Faktor — sonst sperrt man sie aus, bevor sie MFA einrichten koennen
 * (dafuer gibt es /admin/mfa-einrichtung). Gleiche Regel wie in
 * lib/abrechnung/require-admin.ts.
 */
async function pruefeAal2(supabase: SupabaseClient): Promise<NextResponse | null> {
  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (!aal) return null
    if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      return NextResponse.json(
        { error: 'Zweiter Faktor nicht verifiziert. Bitte erneut anmelden.' },
        { status: 403 },
      )
    }
  } catch {
    // Fail-open bei Fehlern der MFA-Abfrage — das Layout-Gate greift.
  }
  return null
}

/**
 * Autoritative Rolle des angemeldeten Nutzers.
 *
 * Reihenfolge wie in proxy.ts:
 *   1. app_metadata.role — nur ueber die Admin-API setzbar
 *   2. profiles.role     — durch prevent_role_escalation geschuetzt
 * user_metadata wird NICHT gelesen: dort kann sich jeder Nutzer selbst
 * eintragen, was er moechte.
 */
export async function holeRolle(): Promise<
  { userId: string; rolle: string; name: string; supabase: SupabaseClient } | null
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const appRole = (user.app_metadata?.role as string | undefined) || ''

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle()

  const rolle = appRole || profile?.role || ''
  if (!rolle) return null

  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Alltagsengel'
  return { userId: user.id, rolle, name, supabase }
}

export interface BerechtigungsOptionen {
  /** Organisation nicht aufloesen (fuer Routen ohne Mandantenbezug). */
  ohneOrganisation?: boolean
  /** MFA-Pruefung ueberspringen (nur fuer die MFA-Einrichtung selbst). */
  ohneMfa?: boolean
}

/**
 * Verlangt eine oder mehrere Berechtigungen. ALLE genannten muessen
 * vorliegen — eine Route, die Bankdaten UND Rechnungen anfasst, braucht
 * beides, nicht eines von beiden.
 */
export async function requireBerechtigung(
  berechtigung: Berechtigung | readonly Berechtigung[],
  optionen: BerechtigungsOptionen = {}
): Promise<GuardErgebnis> {
  const noetig = Array.isArray(berechtigung)
    ? (berechtigung as readonly Berechtigung[])
    : [berechtigung as Berechtigung]

  const auth = await holeRolle()
  if (!auth) return fehler(401, 'Nicht autorisiert.')

  if (!hatAlleBerechtigungen(auth.rolle, noetig)) {
    return fehler(403, 'Für diesen Bereich fehlt Ihnen die Berechtigung.')
  }

  if (!optionen.ohneMfa) {
    const block = await pruefeAal2(auth.supabase)
    if (block) return { ok: false, response: block }
  }

  if (optionen.ohneOrganisation) {
    return { ok: true, ctx: { userId: auth.userId, rolle: auth.rolle, organizationId: '', name: auth.name } }
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) return fehler(403, 'Keine Organisation zugewiesen.')

  return { ok: true, ctx: { userId: auth.userId, rolle: auth.rolle, organizationId, name: auth.name } }
}

/**
 * Nur admin/superadmin. Fuer die drei Vorbehaltsbereiche
 * (Tarifaenderung, Benutzerverwaltung, Systemeinstellungen) und fuer
 * Routen, die noch keine feinere Zuordnung haben.
 */
export async function requireAdministration(
  optionen: BerechtigungsOptionen = {}
): Promise<GuardErgebnis> {
  const auth = await holeRolle()
  if (!auth) return fehler(401, 'Nicht autorisiert.')
  if (!istAdministration(auth.rolle)) return fehler(403, 'Nur für Administratoren.')

  if (!optionen.ohneMfa) {
    const block = await pruefeAal2(auth.supabase)
    if (block) return { ok: false, response: block }
  }

  if (optionen.ohneOrganisation) {
    return { ok: true, ctx: { userId: auth.userId, rolle: auth.rolle, organizationId: '', name: auth.name } }
  }

  const organizationId = await getActiveOrgId()
  if (!organizationId) return fehler(403, 'Keine Organisation zugewiesen.')

  return { ok: true, ctx: { userId: auth.userId, rolle: auth.rolle, organizationId, name: auth.name } }
}

/**
 * Re-Export aus lib/auth/rollen.ts.
 *
 * rolleDarf() selbst ist eine reine Funktion und liegt bewusst DORT:
 * dieses Modul zieht next/server und den Server-Supabase-Client mit sich.
 * Wuerde eine Client-Komponente die Berechtigungsfrage stellen wollen,
 * brauchte sie den Import aus rollen.ts — sonst landet next/server im
 * Browser-Bundle (gleiche Falle wie bei UserFacingError).
 */
export { rolleDarf } from './rollen'
