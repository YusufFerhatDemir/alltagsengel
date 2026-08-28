// ═══════════════════════════════════════════════════════════════════════
// Mandantenschutz fuer BENUTZER-IDs aus dem Request-Rumpf
//
// Gegenstueck zu lib/clients/organization-guard.ts (clientGehoertZuOrg)
// und lib/personal/organization-guard.ts (assertCaregiverInOrg) — dort
// geht es um den Klienten bzw. die Betreuungskraft als GEGENSTAND des
// Datensatzes, hier um die Person als URHEBER.
//
// WARUM eigener Helfer: mehrere Schreibwege uebernehmen eine Urheber-ID
// aus dem Rumpf (`erhobenVon`, `aufgenommenVon`, `hinzugefuegt_von`).
// Die Spalten sind `uuid REFERENCES auth.users(id)` — auth.users ist
// mandantenuebergreifend, die Fremdschluessel-Bedingung sagt also nur
// „irgendein Konto der Plattform" und gerade NICHT „ein Konto dieser
// Organisation". Geschrieben wird mit dem Dienstschluessel, RLS greift
// nicht. Ohne Pruefung traegt eine Pflegedokumentation eine Urheberschaft,
// die der Aufrufer frei gewaehlt hat.
//
// Die Zugehoerigkeit wird ueber DREI Wege aufgeloest, weil ein Konto auf
// unterschiedliche Weise an einer Organisation haengen kann (dieselbe
// Reihenfolge wie resolveUserOrgId in lib/organizations/server.ts):
//   1. organization_members — Buero-/Verwaltungskonten
//   2. caregivers.user_id   — Engel/Fahrdienst
//   3. clients.user_id      — Kundschaft
// ═══════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { UserFacingError } from '@/lib/api/user-facing-error'

/**
 * Gehoert das Konto zur Organisation?
 *
 * Fail-closed: eine leere/ungueltige ID ist ein Nein, kein „egal".
 * Datenbankfehler werden NICHT verschluckt — ein nicht lesbarer Bestand
 * darf nicht als „gehoert dazu" durchgehen.
 */
export async function benutzerGehoertZuOrg(
  supabase: SupabaseClient,
  benutzerId: string | null | undefined,
  organizationId: string,
): Promise<boolean> {
  if (typeof benutzerId !== 'string' || !benutzerId.trim()) return false
  if (typeof organizationId !== 'string' || !organizationId.trim()) return false

  const id = benutzerId.trim()

  const mitglied = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('user_id', id)
    .eq('organization_id', organizationId)
    .limit(1)
    .maybeSingle()
  if (mitglied.error) {
    throw new Error(`Benutzer konnte nicht geprueft werden: ${mitglied.error.message}`)
  }
  if (mitglied.data) return true

  const caregiver = await supabase
    .from('caregivers')
    .select('user_id')
    .eq('user_id', id)
    .eq('organization_id', organizationId)
    .limit(1)
    .maybeSingle()
  if (caregiver.error) {
    throw new Error(`Benutzer konnte nicht geprueft werden: ${caregiver.error.message}`)
  }
  if (caregiver.data) return true

  const client = await supabase
    .from('clients')
    .select('user_id')
    .eq('user_id', id)
    .eq('organization_id', organizationId)
    .limit(1)
    .maybeSingle()
  if (client.error) {
    throw new Error(`Benutzer konnte nicht geprueft werden: ${client.error.message}`)
  }
  return !!client.data
}

/**
 * Wie oben, wirft aber statt `false` zurueckzugeben.
 *
 * @param feld Beschriftung fuer die Fehlermeldung, z. B. 'Erhoben von'.
 */
export async function assertBenutzerInOrg(
  supabase: SupabaseClient,
  benutzerId: string | null | undefined,
  organizationId: string,
  feld = 'Benutzer',
): Promise<void> {
  if (!(await benutzerGehoertZuOrg(supabase, benutzerId, organizationId))) {
    throw new UserFacingError(
      `${feld}: Das angegebene Konto gehoert nicht zu dieser Organisation.`,
      404,
    )
  }
}
