import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertErlaubt,
  ABWESENHEIT_STATUS_WERTE, ABWESENHEIT_TYP_WERTE,
  type Abwesenheit, type AbwesenheitStatus, type AbwesenheitTyp,
} from './types'

export interface CreateAbwesenheitParams {
  organizationId: string
  caregiverId: string
  absenceType: AbwesenheitTyp
  startDate: string
  endDate: string
  reason?: string | null
  halberTag?: boolean
  tageBerechnet?: number | null
  dokumentId?: string | null
  erstelltVon: string
}

export async function createAbwesenheit(supabase: SupabaseClient, params: CreateAbwesenheitParams): Promise<Abwesenheit> {
  assertErlaubt(params.absenceType, ABWESENHEIT_TYP_WERTE, 'absence_type')

  const { data, error } = await supabase
    .from('absences')
    .insert({
      organization_id: params.organizationId,
      caregiver_id: params.caregiverId,
      absence_type: params.absenceType,
      start_date: params.startDate,
      end_date: params.endDate,
      reason: params.reason ?? null,
      status: 'beantragt',
      halber_tag: params.halberTag ?? false,
      tage_berechnet: params.tageBerechnet ?? null,
      dokument_id: params.dokumentId ?? null,
      erstellt_von: params.erstelltVon,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Abwesenheit konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  return data as Abwesenheit
}

export interface ListAbwesenheitenFilter {
  organizationId: string
  caregiverId?: string
  status?: AbwesenheitStatus
  absenceType?: AbwesenheitTyp
  datumVon?: string
  datumBis?: string
}

export async function listAbwesenheiten(supabase: SupabaseClient, filter: ListAbwesenheitenFilter): Promise<Abwesenheit[]> {
  let query = supabase
    .from('absences')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('start_date', { ascending: false })

  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.status) query = query.eq('status', filter.status)
  if (filter.absenceType) query = query.eq('absence_type', filter.absenceType)
  if (filter.datumVon) query = query.gte('start_date', filter.datumVon)
  if (filter.datumBis) query = query.lte('end_date', filter.datumBis)

  const { data, error } = await query
  if (error) throw new Error(`Abwesenheiten konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as Abwesenheit[]
}

export interface UpdateAbwesenheitParams {
  absenceType?: AbwesenheitTyp
  startDate?: string
  endDate?: string
  reason?: string | null
  halberTag?: boolean
  tageBerechnet?: number | null
  dokumentId?: string | null
}

export async function updateAbwesenheit(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateAbwesenheitParams,
): Promise<Abwesenheit> {
  assertErlaubt(patch.absenceType, ABWESENHEIT_TYP_WERTE, 'absence_type')

  const update: Record<string, unknown> = {}
  if (patch.absenceType !== undefined) update.absence_type = patch.absenceType
  if (patch.startDate !== undefined) update.start_date = patch.startDate
  if (patch.endDate !== undefined) update.end_date = patch.endDate
  if (patch.reason !== undefined) update.reason = patch.reason
  if (patch.halberTag !== undefined) update.halber_tag = patch.halberTag
  if (patch.tageBerechnet !== undefined) update.tage_berechnet = patch.tageBerechnet
  if (patch.dokumentId !== undefined) update.dokument_id = patch.dokumentId

  if (Object.keys(update).length === 0) throw new Error('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('absences')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Abwesenheit konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as Abwesenheit
}

export async function genehmigenAbwesenheit(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  genehmigenVon: string,
): Promise<Abwesenheit> {
  const { data: existing, error: loadErr } = await supabase
    .from('absences')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()
  if (loadErr || !existing) throw new Error('Abwesenheit nicht gefunden.')
  if (existing.status !== 'beantragt') throw new Error('Nur beantragte Abwesenheiten können genehmigt werden.')
  if (existing.erstellt_von === genehmigenVon) {
    throw new Error('Eigene Abwesenheiten koennen nicht selbst genehmigt werden.')
  }

  const { data, error } = await supabase
    .from('absences')
    .update({
      status: 'genehmigt',
      genehmigt_von: genehmigenVon,
      genehmigt_am: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .eq('status', 'beantragt')
    .select('*')
    .single()
  if (error || !data) throw new Error(`Abwesenheit konnte nicht genehmigt werden: ${error?.message ?? 'unbekannt'}`)

  const abwesenheit = data as Abwesenheit

  // P1-35: Urlaubskonto synchronisieren bei genehmigtem Urlaub
  if (abwesenheit.absence_type === 'vacation') {
    const start = new Date(abwesenheit.start_date)
    const end = new Date(abwesenheit.end_date)
    const diffMs = end.getTime() - start.getTime()
    const tage = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1)
    const dauer = abwesenheit.halber_tag ? 0.5 : tage
    const jahr = start.getFullYear()

    const { data: konto } = await supabase
      .from('personal_urlaubskonto')
      .select('id, genommen_tage')
      .eq('organization_id', organizationId)
      .eq('caregiver_id', abwesenheit.caregiver_id)
      .eq('jahr', jahr)
      .maybeSingle()

    if (konto) {
      await supabase
        .from('personal_urlaubskonto')
        .update({ genommen_tage: (konto.genommen_tage ?? 0) + dauer })
        .eq('id', konto.id)
        .eq('organization_id', organizationId)
    }
  }

  return abwesenheit
}

export async function ablehnenAbwesenheit(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  abgelehntVon: string,
  ablehnungsgrund: string,
): Promise<Abwesenheit> {
  if (!ablehnungsgrund?.trim()) throw new Error('Ablehnungsgrund ist ein Pflichtfeld.')

  const { data, error } = await supabase
    .from('absences')
    .update({
      status: 'abgelehnt',
      genehmigt_von: abgelehntVon,
      genehmigt_am: new Date().toISOString(),
      ablehnungsgrund: ablehnungsgrund.trim(),
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .eq('status', 'beantragt')
    .select('*')
    .single()
  if (error || !data) throw new Error(`Abwesenheit konnte nicht abgelehnt werden: ${error?.message ?? 'Nur beantragte Abwesenheiten können abgelehnt werden.'}`)
  return data as Abwesenheit
}
