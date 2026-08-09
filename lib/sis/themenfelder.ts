// ═══════════════════════════════════════════════════════════════
// SIS-Themenfelder — sis_themenfelder
// Upsert je (assessment_id, feld_nr); nur solange der Kopfsatz
// im Entwurf ist. Feld 6 (Haushaltsführung) nur ambulant.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { ladeKopfsatz } from './assessments'
import { relevanteThemenfelder, SIS_THEMENFELDER, type SisThemenfeld } from './types'

export interface UpsertThemenfeldParams {
  organizationId: string
  assessmentId: string
  feldNr: number
  sichtKlient?: string | null
  einschaetzungPflege?: string | null
  handlungsbedarf?: boolean | null
  bemerkung?: string | null
}

export async function upsertThemenfeld(supabase: SupabaseClient, params: UpsertThemenfeldParams): Promise<SisThemenfeld> {
  if (!Number.isInteger(params.feldNr) || params.feldNr < 1 || params.feldNr > 6) {
    throw new Error('feld_nr muss zwischen 1 und 6 liegen.')
  }

  const kopf = await ladeKopfsatz(supabase, params.assessmentId, params.organizationId)
  if (kopf.gesperrt) throw new Error('Informationssammlung ist gesperrt — Änderung nicht möglich.')
  if (kopf.status !== 'entwurf') throw new Error('Themenfelder können nur im Entwurf bearbeitet werden.')

  if (!relevanteThemenfelder(kopf.versorgungsform).includes(params.feldNr)) {
    const titel = SIS_THEMENFELDER.find(t => t.nr === params.feldNr)?.titel ?? `Feld ${params.feldNr}`
    throw new Error(`Themenfeld ${params.feldNr} (${titel}) ist bei Versorgungsform "${kopf.versorgungsform}" nicht vorgesehen.`)
  }

  const payload: Record<string, unknown> = {
    organization_id: params.organizationId,
    assessment_id: params.assessmentId,
    feld_nr: params.feldNr,
  }
  if (params.sichtKlient !== undefined) payload.sicht_klient = params.sichtKlient
  if (params.einschaetzungPflege !== undefined) payload.einschaetzung_pflege = params.einschaetzungPflege
  if (params.handlungsbedarf !== undefined) payload.handlungsbedarf = params.handlungsbedarf
  if (params.bemerkung !== undefined) payload.bemerkung = params.bemerkung

  const { data, error } = await supabase
    .from('sis_themenfelder')
    .upsert(payload, { onConflict: 'assessment_id,feld_nr' })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Themenfeld konnte nicht gespeichert werden: ${error?.message ?? 'unbekannt'}`)
  return data as SisThemenfeld
}
