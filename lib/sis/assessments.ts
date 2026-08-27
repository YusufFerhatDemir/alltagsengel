import { UserFacingError } from '@/lib/api/user-facing-error'
// ═══════════════════════════════════════════════════════════════
// SIS-Assessments — sis_assessments (Kopfsatz)
// CRUD + Statusmaschine + Abschluss-Validierung + Sperr-Logik.
// Eine gesperrte SIS ist unveränderlich; die DB (trg_locked_sis,
// trg_locked_sis_child_edit) erzwingt dasselbe auf Tabellenebene.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertSisWert,
  relevanteThemenfelder,
  SIS_ASSESSMENT_TYP_WERTE,
  SIS_RISIKO_WERTE,
  SIS_VERSORGUNGSFORM_WERTE,
  type SisAssessment,
  type SisAssessmentDetail,
  type SisAssessmentTyp,
  type SisRisikoZeile,
  type SisStatus,
  type SisThemenfeld,
  type SisVersorgungsform,
} from './types'

/** Erlaubte Statusübergänge des SIS-Kopfsatzes. */
export function validateSisUebergang(von: SisStatus, nach: SisStatus): void {
  const erlaubt: Record<SisStatus, SisStatus[]> = {
    entwurf: ['abgeschlossen', 'gesperrt'],
    abgeschlossen: ['gesperrt', 'entwurf'], // Wiedereröffnung vor Sperre zulässig
    gesperrt: [],
  }
  if (!erlaubt[von]?.includes(nach)) {
    throw new UserFacingError(`Statuswechsel ${von} → ${nach} ist nicht erlaubt.`)
  }
}

export interface CreateSisParams {
  organizationId: string
  clientId: string
  erhobenVon: string
  erstelltVon: string
  assessmentDatum?: string | null
  assessmentTyp?: SisAssessmentTyp
  versorgungsform?: SisVersorgungsform
  eingangsfrage?: string | null
  bemerkung?: string | null
}

/**
 * Legt einen SIS-Kopfsatz an und initialisiert die relevanten Themenfelder
 * (1-5, ambulant zusätzlich 6) sowie alle 5 Risikomatrix-Zeilen.
 */
export async function createAssessment(supabase: SupabaseClient, params: CreateSisParams): Promise<SisAssessmentDetail> {
  assertSisWert(params.assessmentTyp, SIS_ASSESSMENT_TYP_WERTE, 'assessment_typ')
  assertSisWert(params.versorgungsform, SIS_VERSORGUNGSFORM_WERTE, 'versorgungsform')
  const versorgungsform = params.versorgungsform ?? 'ambulant'

  const { data, error } = await supabase
    .from('sis_assessments')
    .insert({
      organization_id: params.organizationId,
      client_id: params.clientId,
      assessment_datum: params.assessmentDatum ?? undefined,
      assessment_typ: params.assessmentTyp ?? 'erstgespraech',
      versorgungsform,
      erhoben_von: params.erhobenVon,
      eingangsfrage: params.eingangsfrage ?? null,
      bemerkung: params.bemerkung ?? null,
      erstellt_von: params.erstelltVon,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`SIS konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)
  const assessment = data as SisAssessment

  const themenfelderRows = relevanteThemenfelder(versorgungsform).map(nr => ({
    organization_id: params.organizationId,
    assessment_id: assessment.id,
    feld_nr: nr,
  }))
  const { data: themenfelder, error: tfError } = await supabase
    .from('sis_themenfelder')
    .insert(themenfelderRows)
    .select('*')
  if (tfError) throw new Error(`SIS-Themenfelder konnten nicht initialisiert werden: ${tfError.message}`)

  const risikoRows = SIS_RISIKO_WERTE.map(risiko => ({
    organization_id: params.organizationId,
    assessment_id: assessment.id,
    risiko,
  }))
  const { data: risikomatrix, error: rmError } = await supabase
    .from('sis_risikomatrix')
    .insert(risikoRows)
    .select('*')
  if (rmError) throw new Error(`SIS-Risikomatrix konnte nicht initialisiert werden: ${rmError.message}`)

  return {
    ...assessment,
    themenfelder: (themenfelder ?? []) as SisThemenfeld[],
    risikomatrix: (risikomatrix ?? []) as SisRisikoZeile[],
  }
}

export interface ListSisFilter {
  organizationId: string
  clientId?: string
  status?: SisStatus
}

export async function listAssessments(supabase: SupabaseClient, filter: ListSisFilter): Promise<SisAssessment[]> {
  let query = supabase
    .from('sis_assessments')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('assessment_datum', { ascending: false })
    .order('created_at', { ascending: false })
  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.status) query = query.eq('status', filter.status)

  const { data, error } = await query
  if (error) throw new Error(`SIS-Liste konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as SisAssessment[]
}

export async function getAssessment(supabase: SupabaseClient, id: string, organizationId: string): Promise<SisAssessmentDetail | null> {
  const { data, error } = await supabase
    .from('sis_assessments')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`SIS konnte nicht geladen werden: ${error.message}`)
  if (!data) return null

  const [tf, rm] = await Promise.all([
    supabase.from('sis_themenfelder').select('*').eq('assessment_id', id).order('feld_nr'),
    supabase.from('sis_risikomatrix').select('*').eq('assessment_id', id).order('risiko'),
  ])
  if (tf.error) throw new Error(`SIS-Themenfelder konnten nicht geladen werden: ${tf.error.message}`)
  if (rm.error) throw new Error(`SIS-Risikomatrix konnte nicht geladen werden: ${rm.error.message}`)

  return {
    ...(data as SisAssessment),
    themenfelder: (tf.data ?? []) as SisThemenfeld[],
    risikomatrix: (rm.data ?? []) as SisRisikoZeile[],
  }
}

export interface UpdateSisParams {
  assessmentDatum?: string
  assessmentTyp?: SisAssessmentTyp
  eingangsfrage?: string | null
  bemerkung?: string | null
}

/** Aktualisiert Kopfdaten. Nur im Entwurf möglich; Versorgungsform ist fix. */
export async function updateAssessment(
  supabase: SupabaseClient, id: string, organizationId: string, params: UpdateSisParams,
): Promise<SisAssessment> {
  assertSisWert(params.assessmentTyp, SIS_ASSESSMENT_TYP_WERTE, 'assessment_typ')

  const bestehend = await ladeKopfsatz(supabase, id, organizationId)
  if (bestehend.gesperrt) throw new UserFacingError('Gesperrte Informationssammlung kann nicht bearbeitet werden.')
  if (bestehend.status !== 'entwurf') throw new UserFacingError('Nur eine SIS im Entwurf kann bearbeitet werden.')

  const payload: Record<string, unknown> = {}
  if (params.assessmentDatum !== undefined) payload.assessment_datum = params.assessmentDatum
  if (params.assessmentTyp !== undefined) payload.assessment_typ = params.assessmentTyp
  if (params.eingangsfrage !== undefined) payload.eingangsfrage = params.eingangsfrage
  if (params.bemerkung !== undefined) payload.bemerkung = params.bemerkung
  if (Object.keys(payload).length === 0) return bestehend

  const { data, error } = await supabase
    .from('sis_assessments')
    .update(payload)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`SIS konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)
  return data as SisAssessment
}

/**
 * Schließt eine SIS ab. Voraussetzung: jedes relevante Themenfeld hat eine
 * fachliche Einschätzung, jede Risikomatrix-Zeile ist bewertet (nicht 'unklar').
 */
export async function abschliessenAssessment(
  supabase: SupabaseClient, id: string, organizationId: string, userId: string,
): Promise<SisAssessment> {
  const detail = await getAssessment(supabase, id, organizationId)
  if (!detail) throw new UserFacingError('SIS nicht gefunden.')
  validateSisUebergang(detail.status, 'abgeschlossen')

  const fehlend = relevanteThemenfelder(detail.versorgungsform).filter(nr => {
    const feld = detail.themenfelder.find(t => t.feld_nr === nr)
    return !feld?.einschaetzung_pflege?.trim()
  })
  if (fehlend.length > 0) {
    throw new UserFacingError(`Abschluss nicht möglich: fachliche Einschätzung fehlt in Themenfeld ${fehlend.join(', ')}.`)
  }

  const unbewertet = SIS_RISIKO_WERTE.filter(risiko => {
    const zeile = detail.risikomatrix.find(r => r.risiko === risiko)
    return !zeile || zeile.risiko_vorhanden === 'unklar'
  })
  if (unbewertet.length > 0) {
    throw new UserFacingError(`Abschluss nicht möglich: Risikomatrix unbewertet für ${unbewertet.join(', ')}.`)
  }

  const { data, error } = await supabase
    .from('sis_assessments')
    .update({ status: 'abgeschlossen', abgeschlossen_am: new Date().toISOString(), abgeschlossen_von: userId })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`SIS konnte nicht abgeschlossen werden: ${error?.message ?? 'unbekannt'}`)
  return data as SisAssessment
}

/** Öffnet eine abgeschlossene (nicht gesperrte) SIS wieder als Entwurf. */
export async function wiedereroeffnenAssessment(
  supabase: SupabaseClient, id: string, organizationId: string,
): Promise<SisAssessment> {
  const bestehend = await ladeKopfsatz(supabase, id, organizationId)
  validateSisUebergang(bestehend.status, 'entwurf')

  const { data, error } = await supabase
    .from('sis_assessments')
    .update({ status: 'entwurf', abgeschlossen_am: null, abgeschlossen_von: null })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`SIS konnte nicht wiedereröffnet werden: ${error?.message ?? 'unbekannt'}`)
  return data as SisAssessment
}

export async function sperreAssessment(supabase: SupabaseClient, id: string, organizationId: string): Promise<SisAssessment> {
  const bestehend = await ladeKopfsatz(supabase, id, organizationId)
  validateSisUebergang(bestehend.status, 'gesperrt')

  const { data, error } = await supabase
    .from('sis_assessments')
    .update({ status: 'gesperrt', gesperrt: true })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`SIS konnte nicht gesperrt werden: ${error?.message ?? 'unbekannt'}`)
  return data as SisAssessment
}

/** Interner Helfer: lädt den Kopfsatz oder wirft. */
export async function ladeKopfsatz(supabase: SupabaseClient, id: string, organizationId: string): Promise<SisAssessment> {
  const { data, error } = await supabase
    .from('sis_assessments')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`SIS konnte nicht geladen werden: ${error.message}`)
  if (!data) throw new UserFacingError('SIS nicht gefunden.')
  return data as SisAssessment
}
