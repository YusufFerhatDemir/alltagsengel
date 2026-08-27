import type { SupabaseClient } from '@supabase/supabase-js'
import type { WfEvent, ListWfEventsFilter } from './types'
import { WF_EVENT_STATUS_WERTE, WF_MODUL_WERTE } from './types'
import { pruefeEnum, pruefeLimit, pruefeOffset, STANDARD_LIMIT } from './validierung'

export async function listEvents(
  supabase: SupabaseClient,
  filter: ListWfEventsFilter,
): Promise<WfEvent[]> {
  const status = pruefeEnum(filter.status, WF_EVENT_STATUS_WERTE, 'status')
  const modul = pruefeEnum(filter.modul, WF_MODUL_WERTE, 'modul')
  const limit = pruefeLimit(filter.limit)
  const offset = pruefeOffset(filter.offset)

  let query = supabase
    .from('wf_events')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (modul) query = query.eq('modul', modul)
  if (filter.eventTyp) query = query.eq('event_typ', filter.eventTyp)
  if (limit) query = query.limit(limit)
  if (offset) query = query.range(offset, offset + (limit ?? STANDARD_LIMIT) - 1)

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
