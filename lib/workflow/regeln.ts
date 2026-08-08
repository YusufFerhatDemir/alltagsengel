import type { SupabaseClient } from '@supabase/supabase-js'
import type { WfRegel, WfAktion, ListWfRegelnFilter, ListWfAktionenFilter } from './types'

export async function listRegeln(
  supabase: SupabaseClient,
  filter: ListWfRegelnFilter,
): Promise<WfRegel[]> {
  let query = supabase
    .from('wf_regeln')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('prioritaet', { ascending: false })

  if (filter.aktiv !== undefined) query = query.eq('aktiv', filter.aktiv)
  if (filter.modul) query = query.eq('modul', filter.modul)

  const { data, error } = await query
  if (error) throw new Error(`Regeln konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as WfRegel[]
}

export async function getRegel(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
): Promise<WfRegel | null> {
  const { data, error } = await supabase
    .from('wf_regeln')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('id', params.id)
    .maybeSingle()
  if (error) throw new Error(`Regel konnte nicht geladen werden: ${error.message}`)
  return data as WfRegel | null
}

export async function createRegel(
  supabase: SupabaseClient,
  params: { organizationId: string; data: Partial<Omit<WfRegel, 'id' | 'organization_id' | 'created_at' | 'updated_at'>> },
): Promise<WfRegel> {
  const { data, error } = await supabase
    .from('wf_regeln')
    .insert({ ...params.data, organization_id: params.organizationId })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Regel konnte nicht erstellt werden: ${error?.message ?? 'unbekannt'}`)
  return data as WfRegel
}

export async function updateRegel(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string; data: Partial<Omit<WfRegel, 'id' | 'organization_id' | 'created_at' | 'updated_at'>> },
): Promise<WfRegel> {
  const { data, error } = await supabase
    .from('wf_regeln')
    .update({ ...params.data, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Regel konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as WfRegel
}

export async function deleteRegel(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
): Promise<void> {
  const { error } = await supabase
    .from('wf_regeln')
    .delete()
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
  if (error) throw new Error(`Regel konnte nicht geloescht werden: ${error.message}`)
}

export async function toggleRegelAktiv(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string; aktiv: boolean },
): Promise<WfRegel> {
  return updateRegel(supabase, { organizationId: params.organizationId, id: params.id, data: { aktiv: params.aktiv } })
}

// ── Aktionen (untergeordnet zu einer Regel) ─────────────────────

export async function listAktionen(
  supabase: SupabaseClient,
  filter: ListWfAktionenFilter,
): Promise<WfAktion[]> {
  const { data, error } = await supabase
    .from('wf_aktionen')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .eq('regel_id', filter.regelId)
    .order('reihenfolge', { ascending: true })
  if (error) throw new Error(`Aktionen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as WfAktion[]
}

export async function createAktion(
  supabase: SupabaseClient,
  params: { organizationId: string; regelId: string; data: Partial<Omit<WfAktion, 'id' | 'organization_id' | 'regel_id' | 'created_at'>> },
): Promise<WfAktion> {
  const { data, error } = await supabase
    .from('wf_aktionen')
    .insert({ ...params.data, organization_id: params.organizationId, regel_id: params.regelId })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Aktion konnte nicht erstellt werden: ${error?.message ?? 'unbekannt'}`)
  return data as WfAktion
}

export async function deleteAktion(
  supabase: SupabaseClient,
  params: { organizationId: string; regelId: string; id: string },
): Promise<void> {
  const { error } = await supabase
    .from('wf_aktionen')
    .delete()
    .eq('id', params.id)
    .eq('regel_id', params.regelId)
    .eq('organization_id', params.organizationId)
  if (error) throw new Error(`Aktion konnte nicht geloescht werden: ${error.message}`)
}
