import type { SupabaseClient } from '@supabase/supabase-js'
import type { WfAusfuehrung, ListWfAusfuehrungenFilter } from './types'
import { WF_AUSFUEHRUNG_STATUS_WERTE } from './types'
import { pruefeEnum, pruefeLimit, pruefeOffset, STANDARD_LIMIT } from './validierung'

export async function listAusfuehrungen(
  supabase: SupabaseClient,
  filter: ListWfAusfuehrungenFilter,
): Promise<WfAusfuehrung[]> {
  const status = pruefeEnum(filter.status, WF_AUSFUEHRUNG_STATUS_WERTE, 'status')
  const limit = pruefeLimit(filter.limit)
  const offset = pruefeOffset(filter.offset)

  let query = supabase
    .from('wf_ausfuehrungen')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })

  if (filter.eventId) query = query.eq('event_id', filter.eventId)
  if (filter.regelId) query = query.eq('regel_id', filter.regelId)
  if (status) query = query.eq('status', status)
  if (limit) query = query.limit(limit)
  if (offset) query = query.range(offset, offset + (limit ?? STANDARD_LIMIT) - 1)

  const { data, error } = await query
  if (error) throw new Error(`Ausfuehrungen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as WfAusfuehrung[]
}

export async function getAusfuehrung(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
): Promise<WfAusfuehrung | null> {
  const { data, error } = await supabase
    .from('wf_ausfuehrungen')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('id', params.id)
    .maybeSingle()
  if (error) throw new Error(`Ausfuehrung konnte nicht geladen werden: ${error.message}`)
  return data as WfAusfuehrung | null
}
