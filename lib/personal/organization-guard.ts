// ═══════════════════════════════════════════════════════════════
// Mandantenschutz für caregiver_id aus dem Request-Body
//
// Jede Schreibroute der Personalverwaltung arbeitet mit
// `createAdminClient()` — dem Dienstschlüssel, der RLS umgeht. Gespeichert
// wird `organization_id` aus dem Auth-Kontext (vertrauenswürdig) und
// `caregiver_id` aus dem Body (NICHT vertrauenswürdig). Ohne diese Prüfung
// entsteht eine Zeile, die im EIGENEN Mandanten liegt, aber auf einen
// FREMDEN Mitarbeiter zeigt.
//
// Das ist keine bloße Unsauberkeit, sondern ein Leseweg nach draußen: drei
// Auswertungs-Views joinen `caregivers` ausschließlich über
// `caregiver_id`, ohne die Organisation gegenzuprüfen (live am 27.08.2026
// aus pg_views gelesen) —
//
//   personal_urlaubsuebersicht  → JOIN caregivers ON cg.id = uk.caregiver_id
//                                 (+ LEFT JOIN absences, ebenfalls ohne Fence)
//   qualifikation_ablauf_warnung → JOIN caregivers ON cg.id = cq.caregiver_id
//   personal_arbeitszeitkonto    → JOIN caregivers ON cg.id = az.caregiver_id
//
// — und jede dieser Views wird von der Anwendung über
// `.eq('organization_id', <eigene Org>)` gefiltert. Die gefilterte Spalte
// ist aber die der EIGENEN Zeile, nicht die des gejointen Mitarbeiters.
// Wer also eine Zeile mit fremder `caregiver_id` anlegt, bekommt in seiner
// eigenen Übersicht den Klarnamen des fremden Mitarbeiters geliefert, dazu
// je nach View dessen Einsatzfreigabe-Kennzeichen bzw. die Zahl seiner
// offenen Urlaubsanträge.
//
// Der Fence gehört deshalb VOR das Schreiben und in den Code — eine
// RLS-Policy hilft hier nicht, weil der Dienstschlüssel sie umgeht.
//
// Gleiches Muster wie lib/clients/organization-guard.ts für `client_id`.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { UserFacingError } from '@/lib/api/user-facing-error'

/**
 * Gehört der Mitarbeiter zur Organisation? Fail-closed: ein Lesefehler
 * beantwortet die Frage NICHT mit „ja".
 */
export async function caregiverGehoertZuOrg(
  supabase: SupabaseClient,
  caregiverId: string,
  organizationId: string,
): Promise<boolean> {
  if (!caregiverId || !organizationId) return false
  const { data, error } = await supabase
    .from('caregivers')
    .select('id')
    .eq('id', caregiverId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) return false
  return !!data
}

/**
 * Wirft, wenn der Mitarbeiter nicht zur Organisation gehört.
 *
 * 404 statt 403: die Unterscheidung „gibt es nicht" / „gehört jemand
 * anderem" wäre selbst schon eine Auskunft über fremde Bestände. Gleicher
 * Status wie `sammleVoraussetzungen` in lib/personal/einsatzfreigabe.ts,
 * damit die Oberfläche beide Fälle gleich behandeln kann.
 */
export async function assertCaregiverInOrg(
  supabase: SupabaseClient,
  caregiverId: string | null | undefined,
  organizationId: string,
): Promise<void> {
  if (!caregiverId || typeof caregiverId !== 'string' || !caregiverId.trim()) {
    throw new UserFacingError('Mitarbeiter ist ein Pflichtfeld.', 400)
  }
  const ok = await caregiverGehoertZuOrg(supabase, caregiverId, organizationId)
  if (!ok) {
    throw new UserFacingError('Mitarbeiter nicht gefunden.', 404)
  }
}
