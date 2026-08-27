// ═══════════════════════════════════════════════════════════════
// Kenntnisnahme — der eigentliche Nachweis der Informationsweitergabe
// Der MD prüft nicht, ob eine Übergabe geschrieben wurde, sondern ob der
// übernehmende Dienst sie erhalten hat. Genau das steht hier.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { UserFacingError } from '@/lib/api/user-facing-error'
import type { UebergabeKenntnisnahme } from './types'

export interface QuittierenParams {
  protokollId: string
  /**
   * PFLICHT — auch beim user-scoped Client (Engel).
   *
   * Mandantenschutz: `protokollId` kommt aus der URL, also aus dem Body des
   * Aufrufers. War die Organisation optional, lief der Protokoll-Lookup bei
   * einem Service-Role-Client (istAdmin, RLS umgangen) ohne jeden
   * Mandantenfilter — wer die UUID eines fremden Protokolls kannte, konnte es
   * quittieren und tauchte im Nachweis einer fremden Organisation auf.
   *
   * Der Filter ist zugleich die Absicherung fuer die INSERT-Spalte: erst wenn
   * das Protokoll unter genau dieser Organisation sichtbar war, wird
   * geschrieben. Beim user-scoped Client faellt die Sichtbarkeit ohnehin mit
   * current_org_id() zusammen (org_fence ist RESTRICTIVE), der explizite Wert
   * entspricht dort also dem Spalten-Default.
   */
  organizationId: string
  userId: string
  caregiverId?: string | null
  name: string
  rolle: string
}

/**
 * Quittiert ein Protokoll. Nur abgeschlossene Protokolle sind
 * quittierbar — ein offenes Protokoll kann sich noch ändern, eine
 * Kenntnisnahme darauf hätte keine Aussagekraft.
 */
export async function quittieren(
  supabase: SupabaseClient,
  params: QuittierenParams,
): Promise<UebergabeKenntnisnahme> {
  if (!params.name?.trim()) throw new UserFacingError('Der Name der quittierenden Person ist ein Pflichtfeld.')
  if (!params.organizationId) {
    throw new UserFacingError('Die Organisation der quittierenden Person konnte nicht bestimmt werden.', 403)
  }

  const { data: protokoll, error: protokollError } = await supabase
    .from('uebergabe_protokolle')
    .select('status')
    .eq('id', params.protokollId)
    .eq('organization_id', params.organizationId)
    .maybeSingle()

  if (protokollError) throw new Error(`Protokoll konnte nicht geprüft werden: ${protokollError.message}`)
  if (!protokoll) throw new UserFacingError('Übergabeprotokoll nicht gefunden.', 404)
  if (protokoll.status !== 'abgeschlossen') {
    throw new UserFacingError('Nur abgeschlossene Übergabeprotokolle können zur Kenntnis genommen werden.', 409)
  }

  const { data, error } = await supabase
    .from('uebergabe_kenntnisnahmen')
    .insert({
      protokoll_id: params.protokollId,
      organization_id: params.organizationId,
      user_id: params.userId,
      caregiver_id: params.caregiverId ?? null,
      name: params.name.trim(),
      rolle: params.rolle,
    })
    .select('*')
    .single()

  if (error) {
    // Doppelte Quittung ist kein Fehlerfall — die vorhandene zählt.
    if (error.code === '23505') {
      const bestand = await getKenntnisnahme(supabase, params.protokollId, params.userId, params.organizationId)
      if (bestand) return bestand
    }
    throw new Error(`Kenntnisnahme konnte nicht gespeichert werden: ${error.message}`)
  }
  return data as UebergabeKenntnisnahme
}

export async function listKenntnisnahmen(
  supabase: SupabaseClient,
  protokollId: string,
  organizationId: string,
): Promise<UebergabeKenntnisnahme[]> {
  const { data, error } = await supabase
    .from('uebergabe_kenntnisnahmen')
    .select('*')
    .eq('protokoll_id', protokollId)
    .eq('organization_id', organizationId)
    .order('zeitpunkt', { ascending: true })

  if (error) throw new Error(`Kenntnisnahmen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as UebergabeKenntnisnahme[]
}

export async function getKenntnisnahme(
  supabase: SupabaseClient,
  protokollId: string,
  userId: string,
  organizationId?: string,
): Promise<UebergabeKenntnisnahme | null> {
  let query = supabase
    .from('uebergabe_kenntnisnahmen')
    .select('*')
    .eq('protokoll_id', protokollId)
    .eq('user_id', userId)
  if (organizationId) query = query.eq('organization_id', organizationId)
  const { data, error } = await query.maybeSingle()

  if (error) throw new Error(`Kenntnisnahme konnte nicht geladen werden: ${error.message}`)
  return (data as UebergabeKenntnisnahme | null) ?? null
}

/**
 * Welche vorgesehenen Empfänger haben noch nicht quittiert?
 * Reine Mengenlogik — ohne DB, damit sie testbar bleibt.
 */
export function offeneKenntnisnahmen(
  vorgesehen: string[],
  kenntnisnahmen: { caregiver_id: string | null }[],
): string[] {
  const quittiert = new Set(kenntnisnahmen.map(k => k.caregiver_id).filter(Boolean) as string[])
  return vorgesehen.filter(id => !quittiert.has(id))
}
