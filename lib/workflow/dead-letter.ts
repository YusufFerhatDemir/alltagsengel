import type { SupabaseClient } from '@supabase/supabase-js'
import type { WfDeadLetter, ListWfDeadLetterFilter } from './types'

export async function listDeadLetter(
  supabase: SupabaseClient,
  filter: ListWfDeadLetterFilter,
): Promise<WfDeadLetter[]> {
  let query = supabase
    .from('wf_dead_letter')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })

  if (filter.manuellWiederholt !== undefined) query = query.eq('manuell_wiederholt', filter.manuellWiederholt)
  if (filter.limit) query = query.limit(filter.limit)
  if (filter.offset) query = query.range(filter.offset, filter.offset + (filter.limit ?? 50) - 1)

  const { data, error } = await query
  if (error) throw new Error(`Dead-Letter-Queue konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as WfDeadLetter[]
}

export async function getDeadLetter(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
): Promise<WfDeadLetter | null> {
  const { data, error } = await supabase
    .from('wf_dead_letter')
    .select('*')
    .eq('organization_id', params.organizationId)
    .eq('id', params.id)
    .maybeSingle()
  if (error) throw new Error(`Dead-Letter-Eintrag konnte nicht geladen werden: ${error.message}`)
  return data as WfDeadLetter | null
}

export async function retryDeadLetter(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string; wiederholtVon: string },
): Promise<{ deadLetter: WfDeadLetter; neuesEventId: string | null }> {
  const deadLetter = await getDeadLetter(supabase, { organizationId: params.organizationId, id: params.id })
  if (!deadLetter) throw new Error('Dead-Letter-Eintrag nicht gefunden')

  const { data: event, error: eventError } = await supabase
    .from('wf_events')
    .select('event_typ, modul, quell_tabelle, quell_id, payload')
    .eq('id', deadLetter.event_id)
    .eq('organization_id', params.organizationId)
    .single()
  if (eventError || !event) throw new Error(`Urspruengliches Event konnte nicht geladen werden: ${eventError?.message ?? 'unbekannt'}`)

  const { data: neuesEventId, error: emitError } = await supabase.rpc('wf_emit_event', {
    p_organization_id: params.organizationId,
    p_event_typ: event.event_typ,
    p_modul: event.modul,
    p_quell_tabelle: event.quell_tabelle,
    p_quell_id: event.quell_id,
    p_payload: event.payload,
    p_idempotency_key: `manuell_wiederholt:${deadLetter.id}:${Date.now()}`,
    p_prioritaet: 'hoch',
    p_ausgeloest_von: params.wiederholtVon,
  })
  if (emitError) throw new Error(`Erneuter Versuch konnte nicht ausgeloest werden: ${emitError.message}`)

  const { data: updated, error: updateError } = await supabase
    .from('wf_dead_letter')
    .update({ manuell_wiederholt: true, wiederholt_am: new Date().toISOString(), wiederholt_von: params.wiederholtVon })
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
    .select('*')
    .single()
  if (updateError || !updated) throw new Error(`Dead-Letter-Eintrag konnte nicht aktualisiert werden: ${updateError?.message ?? 'unbekannt'}`)

  return { deadLetter: updated as WfDeadLetter, neuesEventId: neuesEventId as string | null }
}
