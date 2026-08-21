import { UserFacingError } from '@/lib/api/user-facing-error'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertErlaubt,
  DIENSTPLAN_STATUS_WERTE, DIENSTPLAN_TYP_WERTE,
  type DienstplanSchicht, type DienstplanEintrag, type DienstplanTagesansicht,
  type DienstplanStatus, type DienstplanTyp,
} from './types'

// ── Schichten (Vorlagen) ────────────────────────────────────────

export interface CreateSchichtParams {
  organizationId: string
  bezeichnung: string
  kuerzel?: string | null
  startZeit: string
  endZeit: string
  pauseMinuten?: number
  farbe?: string
}

export async function createSchicht(supabase: SupabaseClient, params: CreateSchichtParams): Promise<DienstplanSchicht> {
  if (!params.bezeichnung?.trim()) throw new UserFacingError('Bezeichnung ist ein Pflichtfeld.')

  const { data, error } = await supabase
    .from('dienstplan_schichten')
    .insert({
      organization_id: params.organizationId,
      bezeichnung: params.bezeichnung.trim(),
      kuerzel: params.kuerzel ?? null,
      start_zeit: params.startZeit,
      end_zeit: params.endZeit,
      pause_minuten: params.pauseMinuten ?? 0,
      farbe: params.farbe ?? '#C9963C',
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Schicht konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as DienstplanSchicht
}

export async function listSchichten(supabase: SupabaseClient, organizationId: string, nurAktive = true): Promise<DienstplanSchicht[]> {
  let query = supabase
    .from('dienstplan_schichten')
    .select('*')
    .eq('organization_id', organizationId)
    .order('start_zeit', { ascending: true })

  if (nurAktive) query = query.eq('aktiv', true)

  const { data, error } = await query
  if (error) throw new Error(`Schichten konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as DienstplanSchicht[]
}

export interface UpdateSchichtParams {
  bezeichnung?: string
  kuerzel?: string | null
  startZeit?: string
  endZeit?: string
  pauseMinuten?: number
  farbe?: string
  aktiv?: boolean
}

export async function updateSchicht(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateSchichtParams,
): Promise<DienstplanSchicht> {
  const update: Record<string, unknown> = {}
  if (patch.bezeichnung !== undefined) update.bezeichnung = patch.bezeichnung
  if (patch.kuerzel !== undefined) update.kuerzel = patch.kuerzel
  if (patch.startZeit !== undefined) update.start_zeit = patch.startZeit
  if (patch.endZeit !== undefined) update.end_zeit = patch.endZeit
  if (patch.pauseMinuten !== undefined) update.pause_minuten = patch.pauseMinuten
  if (patch.farbe !== undefined) update.farbe = patch.farbe
  if (patch.aktiv !== undefined) update.aktiv = patch.aktiv

  if (Object.keys(update).length === 0) throw new UserFacingError('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('dienstplan_schichten')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Schicht konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as DienstplanSchicht
}

// ── Einträge (tägliche Schichteinträge) ─────────────────────────

export interface CreateEintragParams {
  organizationId: string
  datum: string
  schichtId?: string | null
  caregiverId?: string | null
  clientId?: string | null
  assignmentId?: string | null
  startZeit: string
  endZeit: string
  pauseMinuten?: number
  status?: DienstplanStatus
  typ?: DienstplanTyp
  notizen?: string | null
  erstelltVon: string
}

export async function createEintrag(supabase: SupabaseClient, params: CreateEintragParams): Promise<DienstplanEintrag> {
  assertErlaubt(params.status, DIENSTPLAN_STATUS_WERTE, 'status')
  assertErlaubt(params.typ, DIENSTPLAN_TYP_WERTE, 'typ')

  const { data, error } = await supabase
    .from('dienstplan_eintraege')
    .insert({
      organization_id: params.organizationId,
      datum: params.datum,
      schicht_id: params.schichtId ?? null,
      caregiver_id: params.caregiverId ?? null,
      client_id: params.clientId ?? null,
      assignment_id: params.assignmentId ?? null,
      start_zeit: params.startZeit,
      end_zeit: params.endZeit,
      pause_minuten: params.pauseMinuten ?? 0,
      status: params.status ?? 'geplant',
      typ: params.typ ?? 'regulaer',
      notizen: params.notizen ?? null,
      erstellt_von: params.erstelltVon,
    })
    .select('*')
    .single()
  if (error || !data) {
    const msg = error?.message ?? 'unbekannt'
    if (msg.includes('Doppelbelegung')) throw new UserFacingError('Doppelbelegung: Der Mitarbeiter hat bereits einen Dienst in diesem Zeitraum.')
    if (msg.includes('Konflikt')) throw new UserFacingError('Konflikt: Der Mitarbeiter ist an diesem Tag als abwesend gemeldet.')
    throw new Error(`Dienstplan-Eintrag konnte nicht angelegt werden: ${msg}`)
  }
  return data as DienstplanEintrag
}

export interface ListEintraegeFilter {
  organizationId: string
  datum?: string
  datumVon?: string
  datumBis?: string
  caregiverId?: string
  clientId?: string
  status?: DienstplanStatus
}

export async function listEintraege(supabase: SupabaseClient, filter: ListEintraegeFilter): Promise<DienstplanEintrag[]> {
  let query = supabase
    .from('dienstplan_eintraege')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('datum', { ascending: true })
    .order('start_zeit', { ascending: true })

  if (filter.datum) query = query.eq('datum', filter.datum)
  if (filter.datumVon) query = query.gte('datum', filter.datumVon)
  if (filter.datumBis) query = query.lte('datum', filter.datumBis)
  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.status) query = query.eq('status', filter.status)

  const { data, error } = await query
  if (error) throw new Error(`Dienstplan-Einträge konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as DienstplanEintrag[]
}

export interface UpdateEintragParams {
  schichtId?: string | null
  caregiverId?: string | null
  clientId?: string | null
  assignmentId?: string | null
  startZeit?: string
  endZeit?: string
  pauseMinuten?: number
  status?: DienstplanStatus
  typ?: DienstplanTyp
  notizen?: string | null
  bestaetigtVon?: string | null
  bestaetigtAm?: string | null
}

export async function updateEintrag(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateEintragParams,
): Promise<DienstplanEintrag> {
  assertErlaubt(patch.status, DIENSTPLAN_STATUS_WERTE, 'status')
  assertErlaubt(patch.typ, DIENSTPLAN_TYP_WERTE, 'typ')

  const update: Record<string, unknown> = {}
  if (patch.schichtId !== undefined) update.schicht_id = patch.schichtId
  if (patch.caregiverId !== undefined) update.caregiver_id = patch.caregiverId
  if (patch.clientId !== undefined) update.client_id = patch.clientId
  if (patch.assignmentId !== undefined) update.assignment_id = patch.assignmentId
  if (patch.startZeit !== undefined) update.start_zeit = patch.startZeit
  if (patch.endZeit !== undefined) update.end_zeit = patch.endZeit
  if (patch.pauseMinuten !== undefined) update.pause_minuten = patch.pauseMinuten
  if (patch.status !== undefined) update.status = patch.status
  if (patch.typ !== undefined) update.typ = patch.typ
  if (patch.notizen !== undefined) update.notizen = patch.notizen
  if (patch.bestaetigtVon !== undefined) update.bestaetigt_von = patch.bestaetigtVon
  if (patch.bestaetigtAm !== undefined) update.bestaetigt_am = patch.bestaetigtAm

  if (Object.keys(update).length === 0) throw new UserFacingError('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('dienstplan_eintraege')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) {
    const msg = error?.message ?? 'unbekannt'
    if (msg.includes('Doppelbelegung')) throw new UserFacingError('Doppelbelegung: Der Mitarbeiter hat bereits einen Dienst in diesem Zeitraum.')
    if (msg.includes('Konflikt')) throw new UserFacingError('Konflikt: Der Mitarbeiter ist an diesem Tag als abwesend gemeldet.')
    throw new Error(`Dienstplan-Eintrag konnte nicht aktualisiert werden: ${msg}`)
  }
  return data as DienstplanEintrag
}

export async function deleteEintrag(supabase: SupabaseClient, id: string, organizationId: string): Promise<void> {
  const { error } = await supabase
    .from('dienstplan_eintraege')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(`Dienstplan-Eintrag konnte nicht gelöscht werden: ${error.message}`)
}

export async function listTagesansicht(supabase: SupabaseClient, organizationId: string, datum: string): Promise<DienstplanTagesansicht[]> {
  const { data, error } = await supabase
    .from('dienstplan_tagesansicht')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('datum', datum)
    .order('start_zeit', { ascending: true })
  if (error) throw new Error(`Tagesansicht konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as DienstplanTagesansicht[]
}
