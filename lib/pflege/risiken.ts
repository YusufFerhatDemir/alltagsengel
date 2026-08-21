// ═══════════════════════════════════════════════════════════════
// Risiken / Allergien / Notfallhinweise — pflege_risiken
// Soft-Delete über aktiv=false. Zusätzlich: Risiko-Dashboard-View
// (pflege_risiko_dashboard) mit Prüfstatus-Ableitung.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logPflegeAktivitaet } from './audit-log'
import {
  assertErlaubt,
  RISIKO_SCHWEREGRAD_WERTE,
  RISIKO_TYP_WERTE,
  type PflegeRisiko,
  type PflegeRisikoDashboardZeile,
  type RisikoPruefstatus,
  type RisikoSchweregrad,
  type RisikoTyp,
} from './types'
import { logger } from '@/lib/logger'
const log = logger.child('pflege-audit')

/** Rangfolge der Schweregrade — für Sortierung und "kritischstes Risiko zuerst". */
export const SCHWEREGRAD_RANG: Record<RisikoSchweregrad, number> = {
  niedrig: 1,
  mittel: 2,
  hoch: 3,
  kritisch: 4,
}

/** Risiken, die im Engel-/Einsatzkontext immer sofort sichtbar sein müssen. */
export const SOFORT_SICHTBARE_TYPEN: RisikoTyp[] = [
  'allergie', 'unvertraeglichkeit', 'sturzrisiko', 'schluckrisiko',
]

export function istKritisch(risiko: Pick<PflegeRisiko, 'schweregrad'>): boolean {
  return SCHWEREGRAD_RANG[risiko.schweregrad] >= SCHWEREGRAD_RANG.hoch
}

export interface CreateRisikoParams {
  organizationId: string
  clientId: string
  risikoTyp: RisikoTyp
  bezeichnung: string
  beschreibung?: string | null
  schweregrad?: RisikoSchweregrad
  massnahmen?: string | null
  erkanntAm?: string | null
  erkanntVon?: string | null
  naechstePruefung?: string | null
  erstelltVon: string
}

export async function createRisiko(supabase: SupabaseClient, params: CreateRisikoParams): Promise<PflegeRisiko> {
  if (!params.bezeichnung?.trim()) throw new Error('Bezeichnung ist ein Pflichtfeld.')
  assertErlaubt(params.risikoTyp, RISIKO_TYP_WERTE, 'risiko_typ')
  assertErlaubt(params.schweregrad, RISIKO_SCHWEREGRAD_WERTE, 'schweregrad')

  const { data, error } = await supabase
    .from('pflege_risiken')
    .insert({
      organization_id: params.organizationId,
      client_id: params.clientId,
      risiko_typ: params.risikoTyp,
      bezeichnung: params.bezeichnung.trim(),
      beschreibung: params.beschreibung ?? null,
      schweregrad: params.schweregrad ?? 'mittel',
      massnahmen: params.massnahmen ?? null,
      erkannt_am: params.erkanntAm ?? null,
      erkannt_von: params.erkanntVon ?? null,
      naechste_pruefung: params.naechstePruefung ?? null,
      erstellt_von: params.erstelltVon,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Risiko konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)

  await logPflegeAktivitaet(supabase, {
    organizationId: (data as PflegeRisiko).organization_id,
    entitaetTyp: 'risiko',
    entitaetId: (data as PflegeRisiko).id,
    aktion: 'erstellt',
    nachher: data,
    akteurId: params.erstelltVon,
  }).catch((err) => log.errorWithException('Risiko-Log fehlgeschlagen', err))

  return data as PflegeRisiko
}

export interface ListRisikenFilter {
  organizationId: string
  clientId?: string
  risikoTyp?: RisikoTyp
  schweregrad?: RisikoSchweregrad
  nurAktive?: boolean
}

export async function listRisiken(supabase: SupabaseClient, filter: ListRisikenFilter): Promise<PflegeRisiko[]> {
  let query = supabase
    .from('pflege_risiken')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })

  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.risikoTyp) query = query.eq('risiko_typ', filter.risikoTyp)
  if (filter.schweregrad) query = query.eq('schweregrad', filter.schweregrad)
  if (filter.nurAktive) query = query.eq('aktiv', true)

  const { data, error } = await query
  if (error) throw new Error(`Risiken konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as PflegeRisiko[]
}

export async function getRisiko(supabase: SupabaseClient, id: string, organizationId: string): Promise<PflegeRisiko | null> {
  const { data, error } = await supabase
    .from('pflege_risiken')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`Risiko konnte nicht geladen werden: ${error.message}`)
  return data as PflegeRisiko | null
}

export interface UpdateRisikoParams {
  risikoTyp?: RisikoTyp
  bezeichnung?: string
  beschreibung?: string | null
  schweregrad?: RisikoSchweregrad
  massnahmen?: string | null
  aktiv?: boolean
  erkanntAm?: string | null
  naechstePruefung?: string | null
}

export async function updateRisiko(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateRisikoParams
): Promise<PflegeRisiko> {
  assertErlaubt(patch.risikoTyp, RISIKO_TYP_WERTE, 'risiko_typ')
  assertErlaubt(patch.schweregrad, RISIKO_SCHWEREGRAD_WERTE, 'schweregrad')
  if (patch.bezeichnung !== undefined && !patch.bezeichnung.trim()) {
    throw new Error('Bezeichnung darf nicht leer sein.')
  }

  const update: Record<string, unknown> = {}
  if (patch.risikoTyp !== undefined) update.risiko_typ = patch.risikoTyp
  if (patch.bezeichnung !== undefined) update.bezeichnung = patch.bezeichnung.trim()
  if (patch.beschreibung !== undefined) update.beschreibung = patch.beschreibung
  if (patch.schweregrad !== undefined) update.schweregrad = patch.schweregrad
  if (patch.massnahmen !== undefined) update.massnahmen = patch.massnahmen
  if (patch.aktiv !== undefined) update.aktiv = patch.aktiv
  if (patch.erkanntAm !== undefined) update.erkannt_am = patch.erkanntAm
  if (patch.naechstePruefung !== undefined) update.naechste_pruefung = patch.naechstePruefung

  if (Object.keys(update).length === 0) throw new Error('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('pflege_risiken')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Risiko konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)

  await logPflegeAktivitaet(supabase, {
    organizationId,
    entitaetTyp: 'risiko',
    entitaetId: id,
    aktion: patch.aktiv === false ? 'geloescht' : 'aktualisiert',
    nachher: data,
  }).catch((err) => log.errorWithException('Risiko-Log fehlgeschlagen', err))

  return data as PflegeRisiko
}

/** Soft-Delete: Risiko bleibt in der Historie, verschwindet aber aus allen aktiven Sichten. */
export async function deaktiviereRisiko(
  supabase: SupabaseClient,
  id: string,
  organizationId: string
): Promise<PflegeRisiko> {
  return updateRisiko(supabase, id, organizationId, { aktiv: false })
}

export interface RisikoDashboardFilter {
  organizationId: string
  clientId?: string
  schweregrad?: RisikoSchweregrad
  pruefstatus?: RisikoPruefstatus
}

export async function getRisikoDashboard(
  supabase: SupabaseClient,
  filter: RisikoDashboardFilter
): Promise<PflegeRisikoDashboardZeile[]> {
  let query = supabase
    .from('pflege_risiko_dashboard')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('naechste_pruefung', { ascending: true, nullsFirst: false })

  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.schweregrad) query = query.eq('schweregrad', filter.schweregrad)
  if (filter.pruefstatus) query = query.eq('pruefstatus', filter.pruefstatus)

  const { data, error } = await query
  if (error) throw new Error(`Risiko-Dashboard konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as PflegeRisikoDashboardZeile[]
}

/** Kennzahlen für die Kachelzeile im Risiko-Dashboard. */
export function zusammenfassungRisiken(zeilen: PflegeRisikoDashboardZeile[]): {
  gesamt: number
  kritisch: number
  hoch: number
  ueberfaellig: number
  bald_faellig: number
  ohne_pruefung: number
} {
  return {
    gesamt: zeilen.length,
    kritisch: zeilen.filter(z => z.schweregrad === 'kritisch').length,
    hoch: zeilen.filter(z => z.schweregrad === 'hoch').length,
    ueberfaellig: zeilen.filter(z => z.pruefstatus === 'ueberfaellig').length,
    bald_faellig: zeilen.filter(z => z.pruefstatus === 'bald_faellig').length,
    ohne_pruefung: zeilen.filter(z => z.pruefstatus === 'keine_pruefung').length,
  }
}
