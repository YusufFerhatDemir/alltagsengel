/**
 * § 302 SGB V — Rückläufer-Service
 *
 * Dünner, domänenspezifischer Wrapper um die bereits vorhandene generische
 * Rückläufer-Pipeline (lib/abrechnung/ruecklaeufer.ts). Kein eigenes Modell:
 * § 302-Rückmeldungen landen in derselben `dta_ruecklaeufer`-Tabelle wie
 * § 105-Rückmeldungen, zugeordnet über die Brücke `sgb_v_lauf_id`
 * (Migration 20260921010000) statt `lauf_id` (das bleibt für
 * abrechnungslaeufe/§105 reserviert).
 *
 * Damit laufen automatische Aufgabenerstellung, Fehlercode-Klassifizierung
 * und Wiedervorlage-Queue für § 302 durch dieselbe, bereits getestete
 * Verarbeitung — keine zweite Pipeline, die aus dem Takt geraten kann.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../../billing/core/audit'
import {
  importiereRuecklaeufer,
  markiereRuecklaeuferErledigt,
  type RuecklaeuferImportErgebnis,
  type RuecklaeuferImportParams,
} from '../ruecklaeufer'

export type SgbVRuecklaeuferImportParams = Omit<RuecklaeuferImportParams, 'laufId' | 'sgbVLaufId'> & {
  sgbVLaufId: string
}

/**
 * `verfahren: 'sgb_v_302'` ist hier fest gesetzt und kein Aufrufer-Parameter:
 * ein Rückläufer aus diesem Service stammt per Definition aus dem
 * § 302-Verfahren. Ohne die Angabe würde die Fehlercode-Klassifizierung
 * Katalogeinträge aus dem § 105-Verfahren übernehmen — dieselben kurzen
 * numerischen Codes, andere Bedeutung (s. verfahrenAusQuelle()).
 */
export async function importiereSgbVRuecklaeufer(
  supabase: SupabaseClient,
  params: SgbVRuecklaeuferImportParams,
): Promise<RuecklaeuferImportErgebnis> {
  return importiereRuecklaeufer(supabase, {
    ...params,
    sgbVLaufId: params.sgbVLaufId,
    verfahren: 'sgb_v_302',
  })
}

export async function ladeSgbVRuecklaeufer(
  supabase: SupabaseClient,
  organizationId: string,
  laufId?: string,
) {
  let query = supabase
    .from('dta_ruecklaeufer')
    .select('id, sgb_v_lauf_id, ruecklaeufer_typ, status, fehler_code, fehler_text, betrag_angefordert_cent, betrag_anerkannt_cent, positionen_gesamt, positionen_abgelehnt, kostentraeger_ik, bearbeitet_am, created_at')
    .eq('organization_id', organizationId)
    .not('sgb_v_lauf_id', 'is', null)
    .order('created_at', { ascending: false })

  if (laufId) query = query.eq('sgb_v_lauf_id', laufId)

  const { data, error } = await query
  if (error) throw new Error(`§ 302-Rückläufer konnten nicht geladen werden: ${error.message}`)
  return data || []
}

/**
 * Ordnet einen bereits importierten Rückläufer nachträglich einem § 302-Lauf
 * zu. Eigene Implementierung statt der generischen `ordneRuecklaeuferZu()`,
 * weil diese fest gegen `abrechnungslaeufe` prüft.
 */
export async function ordneSgbVRuecklaeuferZu(
  supabase: SupabaseClient,
  organizationId: string,
  ruecklaeuferId: string,
  laufId: string,
  actorId: string,
): Promise<void> {
  const { data: lauf } = await supabase
    .from('sgb_v_laeufe')
    .select('id')
    .eq('id', laufId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!lauf) throw new Error('§ 302-Lauf nicht gefunden oder gehört zu einer anderen Organisation.')

  const { data: aktualisiert, error } = await supabase
    .from('dta_ruecklaeufer')
    .update({ sgb_v_lauf_id: laufId, status: 'zugeordnet', bearbeitet_von: actorId, bearbeitet_am: new Date().toISOString() })
    .eq('id', ruecklaeuferId)
    .eq('organization_id', organizationId)
    .select('id')
    .maybeSingle()

  if (error || !aktualisiert) throw new Error('Rückläufer nicht gefunden oder gehört zu einer anderen Organisation.')

  await logBillingAction(supabase, {
    entityType: 'dta_ruecklaeufer',
    organizationId,
    entityId: ruecklaeuferId,
    action: 'sgb_v_ruecklaeufer_zugeordnet',
    newState: { sgb_v_lauf_id: laufId },
    actorId,
  })
}

export { markiereRuecklaeuferErledigt as markiereSgbVRuecklaeuferErledigt }
