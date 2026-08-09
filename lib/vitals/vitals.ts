// ═══════════════════════════════════════════════════════════════
// Vitalwerte — Datenzugriff & Alarm-Logik
// CRUD auf vital_signs / vital_sign_thresholds plus die pure
// Bewertungsfunktion bewerteMesswert (Grenzwert-Alarme).
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  VITAL_TYPEN,
  assertVitalTyp,
  type AlarmBewertung,
  type AlarmStufe,
  type Grenzwerte,
  type VitalSign,
  type VitalSignThreshold,
  type VitalTyp,
} from './types'

// ── Validierung ──────────────────────────────────────────────────

/** Wirft bei unplausiblen Eingaben (Tippfehler-Schutz, kein Alarm). */
export function validierePlausibilitaet(typ: VitalTyp, wert: number, wertSekundaer?: number | null): void {
  const cfg = VITAL_TYPEN[typ]
  if (!Number.isFinite(wert)) throw new Error(`${cfg.label}: Wert fehlt oder ist keine Zahl.`)
  if (wert < cfg.plausibelMin || wert > cfg.plausibelMax) {
    throw new Error(`${cfg.label}: ${wert} ${cfg.einheit} liegt außerhalb des plausiblen Bereichs (${cfg.plausibelMin}–${cfg.plausibelMax}).`)
  }
  if (cfg.hatSekundaer) {
    if (wertSekundaer == null || !Number.isFinite(wertSekundaer)) {
      throw new Error(`${cfg.label}: ${cfg.labelSekundaer} ist ein Pflichtfeld.`)
    }
    if (wertSekundaer < cfg.plausibelMin || wertSekundaer > cfg.plausibelMax) {
      throw new Error(`${cfg.label}: ${cfg.labelSekundaer} ${wertSekundaer} ${cfg.einheit} liegt außerhalb des plausiblen Bereichs (${cfg.plausibelMin}–${cfg.plausibelMax}).`)
    }
    if (wertSekundaer >= wert) {
      throw new Error(`${cfg.label}: Diastolisch (${wertSekundaer}) muss unter systolisch (${wert}) liegen.`)
    }
  } else if (wertSekundaer != null) {
    throw new Error(`${cfg.label}: Ein Zweitwert ist nur beim Blutdruck erlaubt.`)
  }
}

/** Wirft bei inkonsistenten Grenzwerten (min ≥ max, kritisch innerhalb warn). */
export function validiereGrenzwerte(typ: VitalTyp, g: Grenzwerte): void {
  const cfg = VITAL_TYPEN[typ]
  const pruefe = (minW: number | null | undefined, maxW: number | null | undefined,
    minK: number | null | undefined, maxK: number | null | undefined, praefix: string) => {
    if (minW != null && maxW != null && minW >= maxW) {
      throw new Error(`${praefix}: Untere Warngrenze (${minW}) muss unter der oberen (${maxW}) liegen.`)
    }
    if (minK != null && maxK != null && minK >= maxK) {
      throw new Error(`${praefix}: Untere kritische Grenze (${minK}) muss unter der oberen (${maxK}) liegen.`)
    }
    if (minK != null && minW != null && minK > minW) {
      throw new Error(`${praefix}: Untere kritische Grenze (${minK}) darf nicht über der Warngrenze (${minW}) liegen.`)
    }
    if (maxK != null && maxW != null && maxK < maxW) {
      throw new Error(`${praefix}: Obere kritische Grenze (${maxK}) darf nicht unter der Warngrenze (${maxW}) liegen.`)
    }
  }
  pruefe(g.min_warn, g.max_warn, g.min_critical, g.max_critical, cfg.label)
  if (cfg.hatSekundaer) {
    pruefe(g.min_warn_secondary, g.max_warn_secondary, g.min_critical_secondary, g.max_critical_secondary, `${cfg.label} (${cfg.labelSekundaer})`)
  } else if (
    g.min_warn_secondary != null || g.max_warn_secondary != null
    || g.min_critical_secondary != null || g.max_critical_secondary != null
  ) {
    throw new Error(`${cfg.label}: Sekundär-Grenzwerte sind nur beim Blutdruck erlaubt.`)
  }
}

// ── Alarm-Bewertung (pure) ───────────────────────────────────────

function bewerteEinzelwert(
  wert: number, g: { min_warn?: number | null; max_warn?: number | null; min_critical?: number | null; max_critical?: number | null },
  label: string, einheit: string,
): { stufe: AlarmStufe; meldung: string | null } {
  if (g.min_critical != null && wert < g.min_critical) {
    return { stufe: 'kritisch', meldung: `${label} ${wert} ${einheit} unter kritischer Grenze (${g.min_critical})` }
  }
  if (g.max_critical != null && wert > g.max_critical) {
    return { stufe: 'kritisch', meldung: `${label} ${wert} ${einheit} über kritischer Grenze (${g.max_critical})` }
  }
  if (g.min_warn != null && wert < g.min_warn) {
    return { stufe: 'warnung', meldung: `${label} ${wert} ${einheit} unter Warngrenze (${g.min_warn})` }
  }
  if (g.max_warn != null && wert > g.max_warn) {
    return { stufe: 'warnung', meldung: `${label} ${wert} ${einheit} über Warngrenze (${g.max_warn})` }
  }
  return { stufe: 'ok', meldung: null }
}

/**
 * Bewertet eine Messung gegen den klientenspezifischen Grenzwert-Satz.
 * Fällt auf die Standard-Grenzwerte des Typs zurück, wenn keiner hinterlegt
 * (oder der hinterlegte deaktiviert) ist. Typen ohne Standard → immer 'ok'.
 */
export function bewerteMesswert(
  typ: VitalTyp,
  wert: number,
  wertSekundaer: number | null | undefined,
  grenzwert: (Grenzwerte & { enabled?: boolean }) | null | undefined,
): AlarmBewertung {
  const cfg = VITAL_TYPEN[typ]
  let grenzen: Grenzwerte | null = null
  let quelle: AlarmBewertung['quelle'] = 'keine'
  if (grenzwert && grenzwert.enabled !== false) {
    grenzen = grenzwert
    quelle = 'klient'
  } else if (cfg.standard) {
    grenzen = cfg.standard
    quelle = 'standard'
  }
  if (!grenzen) return { stufe: 'ok', meldungen: [], quelle }

  const ergebnisse = [bewerteEinzelwert(wert, grenzen, cfg.labelWert, cfg.einheit)]
  if (cfg.hatSekundaer && wertSekundaer != null) {
    ergebnisse.push(bewerteEinzelwert(wertSekundaer, {
      min_warn: grenzen.min_warn_secondary, max_warn: grenzen.max_warn_secondary,
      min_critical: grenzen.min_critical_secondary, max_critical: grenzen.max_critical_secondary,
    }, cfg.labelSekundaer ?? 'Zweitwert', cfg.einheit))
  }

  const meldungen = ergebnisse.map(e => e.meldung).filter((m): m is string => m !== null)
  const stufe: AlarmStufe = ergebnisse.some(e => e.stufe === 'kritisch')
    ? 'kritisch'
    : ergebnisse.some(e => e.stufe === 'warnung') ? 'warnung' : 'ok'
  return { stufe, meldungen, quelle }
}

// ── CRUD: vital_signs ────────────────────────────────────────────

export interface ListVitalsFilter {
  organizationId: string
  clientId?: string
  typ?: VitalTyp
  vonDatum?: string
  bisDatum?: string
  limit?: number
}

export async function listVitals(supabase: SupabaseClient, filter: ListVitalsFilter): Promise<VitalSign[]> {
  let query = supabase
    .from('vital_signs')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('measured_at', { ascending: false })
    .limit(Math.min(filter.limit ?? 500, 2000))

  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.typ) query = query.eq('type', filter.typ)
  if (filter.vonDatum) query = query.gte('measured_at', filter.vonDatum)
  if (filter.bisDatum) query = query.lte('measured_at', filter.bisDatum)

  const { data, error } = await query
  if (error) throw new Error(`Vitalwerte konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as VitalSign[]
}

export interface CreateVitalParams {
  /**
   * Weglassen, wenn mit einem user-scoped Client geschrieben wird (Engel):
   * dann füllt der Spalten-Default current_org_id() die Organisation, und RLS
   * (engel_vital_signs_insert) entscheidet über die Berechtigung.
   */
  organizationId?: string
  clientId: string
  typ: VitalTyp
  wert: number
  wertSekundaer?: number | null
  gemessenAm?: string
  gemessenVon: string
  gemessenVonName: string
  gemessenVonRolle: string
  notizen?: string | null
}

export async function createVital(supabase: SupabaseClient, params: CreateVitalParams): Promise<VitalSign> {
  assertVitalTyp(params.typ)
  validierePlausibilitaet(params.typ, params.wert, params.wertSekundaer)
  const cfg = VITAL_TYPEN[params.typ]

  const { data, error } = await supabase
    .from('vital_signs')
    .insert({
      ...(params.organizationId ? { organization_id: params.organizationId } : {}),
      client_id: params.clientId,
      type: params.typ,
      value: params.wert,
      value_secondary: cfg.hatSekundaer ? params.wertSekundaer : null,
      unit: cfg.einheit,
      measured_at: params.gemessenAm ?? new Date().toISOString(),
      measured_by: params.gemessenVon,
      measured_by_name: params.gemessenVonName,
      measured_by_role: params.gemessenVonRolle,
      notes: params.notizen?.trim() || null,
    })
    .select()
    .single()

  if (error) throw new Error(`Vitalwert konnte nicht gespeichert werden: ${error.message}`)
  return data as VitalSign
}

export interface UpdateVitalParams {
  wert?: number
  wertSekundaer?: number | null
  gemessenAm?: string
  notizen?: string | null
}

export async function updateVital(
  supabase: SupabaseClient, id: string, organizationId: string, params: UpdateVitalParams,
): Promise<VitalSign> {
  const { data: bestehend, error: ladeFehler } = await supabase
    .from('vital_signs')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()
  if (ladeFehler || !bestehend) throw new Error('Vitalwert nicht gefunden.')

  const typ = (bestehend as VitalSign).type
  const neuerWert = params.wert ?? Number((bestehend as VitalSign).value)
  const neuerSekundaer = params.wertSekundaer !== undefined
    ? params.wertSekundaer
    : (bestehend as VitalSign).value_secondary != null ? Number((bestehend as VitalSign).value_secondary) : null
  validierePlausibilitaet(typ, neuerWert, neuerSekundaer)

  const { data, error } = await supabase
    .from('vital_signs')
    .update({
      value: neuerWert,
      value_secondary: neuerSekundaer,
      ...(params.gemessenAm ? { measured_at: params.gemessenAm } : {}),
      ...(params.notizen !== undefined ? { notes: params.notizen?.trim() || null } : {}),
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single()

  if (error) throw new Error(`Vitalwert konnte nicht aktualisiert werden: ${error.message}`)
  return data as VitalSign
}

export async function deleteVital(supabase: SupabaseClient, id: string, organizationId: string): Promise<void> {
  const { error, count } = await supabase
    .from('vital_signs')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(`Vitalwert konnte nicht gelöscht werden: ${error.message}`)
  if (!count) throw new Error('Vitalwert nicht gefunden.')
}

// ── CRUD: vital_sign_thresholds ──────────────────────────────────

export async function listThresholds(
  supabase: SupabaseClient, organizationId: string, clientId?: string,
): Promise<VitalSignThreshold[]> {
  let query = supabase
    .from('vital_sign_thresholds')
    .select('*')
    .eq('organization_id', organizationId)
  if (clientId) query = query.eq('client_id', clientId)
  const { data, error } = await query
  if (error) throw new Error(`Grenzwerte konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as VitalSignThreshold[]
}

export interface UpsertThresholdParams extends Grenzwerte {
  organizationId: string
  clientId: string
  typ: VitalTyp
  enabled?: boolean
  notizen?: string | null
  erstelltVon: string
}

export async function upsertThreshold(supabase: SupabaseClient, params: UpsertThresholdParams): Promise<VitalSignThreshold> {
  assertVitalTyp(params.typ)
  validiereGrenzwerte(params.typ, params)

  const { data, error } = await supabase
    .from('vital_sign_thresholds')
    .upsert({
      organization_id: params.organizationId,
      client_id: params.clientId,
      type: params.typ,
      min_warn: params.min_warn,
      max_warn: params.max_warn,
      min_critical: params.min_critical,
      max_critical: params.max_critical,
      min_warn_secondary: params.min_warn_secondary ?? null,
      max_warn_secondary: params.max_warn_secondary ?? null,
      min_critical_secondary: params.min_critical_secondary ?? null,
      max_critical_secondary: params.max_critical_secondary ?? null,
      enabled: params.enabled ?? true,
      notes: params.notizen?.trim() || null,
      created_by: params.erstelltVon,
    }, { onConflict: 'client_id,type' })
    .select()
    .single()

  if (error) throw new Error(`Grenzwert konnte nicht gespeichert werden: ${error.message}`)
  return data as VitalSignThreshold
}

export async function deleteThreshold(supabase: SupabaseClient, id: string, organizationId: string): Promise<void> {
  const { error, count } = await supabase
    .from('vital_sign_thresholds')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(`Grenzwert konnte nicht gelöscht werden: ${error.message}`)
  if (!count) throw new Error('Grenzwert nicht gefunden.')
}

// ── Alarm-Übersicht ──────────────────────────────────────────────

export interface KlientenAlarm {
  client_id: string
  type: VitalTyp
  messung: VitalSign
  bewertung: AlarmBewertung
}

/**
 * Bewertet je Klient und Vitaltyp die JÜNGSTE Messung im Zeitfenster.
 * Ältere Messungen lösen keinen aktiven Alarm mehr aus — es zählt der
 * letzte bekannte Zustand.
 */
export function berechneAktuelleAlarme(
  messungen: VitalSign[], grenzwerte: VitalSignThreshold[],
): KlientenAlarm[] {
  const grenzenIndex = new Map<string, VitalSignThreshold>()
  for (const g of grenzwerte) grenzenIndex.set(`${g.client_id}:${g.type}`, g)

  // messungen kommen measured_at-absteigend sortiert — die erste je (klient, typ) ist die jüngste.
  const juengste = new Map<string, VitalSign>()
  for (const m of messungen) {
    const key = `${m.client_id}:${m.type}`
    if (!juengste.has(key)) juengste.set(key, m)
  }

  const alarme: KlientenAlarm[] = []
  for (const [key, m] of juengste) {
    const bewertung = bewerteMesswert(
      m.type, Number(m.value),
      m.value_secondary != null ? Number(m.value_secondary) : null,
      grenzenIndex.get(key) ?? null,
    )
    if (bewertung.stufe !== 'ok') {
      alarme.push({ client_id: m.client_id, type: m.type, messung: m, bewertung })
    }
  }
  // Kritische zuerst, danach nach Messzeitpunkt absteigend
  return alarme.sort((a, b) => {
    if (a.bewertung.stufe !== b.bewertung.stufe) return a.bewertung.stufe === 'kritisch' ? -1 : 1
    return b.messung.measured_at.localeCompare(a.messung.measured_at)
  })
}
