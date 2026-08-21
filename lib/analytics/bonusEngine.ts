import { UserFacingError } from '@/lib/api/user-facing-error'
// ═══════════════════════════════════════════════════════════════
// Block 19 — Bonussystem: Regelwerk, Berechnungslauf, Freigabe
// Leistungsbezogene Boni auf Basis konfigurierbarer Kriterien.
// Keine hartcodierten Beträge/Prozentsätze — jede Regel kommt aus
// der Tabelle bonus_regeln (Kriterium, Schwellenwert, Punkte).
// Kriterien sind bewusst auf real vorhandene, caregiver-bezogene
// Datenquellen begrenzt (absences, service_records, review_errors).
// ═══════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js'

export type BonusKriteriumTyp =
  | 'keine_ausfaelle'
  | 'vollstaendige_dokumentation'
  | 'keine_offenen_pruefungen'

export const BONUS_KRITERIUM_TYP_WERTE: BonusKriteriumTyp[] = [
  'keine_ausfaelle',
  'vollstaendige_dokumentation',
  'keine_offenen_pruefungen',
]

export const BONUS_KRITERIUM_LABEL: Record<BonusKriteriumTyp, string> = {
  keine_ausfaelle: 'Keine Ausfälle (max. Ausfalltage im Zeitraum)',
  vollstaendige_dokumentation: 'Vollständige Dokumentation (% signierte Leistungsnachweise)',
  keine_offenen_pruefungen: 'Keine offenen Prüfhinweise (% Leistungsnachweise ohne offene Fehler)',
}

export type BonusBerechnungStatus = 'berechnet' | 'freigegeben' | 'abgelehnt' | 'ausgezahlt'

export interface BonusRegel {
  id: string
  organizationId: string
  name: string
  kriteriumTyp: BonusKriteriumTyp
  schwellenwert: number
  punkte: number
  aktiv: boolean
  createdAt: string
}

export interface BonusMesswert {
  erfuellt: boolean
  messwert: number
  begruendung: string
}

export interface BonusBerechnungsErgebnis {
  caregiverId: string
  erfuellt: boolean
  messwert: number
  punkte: number
  begruendung: string
}

export interface BonusBerechnung {
  id: string
  organizationId: string
  regelId: string
  caregiverId: string
  zeitraumVon: string
  zeitraumBis: string
  erfuellt: boolean
  messwert: number | null
  punkte: number
  status: BonusBerechnungStatus
  berechnetAm: string
  details: Record<string, unknown> | null
}

// ── Pure Kriterien-Bewertung ─────────────────────────────────────

export function bewerteKeineAusfaelle(ausfallTage: number, schwellenwertMaxTage: number): BonusMesswert {
  const erfuellt = ausfallTage <= schwellenwertMaxTage
  return { erfuellt, messwert: ausfallTage, begruendung: `${ausfallTage} Ausfalltag(e) im Zeitraum (Grenze: ${schwellenwertMaxTage}).` }
}

export function bewerteVollstaendigeDokumentation(gesamt: number, signiert: number, schwellenwertProzent: number): BonusMesswert {
  if (gesamt === 0) return { erfuellt: false, messwert: 0, begruendung: 'Keine Leistungsnachweise im Zeitraum — Kriterium nicht bewertbar.' }
  const quote = Math.round((signiert / gesamt) * 1000) / 10
  return { erfuellt: quote >= schwellenwertProzent, messwert: quote, begruendung: `${quote}% signierte Leistungsnachweise (Ziel: ${schwellenwertProzent}%).` }
}

export function bewerteKeineOffenenPruefungen(gesamt: number, mitOffenenFehlern: number, schwellenwertProzent: number): BonusMesswert {
  if (gesamt === 0) return { erfuellt: false, messwert: 0, begruendung: 'Keine Leistungsnachweise im Zeitraum — Kriterium nicht bewertbar.' }
  const quoteOhneFehler = Math.round(((gesamt - mitOffenenFehlern) / gesamt) * 1000) / 10
  return { erfuellt: quoteOhneFehler >= schwellenwertProzent, messwert: quoteOhneFehler, begruendung: `${quoteOhneFehler}% ohne offene Prüfhinweise (Ziel: ${schwellenwertProzent}%).` }
}

export function berechnePunkteFuerMesswert(punkteRegel: number, messwert: BonusMesswert): number {
  return messwert.erfuellt ? punkteRegel : 0
}

// ── Row-Mapper ────────────────────────────────────────────────────

function mapRegel(row: any): BonusRegel {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    kriteriumTyp: row.kriterium_typ,
    schwellenwert: Number(row.schwellenwert),
    punkte: Number(row.punkte),
    aktiv: row.aktiv,
    createdAt: row.created_at,
  }
}

function mapBerechnung(row: any): BonusBerechnung {
  return {
    id: row.id,
    organizationId: row.organization_id,
    regelId: row.regel_id,
    caregiverId: row.caregiver_id,
    zeitraumVon: row.zeitraum_von,
    zeitraumBis: row.zeitraum_bis,
    erfuellt: row.erfuellt,
    messwert: row.messwert != null ? Number(row.messwert) : null,
    punkte: Number(row.punkte),
    status: row.status,
    berechnetAm: row.berechnet_am,
    details: row.details,
  }
}

// ── Regelwerk (CRUD) ───────────────────────────────────────────────

export async function listRegeln(supabase: SupabaseClient, organizationId: string): Promise<BonusRegel[]> {
  const { data, error } = await supabase
    .from('bonus_regeln')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Regelwerk konnte nicht geladen werden: ${error.message}`)
  return (data || []).map(mapRegel)
}

export async function createRegel(
  supabase: SupabaseClient,
  params: { organizationId: string; name: string; kriteriumTyp: BonusKriteriumTyp; schwellenwert: number; punkte: number; userId: string },
): Promise<BonusRegel> {
  if (!BONUS_KRITERIUM_TYP_WERTE.includes(params.kriteriumTyp)) throw new Error(`Unbekanntes Kriterium: ${params.kriteriumTyp}`)
  if (!(params.punkte > 0)) throw new UserFacingError('Punkte müssen größer als 0 sein.')
  const { data, error } = await supabase
    .from('bonus_regeln')
    .insert({
      organization_id: params.organizationId,
      name: params.name,
      kriterium_typ: params.kriteriumTyp,
      schwellenwert: params.schwellenwert,
      punkte: params.punkte,
      aktiv: true,
      created_by: params.userId,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Regel konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return mapRegel(data)
}

export async function setRegelAktiv(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string; aktiv: boolean },
): Promise<BonusRegel> {
  const { data, error } = await supabase
    .from('bonus_regeln')
    .update({ aktiv: params.aktiv, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Regel konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return mapRegel(data)
}

// ── Berechnungslauf ────────────────────────────────────────────────

export async function fuehreBerechnungslaufDurch(
  supabase: SupabaseClient,
  params: { organizationId: string; regelId: string; von: string; bis: string; userId: string },
): Promise<BonusBerechnungsErgebnis[]> {
  const { organizationId, regelId, von, bis, userId } = params

  const { data: regelRow, error: regelErr } = await supabase
    .from('bonus_regeln')
    .select('*')
    .eq('id', regelId)
    .eq('organization_id', organizationId)
    .single()
  if (regelErr || !regelRow) throw new Error(`Regel nicht gefunden: ${regelErr?.message ?? regelId}`)
  const regel = mapRegel(regelRow)
  if (!regel.aktiv) throw new UserFacingError('Regel ist deaktiviert — kein Berechnungslauf möglich.')

  const { data: caregiverRows, error: caregiverErr } = await supabase
    .from('caregivers')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
  if (caregiverErr) throw new Error(`Kräfte konnten nicht geladen werden: ${caregiverErr.message}`)
  const caregiverIds = (caregiverRows || []).map((c: any) => c.id as string)
  if (caregiverIds.length === 0) return []

  const messwerte = await ermittleMesswerte(supabase, organizationId, regel.kriteriumTyp, caregiverIds, von, bis)

  const ergebnisse: BonusBerechnungsErgebnis[] = []
  for (const caregiverId of caregiverIds) {
    const messwert = messwerte(caregiverId, regel.schwellenwert)
    const punkte = berechnePunkteFuerMesswert(regel.punkte, messwert)
    ergebnisse.push({ caregiverId, erfuellt: messwert.erfuellt, messwert: messwert.messwert, punkte, begruendung: messwert.begruendung })

    const { error: upsertErr } = await supabase
      .from('bonus_berechnungen')
      .upsert(
        {
          organization_id: organizationId,
          regel_id: regelId,
          caregiver_id: caregiverId,
          zeitraum_von: von,
          zeitraum_bis: bis,
          erfuellt: messwert.erfuellt,
          messwert: messwert.messwert,
          punkte,
          status: 'berechnet',
          berechnet_am: new Date().toISOString(),
          berechnet_von: userId,
          details: { begruendung: messwert.begruendung, kriteriumTyp: regel.kriteriumTyp },
        },
        { onConflict: 'regel_id,caregiver_id,zeitraum_von,zeitraum_bis' },
      )
    if (upsertErr) throw new Error(`Berechnung konnte nicht gespeichert werden: ${upsertErr.message}`)
  }
  return ergebnisse
}

async function ermittleMesswerte(
  supabase: SupabaseClient,
  organizationId: string,
  kriteriumTyp: BonusKriteriumTyp,
  caregiverIds: string[],
  von: string,
  bis: string,
): Promise<(caregiverId: string, schwellenwert: number) => BonusMesswert> {
  if (kriteriumTyp === 'keine_ausfaelle') {
    const { data, error } = await supabase
      .from('absences')
      .select('caregiver_id, start_date, end_date')
      .eq('organization_id', organizationId)
      .in('caregiver_id', caregiverIds)
      .lte('start_date', bis)
      .gte('end_date', von)
    if (error) throw new Error(`Abwesenheiten konnten nicht geladen werden: ${error.message}`)
    const tageProCaregiver = new Map<string, number>()
    for (const row of data || []) {
      const start = new Date(Math.max(new Date(row.start_date).getTime(), new Date(von).getTime()))
      const end = new Date(Math.min(new Date(row.end_date).getTime(), new Date(bis).getTime()))
      const tage = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
      tageProCaregiver.set(row.caregiver_id, (tageProCaregiver.get(row.caregiver_id) || 0) + tage)
    }
    return (caregiverId, schwellenwert) => bewerteKeineAusfaelle(tageProCaregiver.get(caregiverId) || 0, schwellenwert)
  }

  // vollstaendige_dokumentation / keine_offenen_pruefungen — beide brauchen service_records
  const { data: records, error: recErr } = await supabase
    .from('service_records')
    .select('id, caregiver_id, client_signature')
    .eq('organization_id', organizationId)
    .in('caregiver_id', caregiverIds)
    .gte('date', von)
    .lte('date', bis)
  if (recErr) throw new Error(`Leistungsnachweise konnten nicht geladen werden: ${recErr.message}`)

  const gesamtProCaregiver = new Map<string, number>()
  const signiertProCaregiver = new Map<string, number>()
  const recordCaregiverMap = new Map<string, string>()
  for (const r of records || []) {
    gesamtProCaregiver.set(r.caregiver_id, (gesamtProCaregiver.get(r.caregiver_id) || 0) + 1)
    if (r.client_signature) signiertProCaregiver.set(r.caregiver_id, (signiertProCaregiver.get(r.caregiver_id) || 0) + 1)
    recordCaregiverMap.set(r.id, r.caregiver_id)
  }

  if (kriteriumTyp === 'vollstaendige_dokumentation') {
    return (caregiverId, schwellenwert) =>
      bewerteVollstaendigeDokumentation(gesamtProCaregiver.get(caregiverId) || 0, signiertProCaregiver.get(caregiverId) || 0, schwellenwert)
  }

  // keine_offenen_pruefungen
  const recordIds = (records || []).map(r => r.id)
  const fehlerProCaregiver = new Map<string, number>()
  if (recordIds.length > 0) {
    const { data: fehler, error: fehlerErr } = await supabase
      .from('review_errors')
      .select('service_record_id')
      .in('service_record_id', recordIds)
      .eq('resolved', false)
    if (fehlerErr) throw new Error(`Prüfhinweise konnten nicht geladen werden: ${fehlerErr.message}`)
    for (const f of fehler || []) {
      const caregiverId = recordCaregiverMap.get(f.service_record_id)
      if (caregiverId) fehlerProCaregiver.set(caregiverId, (fehlerProCaregiver.get(caregiverId) || 0) + 1)
    }
  }
  return (caregiverId, schwellenwert) =>
    bewerteKeineOffenenPruefungen(gesamtProCaregiver.get(caregiverId) || 0, fehlerProCaregiver.get(caregiverId) || 0, schwellenwert)
}

// ── Freigabe-Workflow ────────────────────────────────────────────

export async function listBerechnungen(
  supabase: SupabaseClient,
  params: { organizationId: string; status?: BonusBerechnungStatus },
): Promise<BonusBerechnung[]> {
  let query = supabase.from('bonus_berechnungen').select('*').eq('organization_id', params.organizationId).order('berechnet_am', { ascending: false })
  if (params.status) query = query.eq('status', params.status)
  const { data, error } = await query
  if (error) throw new Error(`Berechnungen konnten nicht geladen werden: ${error.message}`)
  return (data || []).map(mapBerechnung)
}

export async function freigebenBerechnung(
  supabase: SupabaseClient,
  params: { organizationId: string; berechnungId: string; entscheidung: 'freigegeben' | 'abgelehnt'; kommentar?: string; userId: string },
): Promise<BonusBerechnung> {
  const { data: berechnungRow, error: berechnungErr } = await supabase
    .from('bonus_berechnungen')
    .select('*')
    .eq('id', params.berechnungId)
    .eq('organization_id', params.organizationId)
    .single()
  if (berechnungErr || !berechnungRow) throw new Error(`Berechnung nicht gefunden: ${berechnungErr?.message ?? params.berechnungId}`)
  if (berechnungRow.status !== 'berechnet') throw new Error(`Berechnung ist bereits entschieden (Status: ${berechnungRow.status}).`)

  const { error: freigabeErr } = await supabase.from('bonus_freigaben').insert({
    organization_id: params.organizationId,
    berechnung_id: params.berechnungId,
    entscheidung: params.entscheidung,
    kommentar: params.kommentar ?? null,
    entschieden_von: params.userId,
  })
  if (freigabeErr) throw new Error(`Freigabe konnte nicht gespeichert werden: ${freigabeErr.message}`)

  const { data: updated, error: updateErr } = await supabase
    .from('bonus_berechnungen')
    .update({ status: params.entscheidung })
    .eq('id', params.berechnungId)
    .eq('organization_id', params.organizationId)
    .select('*')
    .single()
  if (updateErr || !updated) throw new Error(`Status konnte nicht aktualisiert werden: ${updateErr?.message ?? 'unbekannt'}`)
  return mapBerechnung(updated)
}
