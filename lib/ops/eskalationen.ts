import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertErlaubt,
  AUFGABEN_KATEGORIE_WERTE,
  AUFGABEN_PRIORITAET_WERTE,
  ESKALATION_ROLLE_WERTE,
  type OpsEskalationsregel,
  type OpsEskalationshistorie,
  type ListEskalationsregelnFilter,
  type ListEskalationshistorieFilter,
} from './types'

/** Wirft bei ungueltigen Enum-Werten oder fehlenden Pflichtfeldern. */
function assertEskalationsregelGueltig(
  data: Partial<Omit<OpsEskalationsregel, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>,
  params: { istErstellung: boolean },
): void {
  if (params.istErstellung && !data.name?.trim()) {
    throw new Error('Name ist ein Pflichtfeld.')
  }
  if (data.name !== undefined && !data.name?.trim()) {
    throw new Error('Name darf nicht leer sein.')
  }
  assertErlaubt(data.aufgaben_kategorie, AUFGABEN_KATEGORIE_WERTE, 'aufgaben_kategorie')
  assertErlaubt(data.aufgaben_prioritaet, AUFGABEN_PRIORITAET_WERTE, 'aufgaben_prioritaet')
  assertErlaubt(data.eskalation_an_rolle, ESKALATION_ROLLE_WERTE, 'eskalation_an_rolle')
  if (data.ueberfaellig_stunden != null && data.ueberfaellig_stunden < 0) {
    throw new Error('Ueberfaellig-Stunden darf nicht negativ sein.')
  }
  if (data.eskalationsstufe != null && data.eskalationsstufe < 1) {
    throw new Error('Eskalationsstufe muss mindestens 1 sein.')
  }
}

export async function listEskalationsregeln(
  supabase: SupabaseClient,
  filter: ListEskalationsregelnFilter,
): Promise<OpsEskalationsregel[]> {
  let query = supabase
    .from('ops_eskalationsregeln')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('eskalationsstufe', { ascending: true })

  if (filter.aktiv !== undefined) query = query.eq('aktiv', filter.aktiv)

  const { data, error } = await query
  if (error) throw new Error(`Eskalationsregeln konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as OpsEskalationsregel[]
}

export async function createEskalationsregel(
  supabase: SupabaseClient,
  params: { organizationId: string; data: Omit<OpsEskalationsregel, 'id' | 'organization_id' | 'created_at' | 'updated_at'> },
): Promise<OpsEskalationsregel> {
  assertEskalationsregelGueltig(params.data, { istErstellung: true })
  const { data, error } = await supabase
    .from('ops_eskalationsregeln')
    .insert({ ...params.data, name: params.data.name.trim(), organization_id: params.organizationId })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Eskalationsregel konnte nicht erstellt werden: ${error?.message ?? 'unbekannt'}`)
  return data as OpsEskalationsregel
}

export async function updateEskalationsregel(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string; data: Partial<Omit<OpsEskalationsregel, 'id' | 'organization_id' | 'created_at' | 'updated_at'>> },
): Promise<OpsEskalationsregel> {
  assertEskalationsregelGueltig(params.data, { istErstellung: false })
  const { data, error } = await supabase
    .from('ops_eskalationsregeln')
    .update({
      ...params.data,
      ...(params.data.name !== undefined ? { name: params.data.name.trim() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Eskalationsregel konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as OpsEskalationsregel
}

export async function deleteEskalationsregel(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
): Promise<void> {
  const { error } = await supabase
    .from('ops_eskalationsregeln')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
  if (error) throw new Error(`Eskalationsregel konnte nicht geloescht werden: ${error.message}`)
}

export async function listEskalationshistorie(
  supabase: SupabaseClient,
  filter: ListEskalationshistorieFilter,
): Promise<OpsEskalationshistorie[]> {
  let query = supabase
    .from('ops_eskalationshistorie')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('erstellt_am', { ascending: false })

  if (filter.aufgabeId) query = query.eq('aufgabe_id', filter.aufgabeId)
  if (filter.limit) query = query.limit(filter.limit)

  const { data, error } = await query
  if (error) throw new Error(`Eskalationshistorie konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as OpsEskalationshistorie[]
}
