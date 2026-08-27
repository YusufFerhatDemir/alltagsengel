import type { SupabaseClient } from '@supabase/supabase-js'
import { UserFacingError } from '@/lib/api/user-facing-error'
import type { WfDeadLetter, ListWfDeadLetterFilter } from './types'
import { pruefeLimit, pruefeOffset, STANDARD_LIMIT } from './validierung'

export async function listDeadLetter(
  supabase: SupabaseClient,
  filter: ListWfDeadLetterFilter,
): Promise<WfDeadLetter[]> {
  const limit = pruefeLimit(filter.limit)
  const offset = pruefeOffset(filter.offset)

  let query = supabase
    .from('wf_dead_letter')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })

  if (filter.manuellWiederholt !== undefined) query = query.eq('manuell_wiederholt', filter.manuellWiederholt)
  if (limit) query = query.limit(limit)
  if (offset) query = query.range(offset, offset + (limit ?? STANDARD_LIMIT) - 1)

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

/**
 * Loest einen Dead-Letter-Eintrag von Hand erneut aus.
 *
 * Reihenfolge ist hier die eigentliche Absicherung. Zuvor wurde erst
 * `wf_emit_event` gerufen und danach `manuell_wiederholt` gesetzt; das
 * Flag wurde ausserdem nie geprueft. Zwei Klicks auf denselben Eintrag
 * ergaben damit zwei echte Wiederholungen — und die sonst uebliche
 * Idempotenz der Engine greift hier bewusst nicht, weil der
 * Idempotency-Key `Date.now()` enthaelt und pro Aufruf neu ist.
 *
 * Doppelte Ausloesung ist teuer: `wf_execute_queue_item` schreibt auf
 * `invoices`, `payments` und `dunning_entries` und erzeugt Mahnungen,
 * Aufgaben und Eskalationen.
 *
 * Jetzt beansprucht ein CAS (`manuell_wiederholt: false -> true`) den
 * Eintrag, bevor irgendetwas ausgeloest wird. Der zweite Klick findet
 * keine Zeile mehr und bricht ab, ohne ein Event zu erzeugen.
 * Schlaegt das Ausloesen danach fehl, wird der Anspruch zurueckgerollt —
 * andernfalls waere der Eintrag als wiederholt markiert, ohne dass je
 * ein Versuch stattgefunden hat, und damit dauerhaft blockiert.
 */
export async function retryDeadLetter(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string; wiederholtVon: string },
): Promise<{ deadLetter: WfDeadLetter; neuesEventId: string | null }> {
  // 1. CAS-Anspruch — schuetzt gegen den zweiten gleichzeitigen Klick.
  const { data: beansprucht, error: claimError } = await supabase
    .from('wf_dead_letter')
    .update({
      manuell_wiederholt: true,
      wiederholt_am: new Date().toISOString(),
      wiederholt_von: params.wiederholtVon,
    })
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
    .eq('manuell_wiederholt', false)
    .select('*')
    .maybeSingle()

  if (claimError) {
    throw new Error(`Dead-Letter-Eintrag konnte nicht beansprucht werden: ${claimError.message}`)
  }
  if (!beansprucht) {
    const ist = await getDeadLetter(supabase, { organizationId: params.organizationId, id: params.id })
    if (!ist) throw new UserFacingError('Dead-Letter-Eintrag nicht gefunden.', 404)
    throw new UserFacingError('Dieser Eintrag wurde bereits manuell wiederholt.', 409)
  }

  const deadLetter = beansprucht as WfDeadLetter

  /** Gibt den Anspruch frei, damit ein spaeterer Versuch moeglich bleibt. */
  const anspruchZuruecknehmen = async () => {
    await supabase
      .from('wf_dead_letter')
      .update({ manuell_wiederholt: false, wiederholt_am: null, wiederholt_von: null })
      .eq('id', params.id)
      .eq('organization_id', params.organizationId)
  }

  // 2. Urspruengliches Event laden.
  const { data: event, error: eventError } = await supabase
    .from('wf_events')
    .select('event_typ, modul, quell_tabelle, quell_id, payload')
    .eq('id', deadLetter.event_id)
    .eq('organization_id', params.organizationId)
    .single()
  if (eventError || !event) {
    await anspruchZuruecknehmen()
    throw new Error(`Urspruengliches Event konnte nicht geladen werden: ${eventError?.message ?? 'unbekannt'}`)
  }

  // 3. Erst jetzt ausloesen.
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
  if (emitError) {
    await anspruchZuruecknehmen()
    throw new Error(`Erneuter Versuch konnte nicht ausgeloest werden: ${emitError.message}`)
  }

  return { deadLetter, neuesEventId: neuesEventId as string | null }
}
