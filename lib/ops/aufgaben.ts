import { UserFacingError } from '@/lib/api/user-facing-error'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertErlaubt,
  AUFGABEN_KATEGORIE_WERTE,
  AUFGABEN_PRIORITAET_WERTE,
  AUFGABEN_STATUS_WERTE,
  WIEDERHOLUNG_INTERVALL_WERTE,
  type OpsAufgabe,
  type OpsAufgabeUebersicht,
  type ListAufgabenFilter,
} from './types'

export async function listAufgaben(
  supabase: SupabaseClient,
  filter: ListAufgabenFilter,
): Promise<OpsAufgabeUebersicht[]> {
  let query = supabase
    .from('ops_aufgaben_uebersicht')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })

  if (filter.status) query = query.eq('status', filter.status)
  else query = query.neq('status', 'archiviert')
  if (filter.kategorie) query = query.eq('kategorie', filter.kategorie)
  if (filter.prioritaet) query = query.eq('prioritaet', filter.prioritaet)
  if (filter.verantwortlichId) query = query.eq('verantwortlich_id', filter.verantwortlichId)
  if (filter.search) query = query.ilike('titel', `%${filter.search}%`)
  if (filter.limit) query = query.limit(filter.limit)
  if (filter.offset) query = query.range(filter.offset, filter.offset + (filter.limit ?? 50) - 1)

  const { data, error } = await query
  if (error) throw new Error(`Aufgaben konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as OpsAufgabeUebersicht[]
}

export async function getAufgabe(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
): Promise<OpsAufgabeUebersicht | null> {
  const { data, error } = await supabase
    .from('ops_aufgaben_uebersicht')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('id', params.id)
    .maybeSingle()
  if (error) throw new Error(`Aufgabe konnte nicht geladen werden: ${error.message}`)
  return data as OpsAufgabeUebersicht | null
}

/** Wirft bei ungueltigen Enum-Werten oder fehlenden Pflichtfeldern. */
function assertAufgabeGueltig(
  data: Partial<Omit<OpsAufgabe, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>,
  params: { istErstellung: boolean },
): void {
  if (params.istErstellung && !data.titel?.trim()) {
    throw new UserFacingError('Titel ist ein Pflichtfeld.')
  }
  if (data.titel !== undefined && !data.titel?.trim()) {
    throw new UserFacingError('Titel darf nicht leer sein.')
  }
  assertErlaubt(data.kategorie, AUFGABEN_KATEGORIE_WERTE, 'kategorie')
  assertErlaubt(data.prioritaet, AUFGABEN_PRIORITAET_WERTE, 'prioritaet')
  assertErlaubt(data.status, AUFGABEN_STATUS_WERTE, 'status')
  assertErlaubt(data.wiederholung_intervall, WIEDERHOLUNG_INTERVALL_WERTE, 'wiederholung_intervall')
  if (data.faellig_am && data.wiederholung_ende && data.wiederholung_ende < data.faellig_am) {
    throw new UserFacingError('Wiederholung-Ende darf nicht vor der Faelligkeit liegen.')
  }
}

export async function createAufgabe(
  supabase: SupabaseClient,
  params: { organizationId: string; data: Partial<Omit<OpsAufgabe, 'id' | 'organization_id' | 'created_at' | 'updated_at'>> },
): Promise<OpsAufgabe> {
  assertAufgabeGueltig(params.data, { istErstellung: true })
  const { data, error } = await supabase
    .from('ops_aufgaben')
    .insert({ ...params.data, titel: params.data.titel?.trim(), organization_id: params.organizationId })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Aufgabe konnte nicht erstellt werden: ${error?.message ?? 'unbekannt'}`)
  return data as OpsAufgabe
}

export async function updateAufgabe(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string; data: Partial<Omit<OpsAufgabe, 'id' | 'organization_id' | 'created_at' | 'updated_at'>> },
): Promise<OpsAufgabe> {
  assertAufgabeGueltig(params.data, { istErstellung: false })
  const { data, error } = await supabase
    .from('ops_aufgaben')
    .update({
      ...params.data,
      ...(params.data.titel !== undefined ? { titel: params.data.titel?.trim() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Aufgabe konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as OpsAufgabe
}

export async function deleteAufgabe(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
): Promise<void> {
  const { error } = await supabase
    .from('ops_aufgaben')
    .update({ status: 'archiviert', updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
  if (error) throw new Error(`Aufgabe konnte nicht archiviert werden: ${error.message}`)
}
