import type { SupabaseClient } from '@supabase/supabase-js'
import type { OpsAufgabe, OpsAufgabeUebersicht, ListAufgabenFilter } from './types'

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

export async function createAufgabe(
  supabase: SupabaseClient,
  params: { organizationId: string; data: Partial<Omit<OpsAufgabe, 'id' | 'organization_id' | 'created_at' | 'updated_at'>> },
): Promise<OpsAufgabe> {
  const { data, error } = await supabase
    .from('ops_aufgaben')
    .insert({ ...params.data, organization_id: params.organizationId })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Aufgabe konnte nicht erstellt werden: ${error?.message ?? 'unbekannt'}`)
  return data as OpsAufgabe
}

export async function updateAufgabe(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string; data: Partial<Omit<OpsAufgabe, 'id' | 'organization_id' | 'created_at' | 'updated_at'>> },
): Promise<OpsAufgabe> {
  const { data, error } = await supabase
    .from('ops_aufgaben')
    .update({ ...params.data, updated_at: new Date().toISOString() })
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
    .delete()
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
  if (error) throw new Error(`Aufgabe konnte nicht geloescht werden: ${error.message}`)
}
