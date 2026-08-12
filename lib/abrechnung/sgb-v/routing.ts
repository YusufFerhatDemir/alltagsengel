/**
 * § 302 SGB V — Kostenträger-Routing (Block 17)
 *
 * Krankenkassen routen anders als Pflegekassen: eigene Datenannahmestellen,
 * eigene Annahmeformate, eigene Zuständigkeiten. Das § 105-Routing in
 * lib/abrechnung/schluesselverzeichnis.ts ist deshalb NICHT übertragbar.
 *
 * Wie bei den § 105-Stammdaten gilt: Routing-Daten werden nie geraten. Die
 * Tabelle `sgb_v_routing` ist bei der Auslieferung leer — jeder Eintrag stammt
 * aus einem Kassenverzeichnis und trägt seine Quelle mit.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SgbVFormat } from './versionen'

export interface SgbVRouting {
  id: string
  kostentraeger_ik: string
  kostentraeger_name: string | null
  kassenart: string | null
  datenannahmestelle_ik: string | null
  datenannahmestelle_name: string | null
  annahme_format: SgbVFormat | null
  gueltig_von: string | null
  gueltig_bis: string | null
  quelle: string | null
}

export type RoutingProblem =
  | 'kein_eintrag'
  | 'nicht_gueltig'
  | 'annahmestelle_fehlt'
  | 'format_fehlt'

export const ROUTING_PROBLEM_TEXT: Record<RoutingProblem, string> = {
  kein_eintrag: 'Für diese Krankenkassen-IK ist kein § 302-Routing hinterlegt.',
  nicht_gueltig: 'Das hinterlegte Routing gilt für den Abrechnungsmonat nicht.',
  annahmestelle_fehlt: 'Im Routing fehlt die Datenannahmestelle (IK).',
  format_fehlt: 'Im Routing fehlt das Annahmeformat (EDIFACT oder HKP-XML).',
}

export interface RoutingErgebnis {
  ok: boolean
  routing: SgbVRouting | null
  problem: RoutingProblem | null
  hinweis: string | null
}

/** Neunstellige IK — dieselbe Formatregel wie im § 105-Pfad. */
export function istGueltigeIK(ik: string | null | undefined): boolean {
  return typeof ik === 'string' && /^\d{9}$/.test(ik)
}

export async function ladeRouting(
  supabase: SupabaseClient,
  organizationId: string
): Promise<SgbVRouting[]> {
  const { data, error } = await supabase
    .from('sgb_v_routing')
    .select('id, kostentraeger_ik, kostentraeger_name, kassenart, datenannahmestelle_ik, datenannahmestelle_name, annahme_format, gueltig_von, gueltig_bis, quelle')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('kostentraeger_ik', { ascending: true })

  if (error) {
    throw new Error(`§ 302-Routing konnte nicht geladen werden: ${error.message}`)
  }
  return (data || []) as SgbVRouting[]
}

/**
 * Sucht das für IK + Stichtag geltende Routing und prüft es auf
 * Vollständigkeit. Mehrere passende Einträge: der mit dem spätesten
 * gueltig_von gewinnt (Stammdaten-Historie bleibt erhalten).
 */
export function findeRouting(
  eintraege: SgbVRouting[],
  kostentraegerIk: string,
  stichtag: string
): RoutingErgebnis {
  const fuerIk = eintraege.filter(r => r.kostentraeger_ik === kostentraegerIk)

  if (fuerIk.length === 0) {
    return { ok: false, routing: null, problem: 'kein_eintrag', hinweis: ROUTING_PROBLEM_TEXT.kein_eintrag }
  }

  const gueltig = fuerIk
    .filter(r => (!r.gueltig_von || r.gueltig_von <= stichtag) && (!r.gueltig_bis || r.gueltig_bis >= stichtag))
    .sort((a, b) => ((a.gueltig_von || '') < (b.gueltig_von || '') ? 1 : -1))

  if (gueltig.length === 0) {
    return { ok: false, routing: fuerIk[0], problem: 'nicht_gueltig', hinweis: ROUTING_PROBLEM_TEXT.nicht_gueltig }
  }

  const routing = gueltig[0]

  if (!istGueltigeIK(routing.datenannahmestelle_ik)) {
    return { ok: false, routing, problem: 'annahmestelle_fehlt', hinweis: ROUTING_PROBLEM_TEXT.annahmestelle_fehlt }
  }
  if (!routing.annahme_format) {
    return { ok: false, routing, problem: 'format_fehlt', hinweis: ROUTING_PROBLEM_TEXT.format_fehlt }
  }

  return { ok: true, routing, problem: null, hinweis: null }
}
