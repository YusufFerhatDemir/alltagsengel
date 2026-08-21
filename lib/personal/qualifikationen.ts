import { UserFacingError } from '@/lib/api/user-facing-error'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CaregiverQualifikation } from './types'

export interface CreateQualifikationParams {
  organizationId: string
  caregiverId: string
  title: string
  qualificationType: string
  issuedDate?: string | null
  validUntil?: string | null
  status?: string
  ausstellendeStelle?: string | null
  dokumentId?: string | null
  bemerkung?: string | null
  pflicht?: boolean
  einsatzrelevant?: boolean
}

export async function createQualifikation(supabase: SupabaseClient, params: CreateQualifikationParams): Promise<CaregiverQualifikation> {
  if (!params.title?.trim()) throw new UserFacingError('Titel ist ein Pflichtfeld.')

  const { data, error } = await supabase
    .from('caregiver_qualifications')
    .insert({
      organization_id: params.organizationId,
      caregiver_id: params.caregiverId,
      title: params.title.trim(),
      qualification_type: params.qualificationType,
      issued_date: params.issuedDate ?? null,
      valid_until: params.validUntil ?? null,
      status: params.status ?? 'valid',
      ausstellende_stelle: params.ausstellendeStelle ?? null,
      dokument_id: params.dokumentId ?? null,
      bemerkung: params.bemerkung ?? null,
      pflicht: params.pflicht ?? false,
      einsatzrelevant: params.einsatzrelevant ?? false,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Qualifikation konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as CaregiverQualifikation
}

export interface ListQualifikationenFilter {
  organizationId: string
  caregiverId?: string
  nurPflicht?: boolean
  nurEinsatzrelevant?: boolean
}

export async function listQualifikationen(supabase: SupabaseClient, filter: ListQualifikationenFilter): Promise<CaregiverQualifikation[]> {
  let query = supabase
    .from('caregiver_qualifications')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('valid_until', { ascending: true, nullsFirst: false })

  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.nurPflicht) query = query.eq('pflicht', true)
  if (filter.nurEinsatzrelevant) query = query.eq('einsatzrelevant', true)

  const { data, error } = await query
  if (error) throw new Error(`Qualifikationen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as CaregiverQualifikation[]
}

export interface UpdateQualifikationParams {
  title?: string
  qualificationType?: string
  issuedDate?: string | null
  validUntil?: string | null
  status?: string
  ausstellendeStelle?: string | null
  dokumentId?: string | null
  bemerkung?: string | null
  verifziertVon?: string | null
  verifziertAm?: string | null
  pflicht?: boolean
  einsatzrelevant?: boolean
}

export async function updateQualifikation(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateQualifikationParams,
): Promise<CaregiverQualifikation> {
  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.qualificationType !== undefined) update.qualification_type = patch.qualificationType
  if (patch.issuedDate !== undefined) update.issued_date = patch.issuedDate
  if (patch.validUntil !== undefined) update.valid_until = patch.validUntil
  if (patch.status !== undefined) update.status = patch.status
  if (patch.ausstellendeStelle !== undefined) update.ausstellende_stelle = patch.ausstellendeStelle
  if (patch.dokumentId !== undefined) update.dokument_id = patch.dokumentId
  if (patch.bemerkung !== undefined) update.bemerkung = patch.bemerkung
  if (patch.verifziertVon !== undefined) update.verifiziert_von = patch.verifziertVon
  if (patch.verifziertAm !== undefined) update.verifiziert_am = patch.verifziertAm
  if (patch.pflicht !== undefined) update.pflicht = patch.pflicht
  if (patch.einsatzrelevant !== undefined) update.einsatzrelevant = patch.einsatzrelevant

  if (Object.keys(update).length === 0) throw new UserFacingError('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('caregiver_qualifications')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Qualifikation konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as CaregiverQualifikation
}

export async function deleteQualifikation(supabase: SupabaseClient, id: string, organizationId: string): Promise<void> {
  const { error } = await supabase
    .from('caregiver_qualifications')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(`Qualifikation konnte nicht gelöscht werden: ${error.message}`)
}

export async function listAblaufWarnungen(supabase: SupabaseClient, organizationId: string): Promise<import('./types').QualifikationAblaufWarnung[]> {
  const { data, error } = await supabase
    .from('qualifikation_ablauf_warnung')
    .select('*')
    .eq('organization_id', organizationId)
    .order('tage_verbleibend', { ascending: true, nullsFirst: false })
  if (error) throw new Error(`Ablaufwarnungen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as import('./types').QualifikationAblaufWarnung[]
}
