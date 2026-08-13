// ═══════════════════════════════════════════════════════════════
// Übergabeprotokolle — Kopfdatensatz
// Ein Protokoll je Organisation, Datum und Schicht (optional je Tour).
// Der Abschluss ist der prüfrelevante Moment: ab da ist das Protokoll
// unveränderlich, Ergänzungen laufen nur noch als Nachtrag.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertDatum,
  assertErlaubt,
  PROTOKOLL_STATUS_WERTE,
  SCHICHT_WERTE,
  type ProtokollStatus,
  type Schicht,
  type UebergabeProtokoll,
} from './types'

export interface CreateProtokollParams {
  /**
   * Weglassen, wenn mit einem user-scoped Client geschrieben wird (Engel):
   * dann füllt der Spalten-Default current_org_id() die Organisation und
   * RLS entscheidet über die Berechtigung.
   */
  organizationId?: string
  datum: string
  schicht: Schicht
  tourId?: string | null
  uebergeberId: string
  uebergeberName: string
  uebernehmerCaregiverIds?: string[]
  zusammenfassung?: string | null
}

export interface ListProtokolleFilter {
  organizationId: string
  datumVon?: string
  datumBis?: string
  schicht?: Schicht
  status?: ProtokollStatus
  tourId?: string
  limit?: number
}

/**
 * Validiert die Eingaben vor jedem DB-Zugriff. Bewusst als eigene Funktion,
 * damit die Regeln ohne Datenbank testbar sind.
 */
export function validateProtokollEingabe(params: CreateProtokollParams): void {
  assertDatum(params.datum)
  assertErlaubt(params.schicht, SCHICHT_WERTE, 'schicht')
  if (!params.uebergeberName?.trim()) {
    throw new Error('Der Name der übergebenden Person ist ein Pflichtfeld.')
  }
  if (!params.uebergeberId) {
    throw new Error('Die übergebende Person muss angemeldet sein.')
  }
}

/**
 * Ein Protokoll darf nur vorwärts abgeschlossen werden. Dieselbe Regel
 * erzwingt trg_uebergabe_protokoll_abschluss in der Datenbank — hier
 * steht sie, damit die API einen verständlichen Fehler liefert.
 */
export function validateAbschluss(
  status: ProtokollStatus,
  punkteAnzahl: number,
  zusammenfassung: string | null | undefined,
): void {
  assertErlaubt(status, PROTOKOLL_STATUS_WERTE, 'status')
  if (status === 'abgeschlossen') {
    throw new Error('Das Protokoll ist bereits abgeschlossen und kann nicht erneut abgeschlossen werden.')
  }
  if (punkteAnzahl === 0 && !zusammenfassung?.trim()) {
    throw new Error('Abschluss nicht möglich: Das Protokoll enthält weder Übergabepunkte noch eine Zusammenfassung.')
  }
}

export async function createProtokoll(
  supabase: SupabaseClient,
  params: CreateProtokollParams,
): Promise<UebergabeProtokoll> {
  validateProtokollEingabe(params)

  const { data, error } = await supabase
    .from('uebergabe_protokolle')
    .insert({
      ...(params.organizationId ? { organization_id: params.organizationId } : {}),
      datum: params.datum,
      schicht: params.schicht,
      tour_id: params.tourId ?? null,
      status: 'offen',
      uebergeber_id: params.uebergeberId,
      uebergeber_name: params.uebergeberName.trim(),
      uebernehmer_caregiver_ids: params.uebernehmerCaregiverIds ?? [],
      zusammenfassung: params.zusammenfassung?.trim() || null,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error('Für diesen Tag, diese Schicht und diese Tour existiert bereits ein Übergabeprotokoll.')
    }
    throw new Error(`Übergabeprotokoll konnte nicht angelegt werden: ${error.message}`)
  }
  return data as UebergabeProtokoll
}

export async function listProtokolle(
  supabase: SupabaseClient,
  filter: ListProtokolleFilter,
): Promise<UebergabeProtokoll[]> {
  let query = supabase
    .from('uebergabe_protokolle')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('datum', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(filter.limit ?? 100)

  if (filter.datumVon) query = query.gte('datum', filter.datumVon)
  if (filter.datumBis) query = query.lte('datum', filter.datumBis)
  if (filter.schicht) {
    assertErlaubt(filter.schicht, SCHICHT_WERTE, 'schicht')
    query = query.eq('schicht', filter.schicht)
  }
  if (filter.status) {
    assertErlaubt(filter.status, PROTOKOLL_STATUS_WERTE, 'status')
    query = query.eq('status', filter.status)
  }
  if (filter.tourId) query = query.eq('tour_id', filter.tourId)

  const { data, error } = await query
  if (error) throw new Error(`Übergabeprotokolle konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as UebergabeProtokoll[]
}

export async function getProtokoll(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
): Promise<UebergabeProtokoll | null> {
  const { data, error } = await supabase
    .from('uebergabe_protokolle')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) throw new Error(`Übergabeprotokoll konnte nicht geladen werden: ${error.message}`)
  return (data as UebergabeProtokoll | null) ?? null
}

export interface UpdateProtokollParams {
  zusammenfassung?: string | null
  uebernehmerCaregiverIds?: string[]
}

export async function updateProtokoll(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  params: UpdateProtokollParams,
): Promise<UebergabeProtokoll> {
  const bestand = await getProtokoll(supabase, id, organizationId)
  if (!bestand) throw new Error('Übergabeprotokoll nicht gefunden.')
  if (bestand.status === 'abgeschlossen') {
    throw new Error('Ein abgeschlossenes Übergabeprotokoll ist unveränderlich. Neue Informationen als Nachtrag erfassen.')
  }

  const updates: Record<string, unknown> = {}
  if (params.zusammenfassung !== undefined) {
    updates.zusammenfassung = params.zusammenfassung?.trim() || null
  }
  if (params.uebernehmerCaregiverIds !== undefined) {
    updates.uebernehmer_caregiver_ids = params.uebernehmerCaregiverIds
  }
  if (Object.keys(updates).length === 0) return bestand

  const { data, error } = await supabase
    .from('uebergabe_protokolle')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error) throw new Error(`Übergabeprotokoll konnte nicht aktualisiert werden: ${error.message}`)
  return data as UebergabeProtokoll
}

/** Schliesst das Protokoll ab — der Nachweis der Informationsweitergabe. */
export async function abschliessenProtokoll(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  userId: string,
  zusammenfassung?: string | null,
): Promise<UebergabeProtokoll> {
  const bestand = await getProtokoll(supabase, id, organizationId)
  if (!bestand) throw new Error('Übergabeprotokoll nicht gefunden.')

  const { count, error: countError } = await supabase
    .from('uebergabe_punkte')
    .select('id', { count: 'exact', head: true })
    .eq('protokoll_id', id)
  if (countError) throw new Error(`Übergabepunkte konnten nicht geprüft werden: ${countError.message}`)

  const finaleZusammenfassung =
    zusammenfassung !== undefined ? zusammenfassung?.trim() || null : bestand.zusammenfassung
  validateAbschluss(bestand.status, count ?? 0, finaleZusammenfassung)

  const { data, error } = await supabase
    .from('uebergabe_protokolle')
    .update({
      status: 'abgeschlossen',
      abgeschlossen_am: new Date().toISOString(),
      abgeschlossen_von: userId,
      zusammenfassung: finaleZusammenfassung,
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .eq('status', 'offen')
    .select('*')
    .single()

  if (error) throw new Error(`Übergabeprotokoll konnte nicht abgeschlossen werden: ${error.message}`)
  return data as UebergabeProtokoll
}

export async function deleteProtokoll(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
): Promise<void> {
  const bestand = await getProtokoll(supabase, id, organizationId)
  if (!bestand) throw new Error('Übergabeprotokoll nicht gefunden.')
  if (bestand.status === 'abgeschlossen') {
    throw new Error('Ein abgeschlossenes Übergabeprotokoll kann nicht gelöscht werden.')
  }

  const { error } = await supabase
    .from('uebergabe_protokolle')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(`Übergabeprotokoll konnte nicht gelöscht werden: ${error.message}`)
}
