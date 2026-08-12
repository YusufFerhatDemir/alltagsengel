// ═══════════════════════════════════════════════════════════════
// Ablaufüberwachung — akten_ablauf_dashboard View + Übersichts-Views
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AktenAblaufEintrag } from './types'

export interface AblaufFilter {
  organizationId: string
  clientId?: string
  caregiverId?: string
  dringlichkeit?: AktenAblaufEintrag['dringlichkeit']
}

export async function getAblaufDashboard(supabase: SupabaseClient, filter: AblaufFilter): Promise<AktenAblaufEintrag[]> {
  let query = supabase
    .from('akten_ablauf_dashboard')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('ablaufdatum', { ascending: true })

  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.dringlichkeit) query = query.eq('dringlichkeit', filter.dringlichkeit)

  const { data, error } = await query
  if (error) throw new Error(`Ablaufwarnungen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as AktenAblaufEintrag[]
}

const WARNUNG_SPALTE: Record<90 | 60 | 30 | 14 | 7, string> = {
  90: 'warnung_90_gesendet',
  60: 'warnung_60_gesendet',
  30: 'warnung_30_gesendet',
  14: 'warnung_14_gesendet',
  7: 'warnung_7_gesendet',
}

/** Markiert eine Ablaufwarn-Stufe als versendet, damit sie nicht erneut ausgelöst wird. */
export async function markiereWarnungGesendet(
  supabase: SupabaseClient,
  dokumentId: string,
  organizationId: string,
  stufe: 90 | 60 | 30 | 14 | 7
): Promise<void> {
  const spalte = WARNUNG_SPALTE[stufe]
  const { error } = await supabase
    .from('akten_dokumente')
    .update({ [spalte]: true })
    .eq('id', dokumentId)
    .eq('organization_id', organizationId)
  if (error) throw new Error(`Warnung konnte nicht markiert werden: ${error.message}`)
}

export interface KundenakteUebersichtRow {
  client_id: string
  organization_id: string
  first_name: string
  last_name: string
  pflegegrad: number | null
  pflegekasse_name: string | null
  client_status: string | null
  dokumente_gesamt: number
  vertraege_gesamt: number
  verordnungen_gesamt: number
  kontaktpersonen_gesamt: number
  abgelaufene_dokumente: number
}

export async function getKundenakteUebersicht(
  supabase: SupabaseClient,
  organizationId: string,
  clientId?: string
): Promise<KundenakteUebersichtRow[]> {
  let query = supabase.from('kundenakte_uebersicht').select('*').eq('organization_id', organizationId)
  if (clientId) query = query.eq('client_id', clientId)
  const { data, error } = await query.order('last_name')
  if (error) throw new Error(`Kundenakte-Übersicht konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as KundenakteUebersichtRow[]
}

export interface MitarbeiterakteUebersichtRow {
  caregiver_id: string
  organization_id: string
  first_name: string
  last_name: string
  caregiver_status: string | null
  einsatzfreigabe: boolean
  beschaeftigungsart: string | null
  dokumente_gesamt: number
  vertraege_gesamt: number
  abgelaufene_dokumente: number
}

export async function getMitarbeiterakteUebersicht(
  supabase: SupabaseClient,
  organizationId: string,
  caregiverId?: string
): Promise<MitarbeiterakteUebersichtRow[]> {
  let query = supabase.from('mitarbeiterakte_uebersicht').select('*').eq('organization_id', organizationId)
  if (caregiverId) query = query.eq('caregiver_id', caregiverId)
  const { data, error } = await query.order('last_name')
  if (error) throw new Error(`Mitarbeiterakte-Übersicht konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as MitarbeiterakteUebersichtRow[]
}
