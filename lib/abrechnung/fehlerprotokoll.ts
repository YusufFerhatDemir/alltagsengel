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

/**
 * Derselbe Katalog als Laufzeitwert.
 *
 * Zeichengleich mit CHECK chk_fp_bearbeitungsstatus (Migration
 * 20260808220000). Ein TypScript-Typ prueft nichts an einem Wert, der aus
 * einem Anfragekoerper kommt — dafuer braucht es diese Liste.
 */
export const BEARBEITUNGS_STATUS: readonly BearbeitungsStatus[] = [
  'neu', 'in_pruefung', 'korrektur_erforderlich', 'korrigiert',
  'erneut_eingereicht', 'erledigt', 'ignoriert',
] as const

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
  organizationId?: string
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
      entityType: 'dta_fehlerprotokoll',
      organizationId: params.organizationId,
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
  let fehlerQuery = supabase
    .from('dta_fehlerprotokoll')
    .select('bearbeitungsstatus, organization_id')
    .eq('id', params.fehlerId)
  if (params.organizationId) fehlerQuery = fehlerQuery.eq('organization_id', params.organizationId)
  const { data: existing } = await fehlerQuery.single()

  if (!existing) throw new Error('Fehler nicht gefunden')

  // Zielstatus zuerst gegen den Katalog pruefen.
  //
  // Der Wert kommt aus dem Anfragekoerper der Route und wurde dort nicht
  // geprueft. Ohne diese Zeile faengt ihn erst der CHECK
  // chk_fp_bearbeitungsstatus in der Datenbank ab — und dessen Fehler ging
  // bisher verloren (siehe unten). Fail-closed vor der Uebergangstabelle:
  // ein unbekannter Zielstatus ist keine Frage von Uebergaengen.
  if (!BEARBEITUNGS_STATUS.includes(params.bearbeitungsstatus)) {
    throw new Error(
      `Unbekannter Bearbeitungsstatus: ${params.bearbeitungsstatus}. `
      + `Erlaubt: ${BEARBEITUNGS_STATUS.join(', ')}`,
    )
  }

  /*
   * Erlaubte Uebergaenge — VOLLSTAENDIG, einschliesslich der Endzustaende.
   *
   * Vorher fehlten 'erledigt' und 'ignoriert' in dieser Tabelle, und die
   * Pruefung lautete `if (erlaubt[current] && …)`. Ein Status, der nicht
   * in der Tabelle stand, hatte damit KEINE Beschraenkung: ein erledigter
   * Fehler liess sich auf 'neu' zuruecksetzen, ein ignorierter auf
   * 'erledigt'. Genau die beiden Zustaende, die eine Kassenpruefung als
   * abgeschlossen liest, waren die einzigen ohne Riegel.
   *
   * Die leeren Listen sind deshalb Absicht und kein vergessener Eintrag —
   * dasselbe Muster wie TERMINAL_STATUSES in
   * lib/billing/core/status-machine.ts. Ein Fehler, der wieder aufgemacht
   * werden soll, wird neu angelegt; die alte Zeile bleibt als Beleg stehen.
   */
  const erlaubt: Record<BearbeitungsStatus, BearbeitungsStatus[]> = {
    'neu': ['in_pruefung', 'ignoriert'],
    'in_pruefung': ['korrektur_erforderlich', 'erledigt', 'ignoriert'],
    'korrektur_erforderlich': ['korrigiert', 'ignoriert'],
    'korrigiert': ['erneut_eingereicht', 'erledigt'],
    'erneut_eingereicht': ['erledigt', 'korrektur_erforderlich'],
    // Endzustaende — bewusst leer.
    'erledigt': [],
    'ignoriert': [],
  }

  const current = existing.bearbeitungsstatus as BearbeitungsStatus
  const moeglich = erlaubt[current]
  if (!moeglich) {
    // Ein Status, den der Katalog nicht kennt (Altbestand, per Hand
    // gesetzt): fail-closed. Vorher war genau das der Freifahrtschein.
    throw new Error(
      `Unbekannter Ausgangsstatus "${current}" — Uebergang nicht auswertbar. `
      + `Bekannt: ${BEARBEITUNGS_STATUS.join(', ')}`,
    )
  }
  if (!moeglich.includes(params.bearbeitungsstatus)) {
    throw new Error(
      `Ungültiger Statusübergang: ${current} → ${params.bearbeitungsstatus}. ` +
      (moeglich.length === 0
        ? `"${current}" ist ein Endzustand.`
        : `Erlaubt: ${moeglich.join(', ')}`),
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

  let fehlerUpdate = supabase
    .from('dta_fehlerprotokoll')
    .update(update)
    .eq('id', params.fehlerId)
  if (params.organizationId) fehlerUpdate = fehlerUpdate.eq('organization_id', params.organizationId)
  // Ergebnis auswerten. Vorher wurde das Versprechen nur abgewartet: ein
  // abgelehnter CHECK, eine RLS-Sperre oder ein Verbindungsabbruch fielen
  // still unter den Tisch. Die Route meldete danach { success: true } und
  // der Pruefpfad-Eintrag unten behauptete einen Statuswechsel, den es nie
  // gegeben hat — ein falscher Audit-Eintrag ist schlimmer als keiner.
  const { error: updateError } = await fehlerUpdate
  if (updateError) {
    throw new Error(`Fehler konnte nicht aktualisiert werden: ${updateError.message}`)
  }

  await logBillingAction(supabase, {
    entityType: 'dta_fehlerprotokoll',
    // Aus der geladenen Zeile, nicht aus params: dort ist organizationId
    // optional, und der Audit-Eintrag muss dem Mandanten des Fehlers folgen.
    organizationId: existing.organization_id,
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
