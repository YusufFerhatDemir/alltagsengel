/**
 * § 302 SGB V — Abrechnungslauf (Admin-Einstiegspunkt)
 *
 * Dünne Fassade über ./versand.ts (erzeugeUndVersendeSgbV enthält bereits
 * die vollständige Orchestrierung: Leistungen sammeln → prüfen → Datensatz
 * erstellen → Gate → Versand-Versuch). Diese Datei dupliziert die Logik
 * NICHT — sie liefert nur die admin-UI-freundlichen Lese-Endpunkte
 * (Liste/Detail), die versand.ts selbst nicht braucht.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { erzeugeUndVersendeSgbV, type SgbVLaufErgebnis, type SgbVLaufParams } from './versand'

export async function starteAbrechnungslauf(
  supabase: SupabaseClient,
  params: SgbVLaufParams,
): Promise<SgbVLaufErgebnis> {
  return erzeugeUndVersendeSgbV(supabase, params)
}

export interface SgbVLaufListEintrag {
  id: string
  abrechnungsmonat: string
  kostentraeger_ik: string | null
  kostentraeger_name: string | null
  status: string
  sperr_grund: string | null
  anzahl_faelle: number
  anzahl_positionen: number
  gesamtbetrag_cent: number
  erstellt_am: string
  korrektur_von: string | null
}

export async function listeAbrechnungslaeufe(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<SgbVLaufListEintrag[]> {
  const { data, error } = await supabase
    .from('sgb_v_laeufe')
    .select('id, abrechnungsmonat, kostentraeger_ik, kostentraeger_name, status, sperr_grund, anzahl_faelle, anzahl_positionen, gesamtbetrag_cent, erstellt_am, korrektur_von')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('erstellt_am', { ascending: false })

  if (error) throw new Error(`§ 302-Läufe konnten nicht geladen werden: ${error.message}`)
  return data || []
}

export async function ladeAbrechnungslauf(supabase: SupabaseClient, organizationId: string, laufId: string) {
  const { data, error } = await supabase
    .from('sgb_v_laeufe')
    .select('*')
    .eq('id', laufId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) throw new Error(`§ 302-Lauf konnte nicht geladen werden: ${error.message}`)
  return data
}
