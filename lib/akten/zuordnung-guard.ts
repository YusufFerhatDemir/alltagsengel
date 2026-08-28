// ═══════════════════════════════════════════════════════════════════════
// Mandantenschutz fuer die Zuordnung eines Akten-Objekts
//
// BEFUND (Track 10): `POST /api/akten/dokumente` und
// `POST /api/akten/vertraege` uebernehmen `clientId` und `caregiverId`
// unveraendert aus dem Request-Rumpf und schreiben mit dem
// Dienstschluessel (`createAdminClient`) — RLS greift dort nicht. Die
// Spalten sind einfache Fremdschluessel auf `clients(id)` bzw.
// `caregivers(id)`; die Bedingung sagt „diese Zeile existiert", nicht
// „diese Zeile gehoert zu dieser Organisation".
//
// Acht Schwesterrouten unter app/api/pflege/** stellen genau diese Frage
// bereits (`clientGehoertZuOrg`), die Personalwege ebenso
// (`assertCaregiverInOrg`) — die beiden Akten-Wege waren die Ausnahme.
//
// Die Zeile selbst bekommt `organization_id` aus dem Auth-Kontext, ein
// Lesen ueber die Mandantengrenze entsteht dadurch NICHT (weder
// `listDokumente` noch `listVertraege` bettet den Klienten ein). Was
// entsteht, ist eine Akte, deren Zuordnung ins Leere bzw. zu einem
// fremden Mandanten zeigt: sie taucht in keiner Kunden-/Mitarbeiterakte
// auf, die darauf aufsetzenden Uebersichten (akten_kunden_uebersicht,
// akten_mitarbeiter_uebersicht) zaehlen sie nicht mit, und im Fall der
// Vertraege haengt daran die Fristenueberwachung.
// ═══════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { UserFacingError } from '@/lib/api/user-facing-error'
import { clientGehoertZuOrg } from '@/lib/clients/organization-guard'

async function caregiverGehoertZuOrg(
  supabase: SupabaseClient,
  caregiverId: string,
  organizationId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('caregivers')
    .select('id')
    .eq('id', caregiverId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`Mitarbeiter konnte nicht geprueft werden: ${error.message}`)
  return !!data
}

/**
 * Prueft die Zuordnung eines Dokuments/Vertrags gegen den Mandanten.
 *
 * Beide Felder duerfen null sein — ein Dokument ohne Zuordnung gehoert
 * der Organisation selbst ('org'-Ablage). Beide gleichzeitig gesetzt ist
 * bereits in den Routen als 400 abgefangen; hier zusaetzlich, damit die
 * Regel nicht nur am Routenrand steht.
 */
export async function assertZuordnungInOrg(
  supabase: SupabaseClient,
  params: { clientId?: string | null; caregiverId?: string | null; organizationId: string },
): Promise<void> {
  const clientId = params.clientId?.trim() || null
  const caregiverId = params.caregiverId?.trim() || null

  if (clientId && caregiverId) {
    throw new UserFacingError(
      'Ein Akten-Objekt kann nicht Kunde und Mitarbeiter gleichzeitig zugeordnet sein.',
      400,
    )
  }

  if (clientId && !(await clientGehoertZuOrg(supabase, clientId, params.organizationId))) {
    throw new UserFacingError('Klient nicht gefunden oder gehoert nicht zur Organisation.', 404)
  }

  if (caregiverId && !(await caregiverGehoertZuOrg(supabase, caregiverId, params.organizationId))) {
    throw new UserFacingError('Mitarbeiter nicht gefunden oder gehoert nicht zur Organisation.', 404)
  }
}
