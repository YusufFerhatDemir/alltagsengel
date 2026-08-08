/**
 * Rückläufer-Verarbeitung — Import und Zuordnung von Rückmeldungen
 *
 * Rückmeldungen kommen von Datenannahmestellen/Kostenträgern als Antwort
 * auf übermittelte DTA-Dateien. Sie enthalten:
 * - Quittungen (technische Bestätigung des Empfangs)
 * - Annahmebestätigungen (fachliche Prüfung bestanden)
 * - Fehlermeldungen (technisch/fachlich abgelehnt)
 * - Abrechnungsergebnisse (mit Einzelpositionen)
 * - Zahlungsavise (Überweisungsankündigung)
 *
 * Original-Rückmeldung wird IMMER unverändert gespeichert.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction, computeContentHash } from '../billing/core/audit'

// ── Types ───────────────────────────────────────────────────────

export type RuecklaeuferTyp =
  | 'quittung' | 'annahmebestaetigung' | 'fehlermeldung'
  | 'abrechnungsergebnis' | 'zahlungsavis' | 'sonstige'

export type RuecklaeuferStatus =
  | 'eingegangen' | 'in_verarbeitung' | 'zugeordnet'
  | 'angenommen' | 'angenommen_mit_hinweis'
  | 'teilweise_abgelehnt' | 'abgelehnt'
  | 'technischer_fehler' | 'fachlicher_fehler'
  | 'duplikat' | 'korrektur_erforderlich'
  | 'korrektur_erstellt' | 'erledigt'

export interface RuecklaeuferPosition {
  invoiceItemId?: string
  positionNummer?: number
  leistungsart?: string
  leistungsdatum?: string
  betragAngefordertCent?: number
  betragAnerkannt_cent?: number
  fehlerCode?: string
  fehlerText?: string
  ablehnungsgrund?: string
  status: 'offen' | 'angenommen' | 'abgelehnt' | 'gekuerzt' | 'korrigiert'
}

export interface RuecklaeuferImportParams {
  organizationId: string
  laufId?: string
  dakotaAuftragId?: string
  invoiceId?: string
  clientId?: string
  kostentraegerIk?: string
  ruecklaeuferTyp: RuecklaeuferTyp
  originalMeldung: string
  quelldateiName?: string
  quelldateiUrl?: string
  positionen?: RuecklaeuferPosition[]
  betragAngefordertCent?: number
  betragAnerkannt_cent?: number
  fehlerCode?: string
  fehlerText?: string
  hinweise?: string[]
  ablehnungsgruende?: string[]
  actorId: string
}

export interface RuecklaeuferImportErgebnis {
  ruecklaeuferId: string
  status: RuecklaeuferStatus
  zugeordnet: boolean
  positionenGesamt: number
  positionenAngenommen: number
  positionenAbgelehnt: number
  fehlerErstellt: boolean
}

// ── Rückläufer importieren ──────────────────────────────────────

export async function importiereRuecklaeufer(
  supabase: SupabaseClient,
  params: RuecklaeuferImportParams,
): Promise<RuecklaeuferImportErgebnis> {
  // Hash der Quelldatei für Duplikat-Erkennung
  const quelldateiHash = params.originalMeldung
    ? await computeContentHash({ content: params.originalMeldung })
    : undefined

  // Duplikat prüfen
  if (quelldateiHash) {
    const { data: existing } = await supabase
      .from('dta_ruecklaeufer')
      .select('id')
      .eq('organization_id', params.organizationId)
      .eq('quelldatei_hash', quelldateiHash)
      .maybeSingle()

    if (existing) {
      return {
        ruecklaeuferId: existing.id,
        status: 'duplikat',
        zugeordnet: false,
        positionenGesamt: 0,
        positionenAngenommen: 0,
        positionenAbgelehnt: 0,
        fehlerErstellt: false,
      }
    }
  }

  // Status aus Typ ableiten
  const status = statusAusTyp(params.ruecklaeuferTyp, params.fehlerCode)

  // Positionen zählen
  const posAngenommen = params.positionen?.filter(p => p.status === 'angenommen').length ?? 0
  const posAbgelehnt = params.positionen?.filter(p =>
    p.status === 'abgelehnt' || p.status === 'gekuerzt',
  ).length ?? 0

  // Rückläufer anlegen
  const { data: ruecklaeufer, error } = await supabase
    .from('dta_ruecklaeufer')
    .insert({
      organization_id: params.organizationId,
      lauf_id: params.laufId || null,
      dakota_auftrag_id: params.dakotaAuftragId || null,
      invoice_id: params.invoiceId || null,
      client_id: params.clientId || null,
      kostentraeger_ik: params.kostentraegerIk || null,
      ruecklaeufer_typ: params.ruecklaeuferTyp,
      status,
      fehler_code: params.fehlerCode || null,
      fehler_text: params.fehlerText || null,
      original_meldung: params.originalMeldung,
      betrag_angefordert_cent: params.betragAngefordertCent ?? null,
      betrag_anerkannt_cent: params.betragAnerkannt_cent ?? null,
      positionen_gesamt: params.positionen?.length ?? 0,
      positionen_angenommen: posAngenommen,
      positionen_abgelehnt: posAbgelehnt,
      ablehnungsgruende: params.ablehnungsgruende ?? [],
      hinweise: params.hinweise ?? [],
      quelldatei_url: params.quelldateiUrl || null,
      quelldatei_hash: quelldateiHash || null,
      quelldatei_name: params.quelldateiName || null,
      bearbeitet_von: params.actorId,
      bearbeitet_am: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error || !ruecklaeufer) {
    throw new Error(`Rückläufer konnte nicht erstellt werden: ${error?.message}`)
  }

  // Positionen speichern
  if (params.positionen?.length) {
    const posRows = params.positionen.map((p, i) => ({
      organization_id: params.organizationId,
      ruecklaeufer_id: ruecklaeufer.id,
      invoice_item_id: p.invoiceItemId || null,
      position_nummer: p.positionNummer ?? (i + 1),
      leistungsart: p.leistungsart || null,
      leistungsdatum: p.leistungsdatum || null,
      status: p.status,
      betrag_angefordert_cent: p.betragAngefordertCent ?? null,
      betrag_anerkannt_cent: p.betragAnerkannt_cent ?? null,
      fehler_code: p.fehlerCode || null,
      fehler_text: p.fehlerText || null,
      ablehnungsgrund: p.ablehnungsgrund || null,
    }))

    await supabase.from('dta_ruecklaeufer_positionen').insert(posRows)
  }

  // Lauf-Status aktualisieren (wenn zugeordnet)
  let zugeordnet = false
  if (params.laufId) {
    const { data: lauf } = await supabase
      .from('abrechnungslaeufe')
      .select('id')
      .eq('id', params.laufId)
      .eq('organization_id', params.organizationId)
      .maybeSingle()

    if (lauf) {
      zugeordnet = true
      const laufAntwortStatus = mapRuecklaeuferZuLaufStatus(status)
      if (laufAntwortStatus) {
        await supabase
          .from('abrechnungslaeufe')
          .update({
            antwort_status: laufAntwortStatus,
            antwort_am: new Date().toISOString(),
            antwort_datei_url: params.quelldateiUrl || null,
          })
          .eq('id', params.laufId)
          .eq('organization_id', params.organizationId)

        const neuerLaufStatus = mapAntwortZuLaufStatus(laufAntwortStatus)
        if (neuerLaufStatus) {
          await supabase
            .from('abrechnungslaeufe')
            .update({ status: neuerLaufStatus })
            .eq('id', params.laufId)
            .eq('organization_id', params.organizationId)
        }
      }
    }
  }

  // Fehlerprotokoll erstellen bei Fehlern
  let fehlerErstellt = false
  if (['technischer_fehler', 'fachlicher_fehler', 'abgelehnt', 'teilweise_abgelehnt', 'korrektur_erforderlich'].includes(status)) {
    await supabase.from('dta_fehlerprotokoll').insert({
      organization_id: params.organizationId,
      lauf_id: params.laufId || null,
      dakota_auftrag_id: params.dakotaAuftragId || null,
      ruecklaeufer_id: ruecklaeufer.id,
      invoice_id: params.invoiceId || null,
      client_id: params.clientId || null,
      kostentraeger_ik: params.kostentraegerIk || null,
      fehler_quelle: 'ruecklaeufer',
      fehler_kategorie: status === 'technischer_fehler' ? 'technisch' : 'fachlich',
      fehler_code: params.fehlerCode || null,
      fehler_meldung: params.fehlerText || `Rückläufer: ${status}`,
      original_meldung: params.originalMeldung?.slice(0, 2000) || null,
      schweregrad: status === 'abgelehnt' ? 'kritisch' : 'fehler',
      bearbeitungsstatus: 'neu',
    })
    fehlerErstellt = true
  }

  // Audit
  await logBillingAction(supabase, {
    entityType: 'ruecklaeufer',
    entityId: ruecklaeufer.id,
    action: 'ruecklaeufer_importiert',
    newState: {
      typ: params.ruecklaeuferTyp,
      status,
      lauf_id: params.laufId,
      positionen: params.positionen?.length ?? 0,
      fehler: fehlerErstellt,
    },
    actorId: params.actorId,
  })

  return {
    ruecklaeuferId: ruecklaeufer.id,
    status,
    zugeordnet,
    positionenGesamt: params.positionen?.length ?? 0,
    positionenAngenommen: posAngenommen,
    positionenAbgelehnt: posAbgelehnt,
    fehlerErstellt,
  }
}

// ── Automatische Zuordnung ──────────────────────────────────────

export async function ordneRuecklaeuferZu(
  supabase: SupabaseClient,
  ruecklaeuferId: string,
  laufId: string,
  actorId: string,
  organizationId?: string,
): Promise<void> {
  let rlQuery = supabase
    .from('dta_ruecklaeufer')
    .select('id, status, organization_id')
    .eq('id', ruecklaeuferId)
  if (organizationId) rlQuery = rlQuery.eq('organization_id', organizationId)
  const { data: rl } = await rlQuery.single()

  if (!rl) throw new Error('Rückläufer nicht gefunden')

  const { data: lauf } = await supabase
    .from('abrechnungslaeufe')
    .select('id')
    .eq('id', laufId)
    .eq('organization_id', rl.organization_id)
    .maybeSingle()
  if (!lauf) throw new Error('Abrechnungslauf nicht gefunden oder gehört zu einer anderen Organisation')

  await supabase
    .from('dta_ruecklaeufer')
    .update({
      lauf_id: laufId,
      status: 'zugeordnet',
      bearbeitet_von: actorId,
      bearbeitet_am: new Date().toISOString(),
    })
    .eq('id', ruecklaeuferId)

  await logBillingAction(supabase, {
    entityType: 'ruecklaeufer',
    entityId: ruecklaeuferId,
    action: 'ruecklaeufer_zugeordnet',
    previousState: { status: rl.status },
    newState: { status: 'zugeordnet', lauf_id: laufId },
    actorId,
  })
}

// ── Rückläufer als erledigt markieren ───────────────────────────

export async function markiereRuecklaeuferErledigt(
  supabase: SupabaseClient,
  ruecklaeuferId: string,
  actorId: string,
  organizationId?: string,
): Promise<void> {
  let erledigtUpdate = supabase
    .from('dta_ruecklaeufer')
    .update({
      status: 'erledigt',
      bearbeitet_von: actorId,
      bearbeitet_am: new Date().toISOString(),
    })
    .eq('id', ruecklaeuferId)
  if (organizationId) erledigtUpdate = erledigtUpdate.eq('organization_id', organizationId)
  await erledigtUpdate

  await logBillingAction(supabase, {
    entityType: 'ruecklaeufer',
    entityId: ruecklaeuferId,
    action: 'ruecklaeufer_erledigt',
    actorId,
  })
}

// ── Hilfsfunktionen ─────────────────────────────────────────────

function statusAusTyp(typ: RuecklaeuferTyp, fehlerCode?: string): RuecklaeuferStatus {
  switch (typ) {
    case 'quittung': return 'angenommen'
    case 'annahmebestaetigung': return 'angenommen'
    case 'fehlermeldung': return fehlerCode?.startsWith('T') ? 'technischer_fehler' : 'fachlicher_fehler'
    case 'abrechnungsergebnis': return 'eingegangen'
    case 'zahlungsavis': return 'angenommen'
    case 'sonstige': return 'eingegangen'
    default: return 'eingegangen'
  }
}

function mapRuecklaeuferZuLaufStatus(rlStatus: RuecklaeuferStatus): string | null {
  switch (rlStatus) {
    case 'angenommen': return 'angenommen'
    case 'angenommen_mit_hinweis': return 'angenommen_mit_hinweis'
    case 'teilweise_abgelehnt': return 'teilweise_abgelehnt'
    case 'abgelehnt': return 'abgelehnt'
    case 'technischer_fehler': return 'technischer_fehler'
    case 'fachlicher_fehler': return 'fachlicher_fehler'
    case 'korrektur_erforderlich': return 'korrektur_erforderlich'
    default: return null
  }
}

function mapAntwortZuLaufStatus(antwortStatus: string): string | null {
  switch (antwortStatus) {
    case 'angenommen': return 'angenommen'
    case 'angenommen_mit_hinweis': return 'angenommen'
    case 'teilweise_abgelehnt': return 'teilweise_abgelehnt'
    case 'abgelehnt': return 'abgelehnt'
    case 'technischer_fehler': return 'korrektur_erforderlich'
    case 'fachlicher_fehler': return 'korrektur_erforderlich'
    case 'korrektur_erforderlich': return 'korrektur_erforderlich'
    default: return null
  }
}
