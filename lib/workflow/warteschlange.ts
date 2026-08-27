import type { SupabaseClient } from '@supabase/supabase-js'
import { UserFacingError } from '@/lib/api/user-facing-error'
import type { WfWarteschlangeEintrag, ListWfWarteschlangeFilter } from './types'
import {
  ABBRECHBARE_QUEUE_STATUS,
  WIEDERHOLBARE_QUEUE_STATUS,
  pruefeLimit,
  pruefeOffset,
  pruefeQueueStatus,
  queueSperrgrund,
  STANDARD_LIMIT,
} from './validierung'

export async function listWarteschlange(
  supabase: SupabaseClient,
  filter: ListWfWarteschlangeFilter,
): Promise<WfWarteschlangeEintrag[]> {
  const status = pruefeQueueStatus(filter.status)
  const limit = pruefeLimit(filter.limit)
  const offset = pruefeOffset(filter.offset)

  let query = supabase
    .from('wf_warteschlange')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (limit) query = query.limit(limit)
  if (offset) query = query.range(offset, offset + (limit ?? STANDARD_LIMIT) - 1)

  const { data, error } = await query
  if (error) throw new Error(`Warteschlange konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as WfWarteschlangeEintrag[]
}

/**
 * Laedt den Ist-Zustand, um einen fehlgeschlagenen CAS zu erklaeren.
 *
 * Der CAS selbst kann nicht unterscheiden, ob der Eintrag gar nicht
 * existiert, einem anderen Mandanten gehoert oder nur im falschen Status
 * ist. Fuer eine brauchbare Fehlermeldung braucht es den Nachschlag —
 * er laeuft ausschliesslich im Fehlerfall.
 */
async function ladeZustand(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
): Promise<WfWarteschlangeEintrag | null> {
  const { data, error } = await supabase
    .from('wf_warteschlange')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
    .maybeSingle()
  if (error) throw new Error(`Warteschlangen-Eintrag konnte nicht geladen werden: ${error.message}`)
  return (data as WfWarteschlangeEintrag | null) ?? null
}

/**
 * Reiht einen Eintrag erneut ein — nur aus einem wiederholbaren Zustand.
 *
 * Der Statusfilter steht im UPDATE selbst und nicht in einer vorherigen
 * Abfrage: nur so ist der Uebergang atomar. Ein vorgeschaltetes SELECT
 * waere ein TOCTOU-Fenster, in dem ein Worker den Eintrag claimen kann,
 * bevor das UPDATE greift — genau der Fehler, den Migration
 * 20260824010000 auf DB-Ebene beseitigt hat.
 *
 * `fehler_nachricht` wird geleert, weil ein wartender Eintrag mit einer
 * alten Fehlermeldung in der Oberflaeche als fehlerhaft erscheint.
 * `versuch` bleibt unangetastet — der Zaehler ist Historie, und die
 * Dead-Letter-Tabelle haelt den Verlauf.
 */
export async function retryWarteschlangeEintrag(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
): Promise<WfWarteschlangeEintrag> {
  const jetzt = new Date().toISOString()
  const { data, error } = await supabase
    .from('wf_warteschlange')
    .update({
      status: 'wartend',
      naechster_versuch: jetzt,
      fehler_nachricht: null,
      updated_at: jetzt,
    })
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
    .in('status', WIEDERHOLBARE_QUEUE_STATUS as string[])
    .select('*')
    .maybeSingle()

  if (error) {
    throw new Error(`Warteschlangen-Eintrag konnte nicht wiederholt werden: ${error.message}`)
  }
  if (!data) {
    const ist = await ladeZustand(supabase, params)
    if (!ist) throw new UserFacingError('Warteschlangen-Eintrag nicht gefunden.', 404)
    throw new UserFacingError(queueSperrgrund(ist.status, 'wiederholen'), 409)
  }
  return data as WfWarteschlangeEintrag
}

/**
 * Bricht einen Eintrag ab — nur aus einem abbrechbaren Zustand.
 *
 * Siehe {@link ABBRECHBARE_QUEUE_STATUS}: ein erledigter Eintrag darf
 * nicht nachtraeglich als fehlgeschlagen erscheinen, und ein laufender
 * Eintrag laesst sich nicht wirksam abbrechen.
 */
export async function cancelWarteschlangeEintrag(
  supabase: SupabaseClient,
  params: { organizationId: string; id: string },
): Promise<WfWarteschlangeEintrag> {
  const jetzt = new Date().toISOString()
  const { data, error } = await supabase
    .from('wf_warteschlange')
    .update({
      status: 'fehlgeschlagen',
      fehler_nachricht: 'Manuell abgebrochen',
      updated_at: jetzt,
    })
    .eq('id', params.id)
    .eq('organization_id', params.organizationId)
    .in('status', ABBRECHBARE_QUEUE_STATUS as string[])
    .select('*')
    .maybeSingle()

  if (error) {
    throw new Error(`Warteschlangen-Eintrag konnte nicht abgebrochen werden: ${error.message}`)
  }
  if (!data) {
    const ist = await ladeZustand(supabase, params)
    if (!ist) throw new UserFacingError('Warteschlangen-Eintrag nicht gefunden.', 404)
    throw new UserFacingError(queueSperrgrund(ist.status, 'abbrechen'), 409)
  }
  return data as WfWarteschlangeEintrag
}
