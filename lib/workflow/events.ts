import type { SupabaseClient } from '@supabase/supabase-js'
import type { WfEvent, ListWfEventsFilter } from './types'

export async function listEvents(
  supabase: SupabaseClient,
  filter: ListWfEventsFilter,
): Promise<WfEvent[]> {
  let query = supabase
    .from('wf_events')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })

  if (filter.status) query = query.eq('status', filter.status)
  if (filter.modul) query = query.eq('modul', filter.modul)
  if (filter.eventTyp) query = query.eq('event_typ', filter.eventTyp)
  if (filter.limit) query = query.limit(filter.limit)
  if (filter.offset) query = query.range(filter.offset, filter.offset + (filter.limit ?? 50) - 1)

  const { data, error } = await query
  if (error) throw new Error(`Events konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as WfEvent[]
}

export async function getEvent(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
): Promise<WfEvent | null> {
  const { data, error } = await supabase
    .from('wf_events')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('id', params.id)
    .maybeSingle()
  if (error) throw new Error(`Event konnte nicht geladen werden: ${error.message}`)
  return data as WfEvent | null
}

export async function emitEvent(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    eventTyp: string
    modul: string
    quellTabelle: string
    quellId?: string | null
    payload?: Record<string, unknown>
    idempotencyKey?: string | null
    prioritaet?: string
    ausgeloestVon?: string | null
  },
): Promise<string | null> {
  const { data, error } = await supabase.rpc('wf_emit_event', {
    p_organization_id: params.organizationId,
    p_event_typ: params.eventTyp,
    p_modul: params.modul,
    p_quell_tabelle: params.quellTabelle,
    p_quell_id: params.quellId ?? null,
    p_payload: params.payload ?? {},
    p_idempotency_key: params.idempotencyKey ?? null,
    p_prioritaet: params.prioritaet ?? 'normal',
    p_ausgeloest_von: params.ausgeloestVon ?? null,
  })
  if (error) throw new Error(`Event konnte nicht emittiert werden: ${error.message}`)
  return data as string | null
}
