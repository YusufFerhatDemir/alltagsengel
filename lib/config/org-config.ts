/**
 * P0-5: zentrale Org-Konfiguration — löst die IK-Nummer (Institutions-
 * kennzeichen) einer Organisation auf, statt sie an mehreren Stellen im
 * Code hart zu codieren (Audit-Befund audit/production-hardening).
 *
 * Reihenfolge: organizations-Tabelle (DB, sobald Migration
 * 20260801_phase3_multi_mandant_saas.sql auf Prod läuft) → Env-Variable
 * ALLTAGSENGEL_IK → Fehler. Kein hartcodierter Fallback-Wert mehr.
 *
 * Nimmt den Supabase-Client als Parameter entgegen statt selbst einen zu
 * erzeugen — funktioniert dadurch unverändert sowohl serverseitig (Admin-
 * Client) als auch in Client-Komponenten (RLS-Client), ohne dass diese
 * Datei server-only Abhängigkeiten in den Browser-Bundle zieht.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { DEFAULT_ORG_ID } from '@/lib/organizations/types'

/**
 * Liest die IK-Nummer einer Organisation.
 *
 * @param supabase        beliebiger Supabase-Client (Admin oder RLS-Client)
 * @param organizationId  Ziel-Organisation (Default: Alltagsengel-Stamm-Org,
 *                        s. lib/organizations/types.ts)
 */
export async function getOrgIK(
  supabase: SupabaseClient,
  organizationId: string = DEFAULT_ORG_ID
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('organizations')
      .select('ik_nummer')
      .eq('id', organizationId)
      .single()
    if (!error && data?.ik_nummer) return data.ik_nummer as string
  } catch {
    // organizations existiert noch nicht (Migration nicht angewendet) —
    // Env-Fallback unten greift.
  }

  const envIk = process.env.ALLTAGSENGEL_IK || process.env.NEXT_PUBLIC_ALLTAGSENGEL_IK
  if (envIk) return envIk

  throw new Error(
    'IK-Nummer nicht konfiguriert: weder organizations.ik_nummer noch ' +
      'ALLTAGSENGEL_IK/NEXT_PUBLIC_ALLTAGSENGEL_IK gesetzt.'
  )
}
