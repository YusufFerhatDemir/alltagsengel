/**
 * Rollenbasierte Empfänger einer Organisation — geteilter Helfer für die
 * Automatisierungsketten in diesem Verzeichnis.
 *
 * Zwei Queries statt eines PostgREST-Embeds: zwischen `organization_members`
 * und `profiles` existiert kein Foreign Key — ein `profiles!inner(...)`-Embed
 * scheitert mit PGRST200 und liefert still eine leere Liste. Derselbe Fehler
 * hat schon rollenbasierte Benachrichtigungen lautlos abgeschaltet (siehe
 * lib/ops/ereignis-emitter.ts, lib/abrechnung/ruecklaeufer-aufgaben.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
const log = logger.child('automation')

export async function rollentraegerDerOrg(
  supabase: SupabaseClient,
  organizationId: string,
  rollen: string[],
): Promise<string[]> {
  const { data: mitglieder, error: mErr } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId)

  if (mErr) {
    log.error('organization_members fehlgeschlagen', { errorMessage: mErr.message })
    return []
  }

  const userIds = (mitglieder ?? []).map((m: { user_id: string }) => m.user_id).filter(Boolean)
  if (userIds.length === 0) return []

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id')
    .in('id', userIds)
    .in('role', rollen)
    .is('deleted_at', null)

  if (pErr) {
    log.error('profiles fehlgeschlagen', { errorMessage: pErr.message })
    return []
  }

  return (profile ?? []).map((p: { id: string }) => p.id)
}

/**
 * Rollen, die den betrieblichen Meldungen der Automatisierungsketten
 * zustehen: Fristablauf, fehlender Nachweis, Budgetgrenze, kritischer
 * Vitalwert.
 *
 * BEFUND (28.08.2026): saemtliche Ketten riefen `['admin','superadmin']` —
 * die Rolle `pdl` war NIRGENDS Empfängerin, obwohl die Variablen `pdlId`
 * bzw. `pdlIds` heissen, die Kommentare „an PDL/Admin" sagen und eine
 * ganze Kette `vitalwerte-pdl.ts` heisst. Die Pflegedienstleitung fuehrt
 * den Betrieb (stammdaten/personal/einsatz/pflege/qm.schreiben,
 * abrechnung.lesen) und ist genau die Stelle, an die ein kritischer
 * Vitalwert oder eine ablaufende Verordnung gehoert. In einer
 * Organisation, die eine PDL, aber keine Administration im Tagesbetrieb
 * hat, gingen diese Meldungen ins Leere.
 *
 * `qm` steht bewusst NICHT hier: das Qualitaetsmanagement prueft, es
 * disponiert nicht.
 */
export const BETRIEBS_EMPFAENGER_ROLLEN = ['admin', 'superadmin', 'pdl'] as const

/**
 * Verantwortlicher für automatisch erstellte Aufgaben.
 *
 * Reihenfolge ist Absicht: zuerst die PDL — sie fuehrt den Betrieb und
 * bearbeitet diese Aufgaben — und erst wenn keine eingerichtet ist, die
 * Administration. Vorher landeten ALLE automatisch erzeugten Aufgaben bei
 * der Administration, auch wo eine PDL vorhanden war.
 */
export async function ersterPdlDerOrg(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string | null> {
  const pdl = await rollentraegerDerOrg(supabase, organizationId, ['pdl'])
  if (pdl.length > 0) return pdl[0]
  const admin = await rollentraegerDerOrg(supabase, organizationId, ['admin', 'superadmin'])
  return admin[0] ?? null
}
