import { UserFacingError } from '@/lib/api/user-facing-error'
// ═══════════════════════════════════════════════════════════════
// Diagnosen / Einschränkungen / Hinweise — pflege_diagnosen
// Soft-Delete über aktiv=false (die Tabelle hat kein deleted_at).
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logPflegeAktivitaet } from './audit-log'
import {
  assertErlaubt,
  DIAGNOSE_SCHWEREGRAD_WERTE,
  DIAGNOSE_TYP_WERTE,
  type DiagnoseSchweregrad,
  type DiagnoseTyp,
  type PflegeDiagnose,
} from './types'
import { logger } from '@/lib/logger'
const log = logger.child('pflege-audit')

export interface CreateDiagnoseParams {
  organizationId: string
  clientId: string
  diagnoseTyp?: DiagnoseTyp
  bezeichnung: string
  icdCode?: string | null
  beschreibung?: string | null
  diagnostiziertAm?: string | null
  diagnostiziertVon?: string | null
  schweregrad?: DiagnoseSchweregrad | null
  betreuungsrelevant?: boolean
  hinweisFuerEngel?: string | null
  erstelltVon: string
}

export async function createDiagnose(supabase: SupabaseClient, params: CreateDiagnoseParams): Promise<PflegeDiagnose> {
  if (!params.bezeichnung?.trim()) throw new UserFacingError('Bezeichnung ist ein Pflichtfeld.')
  assertErlaubt(params.diagnoseTyp, DIAGNOSE_TYP_WERTE, 'diagnose_typ')
  assertErlaubt(params.schweregrad, DIAGNOSE_SCHWEREGRAD_WERTE, 'schweregrad')

  const { data, error } = await supabase
    .from('pflege_diagnosen')
    .insert({
      organization_id: params.organizationId,
      client_id: params.clientId,
      diagnose_typ: params.diagnoseTyp ?? 'diagnose',
      bezeichnung: params.bezeichnung.trim(),
      icd_code: params.icdCode ?? null,
      beschreibung: params.beschreibung ?? null,
      diagnostiziert_am: params.diagnostiziertAm ?? null,
      diagnostiziert_von: params.diagnostiziertVon ?? null,
      schweregrad: params.schweregrad ?? null,
      betreuungsrelevant: params.betreuungsrelevant ?? true,
      hinweis_fuer_engel: params.hinweisFuerEngel ?? null,
      erstellt_von: params.erstelltVon,
    })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Diagnose konnte nicht angelegt werden: ${error?.message ?? 'unbekannt'}`)

  await logPflegeAktivitaet(supabase, {
    organizationId: (data as PflegeDiagnose).organization_id,
    entitaetTyp: 'diagnose',
    entitaetId: (data as PflegeDiagnose).id,
    aktion: 'erstellt',
    nachher: data,
    akteurId: params.erstelltVon,
  }).catch((err) => log.errorWithException('Diagnose-Log fehlgeschlagen', err))

  return data as PflegeDiagnose
}

export interface ListDiagnosenFilter {
  organizationId: string
  clientId?: string
  diagnoseTyp?: DiagnoseTyp
  nurAktive?: boolean
  nurBetreuungsrelevante?: boolean
}

export async function listDiagnosen(supabase: SupabaseClient, filter: ListDiagnosenFilter): Promise<PflegeDiagnose[]> {
  let query = supabase
    .from('pflege_diagnosen')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })

  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.diagnoseTyp) query = query.eq('diagnose_typ', filter.diagnoseTyp)
  if (filter.nurAktive) query = query.eq('aktiv', true)
  if (filter.nurBetreuungsrelevante) query = query.eq('betreuungsrelevant', true)

  const { data, error } = await query
  if (error) throw new Error(`Diagnosen konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as PflegeDiagnose[]
}

export async function getDiagnose(supabase: SupabaseClient, id: string, organizationId: string): Promise<PflegeDiagnose | null> {
  const { data, error } = await supabase
    .from('pflege_diagnosen')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(`Diagnose konnte nicht geladen werden: ${error.message}`)
  return data as PflegeDiagnose | null
}

export interface UpdateDiagnoseParams {
  diagnoseTyp?: DiagnoseTyp
  bezeichnung?: string
  icdCode?: string | null
  beschreibung?: string | null
  diagnostiziertAm?: string | null
  diagnostiziertVon?: string | null
  schweregrad?: DiagnoseSchweregrad | null
  aktiv?: boolean
  betreuungsrelevant?: boolean
  hinweisFuerEngel?: string | null
}

export async function updateDiagnose(
  supabase: SupabaseClient,
  id: string,
  organizationId: string,
  patch: UpdateDiagnoseParams
): Promise<PflegeDiagnose> {
  assertErlaubt(patch.diagnoseTyp, DIAGNOSE_TYP_WERTE, 'diagnose_typ')
  assertErlaubt(patch.schweregrad, DIAGNOSE_SCHWEREGRAD_WERTE, 'schweregrad')
  if (patch.bezeichnung !== undefined && !patch.bezeichnung.trim()) {
    throw new UserFacingError('Bezeichnung darf nicht leer sein.')
  }

  const update: Record<string, unknown> = {}
  if (patch.diagnoseTyp !== undefined) update.diagnose_typ = patch.diagnoseTyp
  if (patch.bezeichnung !== undefined) update.bezeichnung = patch.bezeichnung.trim()
  if (patch.icdCode !== undefined) update.icd_code = patch.icdCode
  if (patch.beschreibung !== undefined) update.beschreibung = patch.beschreibung
  if (patch.diagnostiziertAm !== undefined) update.diagnostiziert_am = patch.diagnostiziertAm
  if (patch.diagnostiziertVon !== undefined) update.diagnostiziert_von = patch.diagnostiziertVon
  if (patch.schweregrad !== undefined) update.schweregrad = patch.schweregrad
  if (patch.aktiv !== undefined) update.aktiv = patch.aktiv
  if (patch.betreuungsrelevant !== undefined) update.betreuungsrelevant = patch.betreuungsrelevant
  if (patch.hinweisFuerEngel !== undefined) update.hinweis_fuer_engel = patch.hinweisFuerEngel

  if (Object.keys(update).length === 0) throw new UserFacingError('Keine Änderungen übergeben.')

  const { data, error } = await supabase
    .from('pflege_diagnosen')
    .update(update)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Diagnose konnte nicht aktualisiert werden: ${error?.message ?? 'unbekannt'}`)

  await logPflegeAktivitaet(supabase, {
    organizationId,
    entitaetTyp: 'diagnose',
    entitaetId: id,
    aktion: patch.aktiv === false ? 'geloescht' : 'aktualisiert',
    nachher: data,
  }).catch((err) => log.errorWithException('Diagnose-Log fehlgeschlagen', err))

  return data as PflegeDiagnose
}

/** Soft-Delete: Diagnose bleibt für die Historie erhalten, wird aber inaktiv. */
export async function deaktiviereDiagnose(
  supabase: SupabaseClient,
  id: string,
  organizationId: string
): Promise<PflegeDiagnose> {
  return updateDiagnose(supabase, id, organizationId, { aktiv: false })
}
