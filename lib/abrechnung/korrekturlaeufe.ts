/**
 * Korrekturläufe — Verwaltung von Korrekturabrechnungen
 *
 * Ablauf: Original-Lauf → Rückläufer → Fehler → Korrekturlauf → neuer DTA-Lauf
 *
 * Jeder Korrekturlauf referenziert:
 * - Den Original-Lauf (original_lauf_id)
 * - Den auslösenden Rückläufer (ruecklaeufer_id)
 * - Die zugehörigen Fehler (fehler_ids)
 * - Den neu erstellten Lauf (korrektur_lauf_id)
 *
 * Vollständige Historie über die Kette:
 * Original → Korrektur 1 → Korrektur 2 → ...
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../billing/core/audit'
import { erstelleAbrechnungslauf, type LaufTyp } from './kassenabrechnung-engine'

// ── Types ───────────────────────────────────────────────────────

export type KorrekturTyp =
  | 'korrekturabrechnung' | 'nachberechnung' | 'storno'
  | 'teilstorno' | 'gutschrift'

export type KorrekturStatus =
  | 'angelegt' | 'in_bearbeitung' | 'validiert' | 'freigegeben'
  | 'exportiert' | 'uebermittelt' | 'abgeschlossen' | 'abgebrochen'

export interface KorrekturErstellenParams {
  organizationId: string
  originalLaufId: string
  ruecklaeuferId?: string
  fehlerIds?: string[]
  korrekturTyp: KorrekturTyp
  korrekturGrund: string
  actorId: string
}

export interface KorrekturErgebnis {
  korrekturId: string
  korrekturLaufId?: string
  status: KorrekturStatus
  betroffeneRechnungen: number
  differenzCent: number
}

// ── Korrekturlauf erstellen ─────────────────────────────────────

export async function erstelleKorrekturlauf(
  supabase: SupabaseClient,
  params: KorrekturErstellenParams,
): Promise<KorrekturErgebnis> {
  // Original-Lauf laden (org_id-Fence)
  const { data: originalLauf } = await supabase
    .from('abrechnungslaeufe')
    .select('*')
    .eq('id', params.originalLaufId)
    .eq('organization_id', params.organizationId)
    .single()

  if (!originalLauf) throw new Error('Original-Lauf nicht gefunden')

  // Nur Läufe mit bestimmten Status können korrigiert werden
  const korrigierbar = ['teilweise_abgelehnt', 'abgelehnt', 'korrektur_erforderlich']
  if (!korrigierbar.includes(originalLauf.status)) {
    throw new Error(
      `Lauf im Status "${originalLauf.status}" kann nicht korrigiert werden. ` +
      `Korrektur nur möglich für: ${korrigierbar.join(', ')}`,
    )
  }

  // Betroffene Rechnungen zählen
  const { count: rechnungenCount } = await supabase
    .from('dta_lauf_rechnungen')
    .select('id', { count: 'exact', head: true })
    .eq('lauf_id', params.originalLaufId)
    .in('status', ['abgelehnt', 'teilweise_abgelehnt'])

  // Original-Differenz berechnen (aus Rückläufer wenn vorhanden)
  let differenzCent = 0
  if (params.ruecklaeuferId) {
    const { data: rl } = await supabase
      .from('dta_ruecklaeufer')
      .select('betrag_differenz_cent')
      .eq('id', params.ruecklaeuferId)
      .eq('organization_id', params.organizationId)
      .single()

    differenzCent = rl?.betrag_differenz_cent ?? 0
  }

  // Korrekturlauf anlegen
  const { data: korrektur, error } = await supabase
    .from('dta_korrekturlaeufe')
    .insert({
      organization_id: params.organizationId,
      original_lauf_id: params.originalLaufId,
      ruecklaeufer_id: params.ruecklaeuferId || null,
      fehler_ids: params.fehlerIds ?? [],
      korrektur_typ: params.korrekturTyp,
      korrektur_grund: params.korrekturGrund,
      betroffene_rechnungen: rechnungenCount ?? 0,
      differenz_cent: differenzCent,
      status: 'angelegt',
      angelegt_von: params.actorId,
    })
    .select('id')
    .single()

  if (error || !korrektur) {
    throw new Error(`Korrekturlauf konnte nicht erstellt werden: ${error?.message}`)
  }

  // Original-Lauf als korrigiert markieren (org_id-Fence)
  await supabase
    .from('abrechnungslaeufe')
    .update({ status: 'korrigiert' })
    .eq('id', params.originalLaufId)
    .eq('organization_id', params.organizationId)

  // Rückläufer als korrektur_erstellt markieren
  if (params.ruecklaeuferId) {
    await supabase
      .from('dta_ruecklaeufer')
      .update({
        status: 'korrektur_erstellt',
        korrektur_lauf_id: korrektur.id,
      })
      .eq('id', params.ruecklaeuferId)
      .eq('organization_id', params.organizationId)
  }

  // Fehler als korrigiert markieren
  if (params.fehlerIds?.length) {
    await supabase
      .from('dta_fehlerprotokoll')
      .update({
        bearbeitungsstatus: 'korrigiert',
        korrektur_lauf_id: korrektur.id,
        loesung_am: new Date().toISOString(),
      })
      .in('id', params.fehlerIds)
      .eq('organization_id', params.organizationId)
  }

  // Audit
  await logBillingAction(supabase, {
    entityType: 'korrekturlauf',
    entityId: korrektur.id,
    action: 'korrekturlauf_erstellt',
    newState: {
      original_lauf_id: params.originalLaufId,
      korrektur_typ: params.korrekturTyp,
      grund: params.korrekturGrund,
      betroffene: rechnungenCount ?? 0,
    },
    actorId: params.actorId,
  })

  return {
    korrekturId: korrektur.id,
    status: 'angelegt',
    betroffeneRechnungen: rechnungenCount ?? 0,
    differenzCent,
  }
}

// ── Korrektur-Lauf ausführen (neuen DTA-Lauf erstellen) ─────────

export async function fuehreKorrekturAus(
  supabase: SupabaseClient,
  korrekturId: string,
  actorId: string,
  organizationId?: string,
): Promise<KorrekturErgebnis> {
  let korrekturQuery = supabase
    .from('dta_korrekturlaeufe')
    .select('*, original_lauf:abrechnungslaeufe!dta_korrekturlaeufe_original_lauf_id_fkey(*)')
    .eq('id', korrekturId)
  if (organizationId) korrekturQuery = korrekturQuery.eq('organization_id', organizationId)
  const { data: korrektur } = await korrekturQuery.single()

  if (!korrektur) throw new Error('Korrekturlauf nicht gefunden')
  if (korrektur.status !== 'angelegt' && korrektur.status !== 'in_bearbeitung') {
    throw new Error(`Korrektur im Status "${korrektur.status}" kann nicht ausgeführt werden`)
  }

  // Status → in_bearbeitung
  await supabase
    .from('dta_korrekturlaeufe')
    .update({ status: 'in_bearbeitung' })
    .eq('id', korrekturId)

  const original = korrektur.original_lauf
  if (!original) throw new Error('Original-Lauf nicht aufgelöst')

  // Lauf-Typ aus Korrektur-Typ ableiten
  const laufTypMap: Record<string, LaufTyp> = {
    'korrekturabrechnung': 'korrekturabrechnung',
    'nachberechnung': 'nachberechnung',
    'storno': 'storno',
    'teilstorno': 'storno',
    'gutschrift': 'korrekturabrechnung',
  }

  // Neuen Abrechnungslauf erstellen
  const laufErgebnis = await erstelleAbrechnungslauf(supabase, {
    organizationId: korrektur.organization_id,
    abrechnungsmonat: original.abrechnungsmonat,
    bundesland: original.bundesland,
    kostentraegerIk: original.kostentraeger_ik === 'SAMMEL' ? undefined : original.kostentraeger_ik,
    laufTyp: laufTypMap[korrektur.korrektur_typ] || 'korrekturabrechnung',
    korrekturVon: korrektur.original_lauf_id,
    actorId,
  })

  // Korrektur-Lauf verknüpfen
  if (laufErgebnis.laufId) {
    await supabase
      .from('dta_korrekturlaeufe')
      .update({
        korrektur_lauf_id: laufErgebnis.laufId,
        status: 'validiert',
        betroffene_rechnungen: laufErgebnis.rechnungenAnzahl,
        differenz_cent: laufErgebnis.gesamtbetragCent,
      })
      .eq('id', korrekturId)
  } else {
    await supabase
      .from('dta_korrekturlaeufe')
      .update({ status: 'abgebrochen' })
      .eq('id', korrekturId)
  }

  await logBillingAction(supabase, {
    entityType: 'korrekturlauf',
    entityId: korrekturId,
    action: 'korrektur_ausgefuehrt',
    newState: {
      korrektur_lauf_id: laufErgebnis.laufId,
      rechnungen: laufErgebnis.rechnungenAnzahl,
      betrag: laufErgebnis.gesamtbetragCent,
    },
    actorId,
  })

  return {
    korrekturId,
    korrekturLaufId: laufErgebnis.laufId || undefined,
    status: laufErgebnis.laufId ? 'validiert' : 'abgebrochen',
    betroffeneRechnungen: laufErgebnis.rechnungenAnzahl,
    differenzCent: laufErgebnis.gesamtbetragCent,
  }
}

// ── Korrektur-Historie laden ────────────────────────────────────

/**
 * Zeile aus `abrechnungslaeufe`, wie sie die Ketten-Abfragen unten selektieren.
 * `korrektur_von` wird nur von der Rückwärts-Abfrage mitgelesen.
 */
interface KettenLaufRow {
  id: string
  lauf_typ: string | null
  status: string
  abrechnungsmonat: string
  gesamtbetrag_cent: number | null
  erstellt_am: string
  korrektur_von?: string | null
}

export interface KorrekturHistorie {
  kette: Array<{
    laufId: string
    typ: string
    status: string
    monat: string
    betragCent: number
    erstelltAm: string
    korrekturGrund?: string
  }>
}

export async function ladeKorrekturHistorie(
  supabase: SupabaseClient,
  laufId: string,
  organizationId?: string,
): Promise<KorrekturHistorie> {
  const kette: KorrekturHistorie['kette'] = []

  // Rückwärts: alle Vorgänger
  let currentId: string | null = laufId
  while (currentId) {
    const { data: lauf }: { data: KettenLaufRow | null } = organizationId
      ? await supabase.from('abrechnungslaeufe').select('id, lauf_typ, status, abrechnungsmonat, gesamtbetrag_cent, erstellt_am, korrektur_von').eq('id', currentId).eq('organization_id', organizationId).single()
      : await supabase.from('abrechnungslaeufe').select('id, lauf_typ, status, abrechnungsmonat, gesamtbetrag_cent, erstellt_am, korrektur_von').eq('id', currentId).single()

    if (!lauf) break

    const { data: korrektur } = await supabase
      .from('dta_korrekturlaeufe')
      .select('korrektur_grund')
      .eq('korrektur_lauf_id', lauf.id)
      .maybeSingle()

    kette.unshift({
      laufId: lauf.id,
      typ: lauf.lauf_typ || 'erstabrechnung',
      status: lauf.status,
      monat: lauf.abrechnungsmonat,
      betragCent: lauf.gesamtbetrag_cent ?? 0,
      erstelltAm: lauf.erstellt_am,
      korrekturGrund: korrektur?.korrektur_grund,
    })

    currentId = lauf.korrektur_von ?? null
  }

  // Vorwärts: alle Nachfolger
  currentId = laufId
  while (currentId) {
    let fwdQuery = supabase
      .from('abrechnungslaeufe')
      .select('id, lauf_typ, status, abrechnungsmonat, gesamtbetrag_cent, erstellt_am')
      .eq('korrektur_von', currentId)
      .is('deleted_at', null)
      .order('erstellt_am', { ascending: true })
      .limit(1)
    if (organizationId) fwdQuery = fwdQuery.eq('organization_id', organizationId)
    const { data: nachfolger }: { data: KettenLaufRow | null } = await fwdQuery.maybeSingle()

    if (!nachfolger) break

    const { data: korrektur } = await supabase
      .from('dta_korrekturlaeufe')
      .select('korrektur_grund')
      .eq('korrektur_lauf_id', nachfolger.id)
      .maybeSingle()

    kette.push({
      laufId: nachfolger.id,
      typ: nachfolger.lauf_typ || 'korrekturabrechnung',
      status: nachfolger.status,
      monat: nachfolger.abrechnungsmonat,
      betragCent: nachfolger.gesamtbetrag_cent ?? 0,
      erstelltAm: nachfolger.erstellt_am,
      korrekturGrund: korrektur?.korrektur_grund,
    })

    currentId = nachfolger.id
  }

  return { kette }
}
