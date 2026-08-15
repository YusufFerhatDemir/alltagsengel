/**
 * § 302 SGB V — Storno & Korrekturläufe
 *
 * Zwei-Schritt-Muster analog zu lib/abrechnung/korrekturlaeufe.ts (§105):
 * zuerst ein Korrektur-Vorgang mit Prüfung/Begründung ("angelegt"), erst bei
 * Ausführung entsteht ein neuer `sgb_v_laeufe`-Datensatz. Getrennt, damit ein
 * Storno nicht versehentlich per einzelnem DB-Write passiert, sondern
 * nachvollziehbar mit Begründung angelegt UND separat freigegeben wird.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../../billing/core/audit'

export type SgbVKorrekturTyp = 'storno' | 'teilstorno' | 'korrekturabrechnung'
export type SgbVKorrekturStatus = 'angelegt' | 'in_bearbeitung' | 'ausgefuehrt' | 'abgebrochen'

/** Welche Lauf-Stati je Korrekturtyp einen Korrekturvorgang zulassen. */
const KORRIGIERBARE_STATI: Record<SgbVKorrekturTyp, string[]> = {
  storno: ['uebermittelt', 'quittiert', 'angenommen', 'teilweise_abgelehnt'],
  teilstorno: ['uebermittelt', 'quittiert', 'angenommen', 'teilweise_abgelehnt'],
  korrekturabrechnung: ['teilweise_abgelehnt', 'abgelehnt', 'korrektur_erforderlich'],
}

export interface SgbVKorrekturErstellenParams {
  organizationId: string
  originalLaufId: string
  ruecklaeuferId?: string
  korrekturTyp: SgbVKorrekturTyp
  korrekturGrund: string
  differenzCent?: number
  actorId: string
}

export interface SgbVKorrekturErgebnis {
  korrekturId: string
  status: SgbVKorrekturStatus
}

export async function erstelleSgbVKorrektur(
  supabase: SupabaseClient,
  params: SgbVKorrekturErstellenParams,
): Promise<SgbVKorrekturErgebnis> {
  if (!params.korrekturGrund?.trim()) {
    throw new Error('Korrekturgrund ist Pflicht — ein Storno ohne Begründung ist nicht nachvollziehbar.')
  }

  const { data: original } = await supabase
    .from('sgb_v_laeufe')
    .select('id, status, gesamtbetrag_cent')
    .eq('id', params.originalLaufId)
    .eq('organization_id', params.organizationId)
    .maybeSingle()
  if (!original) throw new Error('§ 302-Lauf nicht gefunden oder gehört zu einer anderen Organisation.')

  const erlaubt = KORRIGIERBARE_STATI[params.korrekturTyp]
  if (!erlaubt.includes(original.status)) {
    throw new Error(
      `Lauf im Status "${original.status}" kann nicht als "${params.korrekturTyp}" korrigiert werden. `
      + `Erlaubt: ${erlaubt.join(', ')}.`,
    )
  }

  const { data: row, error } = await supabase
    .from('sgb_v_korrekturlaeufe')
    .insert({
      organization_id: params.organizationId,
      original_lauf_id: params.originalLaufId,
      ruecklaeufer_id: params.ruecklaeuferId ?? null,
      korrektur_typ: params.korrekturTyp,
      korrektur_grund: params.korrekturGrund,
      differenz_cent: params.differenzCent ?? original.gesamtbetrag_cent,
      status: 'angelegt',
      angelegt_von: params.actorId,
    })
    .select('id, status')
    .single()

  if (error || !row) {
    if (error?.code === '23505') {
      throw new Error('Für diesen Lauf existiert bereits ein offener Korrekturvorgang.')
    }
    throw new Error(`Korrekturvorgang konnte nicht angelegt werden: ${error?.message}`)
  }

  await logBillingAction(supabase, {
    entityType: 'sgb_v_korrekturlauf',
    organizationId: params.organizationId,
    entityId: row.id,
    action: 'sgb_v_korrektur_angelegt',
    newState: { original_lauf_id: params.originalLaufId, typ: params.korrekturTyp, grund: params.korrekturGrund },
    actorId: params.actorId,
  })

  return { korrekturId: row.id, status: row.status }
}

export interface SgbVKorrekturAusfuehrenErgebnis {
  korrekturLaufId: string
}

export async function fuehreSgbVKorrekturAus(
  supabase: SupabaseClient,
  organizationId: string,
  korrekturId: string,
  actorId: string,
): Promise<SgbVKorrekturAusfuehrenErgebnis> {
  const { data: korrektur } = await supabase
    .from('sgb_v_korrekturlaeufe')
    .select('id, status, korrektur_typ, korrektur_grund, original_lauf_id')
    .eq('id', korrekturId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!korrektur) throw new Error('Korrekturvorgang nicht gefunden oder gehört zu einer anderen Organisation.')
  if (korrektur.status !== 'angelegt' && korrektur.status !== 'in_bearbeitung') {
    throw new Error(`Korrekturvorgang im Status "${korrektur.status}" kann nicht ausgeführt werden.`)
  }

  const { data: original } = await supabase
    .from('sgb_v_laeufe')
    .select('id, abrechnungsmonat, bundesland, kostentraeger_ik, kostentraeger_name')
    .eq('id', korrektur.original_lauf_id)
    .eq('organization_id', organizationId)
    .single()
  if (!original) throw new Error('Ursprünglicher Abrechnungslauf nicht gefunden.')

  const { data: neuerLauf, error: laufFehler } = await supabase
    .from('sgb_v_laeufe')
    .insert({
      organization_id: organizationId,
      abrechnungsmonat: original.abrechnungsmonat,
      bundesland: original.bundesland,
      kostentraeger_ik: original.kostentraeger_ik,
      kostentraeger_name: original.kostentraeger_name,
      status: 'erstellt',
      dateiindikator: '0',
      korrektur_von: korrektur.original_lauf_id,
      erstellt_von: actorId,
    })
    .select('id')
    .single()

  if (laufFehler || !neuerLauf) throw new Error(`Korrekturlauf konnte nicht angelegt werden: ${laufFehler?.message}`)

  await supabase
    .from('sgb_v_korrekturlaeufe')
    .update({ status: 'ausgefuehrt', korrektur_lauf_id: neuerLauf.id, ausgefuehrt_am: new Date().toISOString(), ausgefuehrt_von: actorId })
    .eq('id', korrekturId)

  const neuerOriginalStatus = korrektur.korrektur_typ === 'korrekturabrechnung' ? 'korrigiert' : 'storniert'
  await supabase
    .from('sgb_v_laeufe')
    .update({ status: neuerOriginalStatus, storno_grund: korrektur.korrektur_grund })
    .eq('id', korrektur.original_lauf_id)
    .eq('organization_id', organizationId)

  await logBillingAction(supabase, {
    entityType: 'sgb_v_korrekturlauf',
    organizationId,
    entityId: korrekturId,
    action: 'sgb_v_korrektur_ausgefuehrt',
    newState: { korrektur_lauf_id: neuerLauf.id, original_lauf_status: neuerOriginalStatus },
    actorId,
  })

  return { korrekturLaufId: neuerLauf.id }
}

export async function ladeSgbVKorrekturHistorie(supabase: SupabaseClient, organizationId: string, laufId: string) {
  const { data, error } = await supabase
    .from('sgb_v_korrekturlaeufe')
    .select('id, original_lauf_id, korrektur_typ, korrektur_grund, status, korrektur_lauf_id, created_at')
    .eq('organization_id', organizationId)
    .or(`original_lauf_id.eq.${laufId},korrektur_lauf_id.eq.${laufId}`)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Korrekturhistorie konnte nicht geladen werden: ${error.message}`)
  return data || []
}
