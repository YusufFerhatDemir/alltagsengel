import { UserFacingError } from '@/lib/api/user-facing-error'
// ═══════════════════════════════════════════════════════════════
// SIS-Risikomatrix — sis_risikomatrix
// Upsert je (assessment_id, risiko); nur solange der Kopfsatz
// im Entwurf ist.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { ladeKopfsatz } from './assessments'
import {
  assertSisWert,
  SIS_RISIKO_VORHANDEN_WERTE,
  SIS_RISIKO_WERTE,
  type SisRisiko,
  type SisRisikoVorhanden,
  type SisRisikoZeile,
} from './types'

export interface UpsertRisikoParams {
  organizationId: string
  assessmentId: string
  risiko: SisRisiko
  risikoVorhanden?: SisRisikoVorhanden
  weitereEinschaetzung?: boolean
  bemerkung?: string | null
}

export async function upsertRisiko(supabase: SupabaseClient, params: UpsertRisikoParams): Promise<SisRisikoZeile> {
  assertSisWert(params.risiko, SIS_RISIKO_WERTE, 'risiko')
  assertSisWert(params.risikoVorhanden, SIS_RISIKO_VORHANDEN_WERTE, 'risiko_vorhanden')

  const kopf = await ladeKopfsatz(supabase, params.assessmentId, params.organizationId)
  if (kopf.gesperrt) throw new UserFacingError('Informationssammlung ist gesperrt — Änderung nicht möglich.')
  if (kopf.status !== 'entwurf') throw new UserFacingError('Die Risikomatrix kann nur im Entwurf bearbeitet werden.')

  const payload: Record<string, unknown> = {
    organization_id: params.organizationId,
    assessment_id: params.assessmentId,
    risiko: params.risiko,
  }
  if (params.risikoVorhanden !== undefined) payload.risiko_vorhanden = params.risikoVorhanden
  if (params.weitereEinschaetzung !== undefined) payload.weitere_einschaetzung = params.weitereEinschaetzung
  if (params.bemerkung !== undefined) payload.bemerkung = params.bemerkung

  const { data, error } = await supabase
    .from('sis_risikomatrix')
    .upsert(payload, { onConflict: 'assessment_id,risiko' })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Risikoeinschätzung konnte nicht gespeichert werden: ${error?.message ?? 'unbekannt'}`)
  return data as SisRisikoZeile
}
