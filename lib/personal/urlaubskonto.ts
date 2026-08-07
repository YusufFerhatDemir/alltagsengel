import type { SupabaseClient } from '@supabase/supabase-js'
import type { PersonalUrlaubskonto, UrlaubsUebersicht } from './types'

export interface CreateUrlaubskontoParams {
  organizationId: string
  caregiverId: string
  jahr: number
  anspruchTage: number
  uebertragVorjahr?: number
  bemerkung?: string | null
}

export async function createUrlaubskonto(supabase: SupabaseClient, params: CreateUrlaubskontoParams): Promise<PersonalUrlaubskonto> {
  const { data, error } = await supabase
    .from('personal_urlaubskonto')
    .insert({
      organization_id: params.organizationId,
      caregiver_id: params.caregiverId,
      jahr: params.jahr,
      anspruch_tage: params.anspruchTage,
      uebertrag_vorjahr: params.uebertragVorjahr ?? 0,
      bemerkung: params.bemerkung ?? null,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Urlaubskonto konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as PersonalUrlaubskonto
}

export interface ListUrlaubskontoFilter {
  organizationId: string
  caregiverId?: string
  jahr?: number
}

export async function listUrlaubskonten(supabase: SupabaseClient, filter: ListUrlaubskontoFilter): Promise<PersonalUrlaubskonto[]> {
  let query = supabase
    .from('personal_urlaubskonto')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('jahr', { ascending: false })

  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.jahr) query = query.eq('jahr', filter.jahr)

  const { data, error } = await query
  if (error) throw new Error(`Urlaubskonten konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as PersonalUrlaubskonto[]
}

export interface UpdateUrlaubskontoParams {
  anspruchTage?: number
  genommenTage?: number
  geplantTage?: number
  uebertragVorjahr?: number
  bemerkung?: string | null
}

export async function updateUrlaubskonto(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateUrlaubskontoParams,
): Promise<PersonalUrlaubskonto> {
  const update: Record<string, unknown> = {}
  if (patch.anspruchTage !== undefined) update.anspruch_tage = patch.anspruchTage
  if (patch.genommenTage !== undefined) update.genommen_tage = patch.genommenTage
  if (patch.geplantTage !== undefined) update.geplant_tage = patch.geplantTage
  if (patch.uebertragVorjahr !== undefined) update.uebertrag_vorjahr = patch.uebertragVorjahr
  if (patch.bemerkung !== undefined) update.bemerkung = patch.bemerkung

  if (Object.keys(update).length === 0) throw new Error('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('personal_urlaubskonto')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Urlaubskonto konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as PersonalUrlaubskonto
}

export async function listUrlaubsUebersicht(
  supabase: SupabaseClient,
  organizationId: string,
  jahr?: number,
): Promise<UrlaubsUebersicht[]> {
  let query = supabase
    .from('personal_urlaubsuebersicht')
    .select('*')
    .eq('organization_id', organizationId)
    .order('caregiver_name', { ascending: true })

  if (jahr) query = query.eq('jahr', jahr)

  const { data, error } = await query
  if (error) throw new Error(`Urlaubsübersicht konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as UrlaubsUebersicht[]
}
