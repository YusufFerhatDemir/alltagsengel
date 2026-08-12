import type { SupabaseClient } from '@supabase/supabase-js'
import type { WfWarteschlangeEintrag, ListWfWarteschlangeFilter } from './types'

export async function listWarteschlange(
  supabase: SupabaseClient,
  filter: ListWfWarteschlangeFilter,
): Promise<WfWarteschlangeEintrag[]> {
  let query = supabase
    .from('wf_warteschlange')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })

  if (filter.status) query = query.eq('status', filter.status)
  if (filter.limit) query = query.limit(filter.limit)
  if (filter.offset) query = query.range(filter.offset, filter.offset + (filter.limit ?? 50) - 1)

  const { data, error } = await query
  if (error) throw new Error(`Warteschlange konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as WfWarteschlangeEintrag[]
}

export async function retryWarteschlangeEintrag(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
): Promise<WfWarteschlangeEintrag> {
  const { data, error } = await supabase
    .from('wf_warteschlange')
    .update({ status: 'wartend', naechster_versuch: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Warteschlangen-Eintrag konnte nicht wiederholt werden: ${error?.message ?? 'unbekannt'}`)
  return data as WfWarteschlangeEintrag
}

export async function cancelWarteschlangeEintrag(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
): Promise<WfWarteschlangeEintrag> {
  const { data, error } = await supabase
    .from('wf_warteschlange')
    .update({ status: 'fehlgeschlagen', fehler_nachricht: 'Manuell abgebrochen', updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Warteschlangen-Eintrag konnte nicht abgebrochen werden: ${error?.message ?? 'unbekannt'}`)
  return data as WfWarteschlangeEintrag
}
