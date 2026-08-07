/**
 * Fehlerprotokoll — Zentrales Fehlermanagement für DTA-Prozesse
 *
 * Sammelt Fehler aus: Validierung, Export, Verschlüsselung, Transport,
 * Annahmestelle, Kostenträger, Rückläufer, internen Prozessen.
 *
 * Status-Workflow:
 *   NEU → IN_PRÜFUNG → KORREKTUR_ERFORDERLICH → KORRIGIERT → ERNEUT_EINGEREICHT → ERLEDIGT
 *                    → IGNORIERT (bei Hinweisen/false positives)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logBillingAction } from '../billing/core/audit'

// ── Types ───────────────────────────────────────────────────────

export type FehlerQuelle =
  | 'validierung' | 'export' | 'verschluesselung' | 'transport'
  | 'annahmestelle' | 'kostentraeger' | 'ruecklaeufer' | 'intern'

export type FehlerKategorie =
  | 'technisch' | 'fachlich' | 'daten' | 'zertifikat'
  | 'verbindung' | 'format' | 'inhalt' | 'sonstig'

export type Schweregrad = 'hinweis' | 'warnung' | 'fehler' | 'kritisch'

export type BearbeitungsStatus =
  | 'neu' | 'in_pruefung' | 'korrektur_erforderlich' | 'korrigiert'
  | 'erneut_eingereicht' | 'erledigt' | 'ignoriert'

export interface FehlerErstellenParams {
  organizationId: string
  laufId?: string
  dakotaAuftragId?: string
  ruecklaeuferId?: string
  invoiceId?: string
  clientId?: string
  kostentraegerIk?: string
  fehlerQuelle: FehlerQuelle
  fehlerKategorie: FehlerKategorie
  fehlerCode?: string
  fehlerMeldung: string
  originalMeldung?: string
  interneErklaerung?: string
  schweregrad?: Schweregrad
  actorId?: string
}

export interface FehlerUpdateParams {
  fehlerId: string
  bearbeitungsstatus: BearbeitungsStatus
  loesung?: string
  interneErklaerung?: string
  korrekturLaufId?: string
  verantwortlicher?: string
  wiedervorlageAm?: string
  actorId: string
}

export interface FehlerDashboardData {
  gesamt: number
  neu: number
  inPruefung: number
  korrekturErforderlich: number
  erledigt: number
  nachQuelle: Record<string, number>
  nachKategorie: Record<string, number>
  nachSchwere: Record<string, number>
  kritisch: number
}

// ── Fehler erstellen ────────────────────────────────────────────

export async function erstelleFehler(
  supabase: SupabaseClient,
  params: FehlerErstellenParams,
): Promise<string> {
  const { data, error } = await supabase
    .from('dta_fehlerprotokoll')
    .insert({
      organization_id: params.organizationId,
      lauf_id: params.laufId || null,
      dakota_auftrag_id: params.dakotaAuftragId || null,
      ruecklaeufer_id: params.ruecklaeuferId || null,
      invoice_id: params.invoiceId || null,
      client_id: params.clientId || null,
      kostentraeger_ik: params.kostentraegerIk || null,
      fehler_quelle: params.fehlerQuelle,
      fehler_kategorie: params.fehlerKategorie,
      fehler_code: params.fehlerCode || null,
      fehler_meldung: params.fehlerMeldung,
      original_meldung: params.originalMeldung || null,
      interne_erklaerung: params.interneErklaerung || null,
      schweregrad: params.schweregrad || 'fehler',
      bearbeitungsstatus: 'neu',
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Fehler konnte nicht erstellt werden: ${error?.message}`)
  }

  if (params.actorId) {
    await logBillingAction(supabase, {
      entityType: 'fehlerprotokoll',
      entityId: data.id,
      action: 'fehler_erstellt',
      newState: {
        quelle: params.fehlerQuelle,
        kategorie: params.fehlerKategorie,
        schwere: params.schweregrad || 'fehler',
        meldung: params.fehlerMeldung,
      },
      actorId: params.actorId,
    })
  }

  return data.id
}

// ── Fehler bearbeiten ───────────────────────────────────────────

export async function aktualisiereFehler(
  supabase: SupabaseClient,
  params: FehlerUpdateParams,
): Promise<void> {
  const { data: existing } = await supabase
    .from('dta_fehlerprotokoll')
    .select('bearbeitungsstatus, organization_id')
    .eq('id', params.fehlerId)
    .single()

  if (!existing) throw new Error('Fehler nicht gefunden')

  // Erlaubte Übergänge
  const erlaubt: Record<string, string[]> = {
    'neu': ['in_pruefung', 'ignoriert'],
    'in_pruefung': ['korrektur_erforderlich', 'erledigt', 'ignoriert'],
    'korrektur_erforderlich': ['korrigiert', 'ignoriert'],
    'korrigiert': ['erneut_eingereicht', 'erledigt'],
    'erneut_eingereicht': ['erledigt', 'korrektur_erforderlich'],
  }

  const current = existing.bearbeitungsstatus
  if (erlaubt[current] && !erlaubt[current].includes(params.bearbeitungsstatus)) {
    throw new Error(
      `Ungültiger Statusübergang: ${current} → ${params.bearbeitungsstatus}. ` +
      `Erlaubt: ${erlaubt[current]?.join(', ')}`,
    )
  }

  const update: Record<string, unknown> = {
    bearbeitungsstatus: params.bearbeitungsstatus,
  }

  if (params.loesung) {
    update.loesung = params.loesung
    update.loesung_am = new Date().toISOString()
  }
  if (params.interneErklaerung) update.interne_erklaerung = params.interneErklaerung
  if (params.korrekturLaufId) update.korrektur_lauf_id = params.korrekturLaufId
  if (params.verantwortlicher) update.verantwortlicher = params.verantwortlicher
  if (params.wiedervorlageAm) update.wiedervorlage_am = params.wiedervorlageAm

  await supabase
    .from('dta_fehlerprotokoll')
    .update(update)
    .eq('id', params.fehlerId)

  await logBillingAction(supabase, {
    entityType: 'fehlerprotokoll',
    entityId: params.fehlerId,
    action: 'fehler_aktualisiert',
    previousState: { status: current },
    newState: { status: params.bearbeitungsstatus, loesung: params.loesung },
    actorId: params.actorId,
  })
}

// ── Dashboard-Daten ─────────────────────────────────────────────

export async function holeFehlerDashboard(
  supabase: SupabaseClient,
  organizationId: string,
  filter?: { laufId?: string; zeitraumVon?: string; zeitraumBis?: string },
): Promise<FehlerDashboardData> {
  let query = supabase
    .from('dta_fehlerprotokoll')
    .select('id, fehler_quelle, fehler_kategorie, schweregrad, bearbeitungsstatus, created_at')
    .eq('organization_id', organizationId)

  if (filter?.laufId) query = query.eq('lauf_id', filter.laufId)
  if (filter?.zeitraumVon) query = query.gte('created_at', filter.zeitraumVon)
  if (filter?.zeitraumBis) query = query.lte('created_at', filter.zeitraumBis)

  const { data: fehler } = await query

  if (!fehler?.length) {
    return {
      gesamt: 0, neu: 0, inPruefung: 0, korrekturErforderlich: 0,
      erledigt: 0, nachQuelle: {}, nachKategorie: {}, nachSchwere: {},
      kritisch: 0,
    }
  }

  const nachQuelle: Record<string, number> = {}
  const nachKategorie: Record<string, number> = {}
  const nachSchwere: Record<string, number> = {}

  for (const f of fehler) {
    nachQuelle[f.fehler_quelle] = (nachQuelle[f.fehler_quelle] || 0) + 1
    nachKategorie[f.fehler_kategorie] = (nachKategorie[f.fehler_kategorie] || 0) + 1
    nachSchwere[f.schweregrad] = (nachSchwere[f.schweregrad] || 0) + 1
  }

  return {
    gesamt: fehler.length,
    neu: fehler.filter(f => f.bearbeitungsstatus === 'neu').length,
    inPruefung: fehler.filter(f => f.bearbeitungsstatus === 'in_pruefung').length,
    korrekturErforderlich: fehler.filter(f => f.bearbeitungsstatus === 'korrektur_erforderlich').length,
    erledigt: fehler.filter(f => f.bearbeitungsstatus === 'erledigt').length,
    nachQuelle,
    nachKategorie,
    nachSchwere,
    kritisch: fehler.filter(f => f.schweregrad === 'kritisch').length,
  }
}
