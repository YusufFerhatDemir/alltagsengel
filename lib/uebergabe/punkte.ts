// ═══════════════════════════════════════════════════════════════
// Übergabepunkte — die eigentliche Information, die weitergegeben wird
// Nach Abschluss des Protokolls sind Punkte unveränderlich; neue
// Informationen sind nur noch als Nachtrag möglich (nachtrag = true).
// Dieselbe Regel erzwingt trg_uebergabe_punkt_guard in der Datenbank.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertErlaubt,
  DRINGLICHKEIT_WERTE,
  KATEGORIEN_MIT_HANDLUNGSBEDARF,
  PUNKT_KATEGORIE_WERTE,
  QUELLE_TYP_WERTE,
  type Dringlichkeit,
  type PunktKategorie,
  type QuelleTyp,
  type UebergabePunkt,
} from './types'

export interface CreatePunktParams {
  protokollId: string
  /** Weglassen beim user-scoped Client (Engel) — dann greift current_org_id(). */
  organizationId?: string
  clientId?: string | null
  kategorie?: PunktKategorie
  dringlichkeit?: Dringlichkeit
  inhalt: string
  handlungsbedarf?: boolean
  quelleTyp?: QuelleTyp | null
  quelleId?: string | null
  aufgabeId?: string | null
  /** Nur für abgeschlossene Protokolle — wird von der API gesetzt, nicht vom Client. */
  nachtrag?: boolean
  erstelltVon: string
  erstelltVonName: string
}

/**
 * Sturz, Medikation und Arztkontakt sind nie „nur zur Info“ — sie erzeugen
 * immer Handlungsbedarf für den übernehmenden Dienst. Ein kritischer Punkt
 * ebenso, unabhängig von der Kategorie.
 */
export function berechneHandlungsbedarf(
  kategorie: PunktKategorie,
  dringlichkeit: Dringlichkeit,
  gesetzt: boolean | undefined,
): boolean {
  if (KATEGORIEN_MIT_HANDLUNGSBEDARF.includes(kategorie)) return true
  if (dringlichkeit === 'kritisch') return true
  return gesetzt ?? false
}

export function validatePunktEingabe(params: CreatePunktParams): void {
  if (!params.inhalt?.trim()) throw new Error('Der Inhalt des Übergabepunktes ist ein Pflichtfeld.')
  assertErlaubt(params.kategorie, PUNKT_KATEGORIE_WERTE, 'kategorie')
  assertErlaubt(params.dringlichkeit, DRINGLICHKEIT_WERTE, 'dringlichkeit')
  assertErlaubt(params.quelleTyp, QUELLE_TYP_WERTE, 'quelle_typ')
  if (params.quelleId && !params.quelleTyp) {
    throw new Error('Zu einer Quell-ID muss auch der Quelltyp angegeben werden.')
  }
  if (!params.erstelltVonName?.trim()) {
    throw new Error('Der Name der erfassenden Person ist ein Pflichtfeld.')
  }
}

export async function createPunkt(
  supabase: SupabaseClient,
  params: CreatePunktParams,
): Promise<UebergabePunkt> {
  validatePunktEingabe(params)

  const kategorie = params.kategorie ?? 'sonstiges'
  const dringlichkeit = params.dringlichkeit ?? 'normal'

  const { data, error } = await supabase
    .from('uebergabe_punkte')
    .insert({
      protokoll_id: params.protokollId,
      ...(params.organizationId ? { organization_id: params.organizationId } : {}),
      client_id: params.clientId ?? null,
      kategorie,
      dringlichkeit,
      inhalt: params.inhalt.trim(),
      handlungsbedarf: berechneHandlungsbedarf(kategorie, dringlichkeit, params.handlungsbedarf),
      quelle_typ: params.quelleTyp ?? 'manuell',
      quelle_id: params.quelleId ?? null,
      aufgabe_id: params.aufgabeId ?? null,
      nachtrag: params.nachtrag ?? false,
      erstellt_von: params.erstelltVon,
      erstellt_von_name: params.erstelltVonName.trim(),
    })
    .select('*')
    .single()

  if (error) throw new Error(`Übergabepunkt konnte nicht gespeichert werden: ${error.message}`)
  return data as UebergabePunkt
}

export async function listPunkte(
  supabase: SupabaseClient,
  protokollId: string,
  organizationId: string,
): Promise<UebergabePunkt[]> {
  const { data, error } = await supabase
    .from('uebergabe_punkte')
    .select('*')
    .eq('protokoll_id', protokollId)
    .eq('organization_id', organizationId)
    .order('dringlichkeit', { ascending: false })
    .order('created_at', { ascending: true })

  if (error) throw new Error(`Übergabepunkte konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as UebergabePunkt[]
}

/** Offene Handlungsbedarfe über alle Protokolle — das Arbeitsblatt des Folgedienstes. */
export async function listOffeneHandlungsbedarfe(
  supabase: SupabaseClient,
  organizationId: string,
  limit = 50,
): Promise<UebergabePunkt[]> {
  const { data, error } = await supabase
    .from('uebergabe_punkte')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('handlungsbedarf', true)
    .eq('erledigt', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Offene Handlungsbedarfe konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as UebergabePunkt[]
}

export interface UpdatePunktParams {
  inhalt?: string
  kategorie?: PunktKategorie
  dringlichkeit?: Dringlichkeit
  handlungsbedarf?: boolean
  clientId?: string | null
}

/**
 * Inhaltliche Änderung — nur solange das Protokoll offen ist. Die
 * Statusprüfung läuft über das Protokoll, nicht über den Punkt selbst.
 */
export async function updatePunkt(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  params: UpdatePunktParams,
): Promise<UebergabePunkt> {
  assertErlaubt(params.kategorie, PUNKT_KATEGORIE_WERTE, 'kategorie')
  assertErlaubt(params.dringlichkeit, DRINGLICHKEIT_WERTE, 'dringlichkeit')
  if (params.inhalt !== undefined && !params.inhalt.trim()) {
    throw new Error('Der Inhalt des Übergabepunktes ist ein Pflichtfeld.')
  }

  const punkt = await getPunkt(supabase, id, organizationId)
  if (!punkt) throw new Error('Übergabepunkt nicht gefunden.')
  await assertProtokollOffen(supabase, punkt.protokoll_id, organizationId)

  const kategorie = params.kategorie ?? punkt.kategorie
  const dringlichkeit = params.dringlichkeit ?? punkt.dringlichkeit

  const updates: Record<string, unknown> = {}
  if (params.inhalt !== undefined) updates.inhalt = params.inhalt.trim()
  if (params.kategorie !== undefined) updates.kategorie = kategorie
  if (params.dringlichkeit !== undefined) updates.dringlichkeit = dringlichkeit
  if (params.clientId !== undefined) updates.client_id = params.clientId
  if (params.kategorie !== undefined || params.dringlichkeit !== undefined || params.handlungsbedarf !== undefined) {
    updates.handlungsbedarf = berechneHandlungsbedarf(
      kategorie,
      dringlichkeit,
      params.handlungsbedarf ?? punkt.handlungsbedarf,
    )
  }
  if (Object.keys(updates).length === 0) return punkt

  const { data, error } = await supabase
    .from('uebergabe_punkte')
    .update(updates)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error) throw new Error(`Übergabepunkt konnte nicht aktualisiert werden: ${error.message}`)
  return data as UebergabePunkt
}

/**
 * Erledigung nachziehen — das darf auch nach Abschluss des Protokolls
 * passieren, denn der Handlungsbedarf wird typischerweise erst im
 * Folgedienst abgearbeitet.
 */
export async function setErledigt(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  erledigt: boolean,
  userId: string,
): Promise<UebergabePunkt> {
  const { data, error } = await supabase
    .from('uebergabe_punkte')
    .update({
      erledigt,
      erledigt_am: erledigt ? new Date().toISOString() : null,
      erledigt_von: erledigt ? userId : null,
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()

  if (error) throw new Error(`Erledigung konnte nicht gespeichert werden: ${error.message}`)
  return data as UebergabePunkt
}

export async function getPunkt(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
): Promise<UebergabePunkt | null> {
  const { data, error } = await supabase
    .from('uebergabe_punkte')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) throw new Error(`Übergabepunkt konnte nicht geladen werden: ${error.message}`)
  return (data as UebergabePunkt | null) ?? null
}

export async function deletePunkt(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
): Promise<void> {
  const punkt = await getPunkt(supabase, id, organizationId)
  if (!punkt) throw new Error('Übergabepunkt nicht gefunden.')
  await assertProtokollOffen(supabase, punkt.protokoll_id, organizationId)

  const { error } = await supabase
    .from('uebergabe_punkte')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(`Übergabepunkt konnte nicht gelöscht werden: ${error.message}`)
}

/** Wirft, wenn das zugehörige Protokoll bereits abgeschlossen ist. */
export async function assertProtokollOffen(
  supabase: SupabaseClient,
  protokollId: string,
  organizationId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('uebergabe_protokolle')
    .select('status')
    .eq('id', protokollId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) throw new Error(`Protokollstatus konnte nicht geprüft werden: ${error.message}`)
  if (!data) throw new Error('Übergabeprotokoll nicht gefunden.')
  if (data.status === 'abgeschlossen') {
    throw new Error('Das Protokoll ist abgeschlossen — Änderungen sind nur noch als Nachtrag möglich.')
  }
}
