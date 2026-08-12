// ═══════════════════════════════════════════════════════════════
// Pflegedoku-Übersicht — View pflege_uebersicht
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Aufnahmestatus, PflegeUebersichtZeile } from './types'

export interface UebersichtFilter {
  organizationId: string
  clientId?: string
  aufnahmestatus?: Aufnahmestatus
  /** Nur Kunden ohne aktiven Maßnahmenplan (offene Planungsaufgaben). */
  nurOhneAktivenPlan?: boolean
  /** Nur Kunden ohne Anamnese. */
  nurOhneAnamnese?: boolean
}

export async function getPflegeUebersicht(
  supabase: SupabaseClient,
  filter: UebersichtFilter
): Promise<PflegeUebersichtZeile[]> {
  let query = supabase
    .from('pflege_uebersicht')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('last_name', { ascending: true })

  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.aufnahmestatus) query = query.eq('aufnahmestatus', filter.aufnahmestatus)
  if (filter.nurOhneAktivenPlan) query = query.eq('aktive_plaene', 0)
  if (filter.nurOhneAnamnese) query = query.eq('anamnesen_count', 0)

  const { data, error } = await query
  if (error) throw new Error(`Pflegedoku-Übersicht konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as PflegeUebersichtZeile[]
}

/** Kennzahlen für die Kachelzeile auf /admin/pflegedoku. */
export function zusammenfassungUebersicht(zeilen: PflegeUebersichtZeile[]): {
  kunden: number
  ohne_anamnese: number
  ohne_aktiven_plan: number
  offene_aufnahmen: number
  mit_risiken: number
} {
  return {
    kunden: zeilen.length,
    ohne_anamnese: zeilen.filter(z => Number(z.anamnesen_count) === 0).length,
    ohne_aktiven_plan: zeilen.filter(z => Number(z.aktive_plaene) === 0).length,
    offene_aufnahmen: zeilen.filter(z => z.aufnahmestatus === 'offen' || z.aufnahmestatus === 'in_bearbeitung').length,
    mit_risiken: zeilen.filter(z => Number(z.aktive_risiken) > 0).length,
  }
}
