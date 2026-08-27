import type { SupabaseClient } from '@supabase/supabase-js'
import { pruefeLimit, STANDARD_LIMIT } from './validierung'

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
  // Deckel auch hier: `p_limit` steuert, wie viele Events und
  // Warteschlangen-Eintraege ein einzelner Lauf abarbeitet. Ein
  // ungebremster Wert laesst die RPC ueber die Statement-Grenze laufen
  // und den ganzen Lauf zuruecksetzen, statt einen Teil zu schaffen.
  const limit = pruefeLimit(params?.limit) ?? STANDARD_LIMIT
  const { data, error } = await supabase.rpc('wf_process_pending', { p_limit: limit })
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
