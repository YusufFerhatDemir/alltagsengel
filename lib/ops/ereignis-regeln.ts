import type { SupabaseClient } from '@supabase/supabase-js'
import type { OpsEreignisRegel, ListEreignisRegelnFilter } from './types'

export async function listEreignisRegeln(
  supabase: SupabaseClient,
  filter: ListEreignisRegelnFilter,
): Promise<OpsEreignisRegel[]> {
  let query = supabase
    .from('ops_ereignis_regeln')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('name', { ascending: true })

  if (filter.aktiv !== undefined) query = query.eq('aktiv', filter.aktiv)

  const { data, error } = await query
  if (error) throw new Error(`Ereignisregeln konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as OpsEreignisRegel[]
}

export async function createEreignisRegel(
  supabase: SupabaseClient,
  params: { organizationId: string; data: Omit<OpsEreignisRegel, 'id' | 'organization_id' | 'created_at' | 'updated_at'> },
): Promise<OpsEreignisRegel> {
  const { data, error } = await supabase
    .from('ops_ereignis_regeln')
    .insert({ ...params.data, organization_id: params.organizationId })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Ereignisregel konnte nicht erstellt werden: ${error?.message ?? 'unbekannt'}`)
  return data as OpsEreignisRegel
}

export async function updateEreignisRegel(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string; data: Partial<Omit<OpsEreignisRegel, 'id' | 'organization_id' | 'created_at' | 'updated_at'>> },
): Promise<OpsEreignisRegel> {
  const { data, error } = await supabase
    .from('ops_ereignis_regeln')
    .update({ ...params.data, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Ereignisregel konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as OpsEreignisRegel
}

export async function deleteEreignisRegel(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
): Promise<void> {
  const { error } = await supabase
    .from('ops_ereignis_regeln')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
  if (error) throw new Error(`Ereignisregel konnte nicht geloescht werden: ${error.message}`)
}
