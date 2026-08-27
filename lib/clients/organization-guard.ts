// ═══════════════════════════════════════════════════════════════
// Mandantenschutz für clientId aus dem Request-Body
//
// Jede Schreibroute, die eine clientId aus dem Body übernimmt und mit
// Service-Role (createAdminClient) schreibt, MUSS vor dem Schreiben prüfen,
// dass der Klient zur aktiven Organisation des Aufrufers gehört. Ohne diese
// Prüfung wird nur `organization_id` (vertrauenswürdig, aus dem Auth-Kontext)
// gespeichert — `client_id` bliebe unverifiziert und ein Nutzer könnte
// Datensätze unter einem fremden (Kunden einer anderen Organisation)
// anlegen. RLS greift hier NICHT, weil Service-Role sie umgeht.
//
// SIS-, Wund- und Medikamenten-Routen machen diese Prüfung bereits inline;
// dieser Helper zentralisiert sie, damit sie nicht erneut vergessen wird.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

export async function clientGehoertZuOrg(
  supabase: SupabaseClient,
  clientId: string,
  organizationId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  return !!data
}
