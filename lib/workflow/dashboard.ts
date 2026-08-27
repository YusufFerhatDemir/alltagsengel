import type { SupabaseClient } from '@supabase/supabase-js'
import type { WfEventDashboard, WfQueueStatusRow, WfDeadLetterUebersicht, WfStatistik } from './types'
import { pruefeLimit } from './validierung'

export interface WorkflowDashboard {
  statistik: WfStatistik | null
  letzteEvents: WfEventDashboard[]
  queueStatus: WfQueueStatusRow[]
}

export async function getStatistik(
  supabase: SupabaseClient,
  params: { organizationId: string },
): Promise<WfStatistik | null> {
  const { data, error } = await supabase
    .from('wf_statistik')
    .select('*')
    .eq('organization_id', params.organizationId)
    .maybeSingle()
  if (error) throw new Error(`Statistik konnte nicht geladen werden: ${error.message}`)
  return data as WfStatistik | null
}

export async function listLetzteEvents(
  supabase: SupabaseClient,
  params: { organizationId: string; limit?: number },
): Promise<WfEventDashboard[]> {
  const { data, error } = await supabase
    .from('wf_events_dashboard')
    .select('*')
    .eq('organization_id', params.organizationId)
    .limit(pruefeLimit(params.limit) ?? 20)
  if (error) throw new Error(`Events konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as WfEventDashboard[]
}

export async function listQueueStatus(
  supabase: SupabaseClient,
  params: { organizationId: string; limit?: number },
): Promise<WfQueueStatusRow[]> {
  const { data, error } = await supabase
    .from('wf_queue_status')
    .select('*')
    .eq('organization_id', params.organizationId)
    .limit(pruefeLimit(params.limit) ?? 20)
  if (error) throw new Error(`Warteschlangen-Status konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as WfQueueStatusRow[]
}

export async function listDeadLetterUebersicht(
  supabase: SupabaseClient,
  params: { organizationId: string; limit?: number },
): Promise<WfDeadLetterUebersicht[]> {
  const { data, error } = await supabase
    .from('wf_dead_letter_uebersicht')
    .select('*')
    .eq('organization_id', params.organizationId)
    .limit(pruefeLimit(params.limit) ?? 20)
  if (error) throw new Error(`Dead-Letter-Uebersicht konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as WfDeadLetterUebersicht[]
}

export async function getDashboard(
  supabase: SupabaseClient,
  params: { organizationId: string },
): Promise<WorkflowDashboard> {
  const [statistik, letzteEvents, queueStatus] = await Promise.all([
    getStatistik(supabase, params),
    listLetzteEvents(supabase, { organizationId: params.organizationId, limit: 10 }),
    listQueueStatus(supabase, { organizationId: params.organizationId, limit: 10 }),
  ])
  return { statistik, letzteEvents, queueStatus }
}
