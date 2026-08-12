import type { SupabaseClient } from '@supabase/supabase-js'

export interface WfProcessPendingResult {
  events_verarbeitet: number
  queue_verarbeitet: number
  erfolgreich: number
  fehlgeschlagen: number
  zeitpunkt: string
}

export interface WfCheckFristenResult {
  neue_events: number
  zeitpunkt: string
}

export async function processPending(
  supabase: SupabaseClient,
  params?: { limit?: number },
): Promise<WfProcessPendingResult> {
  const { data, error } = await supabase.rpc('wf_process_pending', { p_limit: params?.limit ?? 50 })
  if (error) throw new Error(`Verarbeitung konnte nicht ausgefuehrt werden: ${error.message}`)
  return data as WfProcessPendingResult
}

export async function checkFristen(
  supabase: SupabaseClient,
): Promise<WfCheckFristenResult> {
  const { data, error } = await supabase.rpc('wf_check_fristen')
  if (error) throw new Error(`Fristenpruefung konnte nicht ausgefuehrt werden: ${error.message}`)
  return data as WfCheckFristenResult
}
