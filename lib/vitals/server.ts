import { UserFacingError } from '@/lib/api/user-facing-error'
// ═══════════════════════════════════════════════════════════════
// Vitalwerte — Datenzugriff (CRUD auf vital_signs / vital_sign_thresholds)
//
// Braucht einen SupabaseClient und (für updateVital) lib/audit-log, das
// wiederum lib/supabase/admin.ts importiert (service_role, `server-only`).
// Deshalb strikt getrennt von ./vitals — jene Datei bleibt client-sicher
// und wird u. a. von VitalChart.tsx und admin/vitalwerte/[clientId]
// importiert. Server-Only-Aufrufer (API-Routes) importieren von hier.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { logAuditEvent } from '@/lib/audit-log'
import { VITAL_TYPEN, assertVitalTyp, type Grenzwerte, type VitalSign, type VitalSignThreshold, type VitalTyp } from './types'
import { validierePlausibilitaet, validiereGrenzwerte } from './vitals'

// ── CRUD: vital_signs ────────────────────────────────────────────

export interface ListVitalsFilter {
  organizationId: string
  clientId?: string
  typ?: VitalTyp
  vonDatum?: string
  bisDatum?: string
  limit?: number
}

export async function listVitals(supabase: SupabaseClient, filter: ListVitalsFilter): Promise<VitalSign[]> {
  let query = supabase
    .from('vital_signs')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('measured_at', { ascending: false })
    .limit(Math.min(filter.limit ?? 500, 2000))

  if (filter.clientId) query = query.eq('client_id', filter.clientId)
  if (filter.typ) query = query.eq('type', filter.typ)
  if (filter.vonDatum) query = query.gte('measured_at', filter.vonDatum)
  if (filter.bisDatum) query = query.lte('measured_at', filter.bisDatum)

  const { data, error } = await query
  if (error) throw new Error(`Vitalwerte konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as VitalSign[]
}

export interface CreateVitalParams {
  /**
   * Weglassen, wenn mit einem user-scoped Client geschrieben wird (Engel):
   * dann füllt der Spalten-Default current_org_id() die Organisation, und RLS
   * (engel_vital_signs_insert) entscheidet über die Berechtigung.
   */
  organizationId?: string
  clientId: string
  typ: VitalTyp
  wert: number
  wertSekundaer?: number | null
  gemessenAm?: string
  gemessenVon: string
  gemessenVonName: string
  gemessenVonRolle: string
  notizen?: string | null
}

export async function createVital(supabase: SupabaseClient, params: CreateVitalParams): Promise<VitalSign> {
  assertVitalTyp(params.typ)
  validierePlausibilitaet(params.typ, params.wert, params.wertSekundaer)
  const cfg = VITAL_TYPEN[params.typ]

  const { data, error } = await supabase
    .from('vital_signs')
    .insert({
      ...(params.organizationId ? { organization_id: params.organizationId } : {}),
      client_id: params.clientId,
      type: params.typ,
      value: params.wert,
      value_secondary: cfg.hatSekundaer ? params.wertSekundaer : null,
      unit: cfg.einheit,
      measured_at: params.gemessenAm ?? new Date().toISOString(),
      measured_by: params.gemessenVon,
      measured_by_name: params.gemessenVonName,
      measured_by_role: params.gemessenVonRolle,
      notes: params.notizen?.trim() || null,
    })
    .select()
    .single()

  if (error) throw new Error(`Vitalwert konnte nicht gespeichert werden: ${error.message}`)
  return data as VitalSign
}

export interface UpdateVitalParams {
  wert?: number
  wertSekundaer?: number | null
  gemessenAm?: string
  notizen?: string | null
  actorId?: string
}

export async function updateVital(
  supabase: SupabaseClient, id: string, organizationId: string, params: UpdateVitalParams,
): Promise<VitalSign> {
  const { data: bestehend, error: ladeFehler } = await supabase
    .from('vital_signs')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .single()
  if (ladeFehler || !bestehend) throw new UserFacingError('Vitalwert nicht gefunden.')

  const existing = bestehend as VitalSign
  const typ = existing.type
  const neuerWert = params.wert ?? Number(existing.value)
  const neuerSekundaer = params.wertSekundaer !== undefined
    ? params.wertSekundaer
    : existing.value_secondary != null ? Number(existing.value_secondary) : null
  validierePlausibilitaet(typ, neuerWert, neuerSekundaer)

  const oldValues = {
    value: existing.value,
    value_secondary: existing.value_secondary,
    measured_at: existing.measured_at,
    notes: existing.notes,
  }
  const newValues = {
    value: neuerWert,
    value_secondary: neuerSekundaer,
    measured_at: params.gemessenAm ?? existing.measured_at,
    notes: params.notizen !== undefined ? (params.notizen?.trim() || null) : existing.notes,
  }

  await logAuditEvent({
    action: 'update',
    actorId: params.actorId ?? existing.measured_by,
    organizationId,
    entityType: 'vital_sign',
    entityId: id,
    details: { old_value: oldValues, new_value: newValues, type: typ },
  })

  const { data, error } = await supabase
    .from('vital_signs')
    .update({
      value: neuerWert,
      value_secondary: neuerSekundaer,
      ...(params.gemessenAm ? { measured_at: params.gemessenAm } : {}),
      ...(params.notizen !== undefined ? { notes: params.notizen?.trim() || null } : {}),
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single()

  if (error) throw new Error(`Vitalwert konnte nicht aktualisiert werden: ${error.message}`)
  return data as VitalSign
}

export async function deleteVital(supabase: SupabaseClient, id: string, organizationId: string): Promise<void> {
  const { error, count } = await supabase
    .from('vital_signs')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(`Vitalwert konnte nicht gelöscht werden: ${error.message}`)
  if (!count) throw new UserFacingError('Vitalwert nicht gefunden.')
}

// ── CRUD: vital_sign_thresholds ──────────────────────────────────

export async function listThresholds(
  supabase: SupabaseClient, organizationId: string, clientId?: string,
): Promise<VitalSignThreshold[]> {
  let query = supabase
    .from('vital_sign_thresholds')
    .select('*')
    .eq('organization_id', organizationId)
  if (clientId) query = query.eq('client_id', clientId)
  const { data, error } = await query
  if (error) throw new Error(`Grenzwerte konnten nicht geladen werden: ${error.message}`)
  return (data ?? []) as VitalSignThreshold[]
}

export interface UpsertThresholdParams extends Grenzwerte {
  organizationId: string
  clientId: string
  typ: VitalTyp
  enabled?: boolean
  notizen?: string | null
  erstelltVon: string
}

export async function upsertThreshold(supabase: SupabaseClient, params: UpsertThresholdParams): Promise<VitalSignThreshold> {
  assertVitalTyp(params.typ)
  validiereGrenzwerte(params.typ, params)

  const { data, error } = await supabase
    .from('vital_sign_thresholds')
    .upsert({
      organization_id: params.organizationId,
      client_id: params.clientId,
      type: params.typ,
      min_warn: params.min_warn,
      max_warn: params.max_warn,
      min_critical: params.min_critical,
      max_critical: params.max_critical,
      min_warn_secondary: params.min_warn_secondary ?? null,
      max_warn_secondary: params.max_warn_secondary ?? null,
      min_critical_secondary: params.min_critical_secondary ?? null,
      max_critical_secondary: params.max_critical_secondary ?? null,
      enabled: params.enabled ?? true,
      notes: params.notizen?.trim() || null,
      created_by: params.erstelltVon,
    }, { onConflict: 'client_id,type' })
    .select()
    .single()

  if (error) throw new Error(`Grenzwert konnte nicht gespeichert werden: ${error.message}`)
  return data as VitalSignThreshold
}

export async function deleteThreshold(supabase: SupabaseClient, id: string, organizationId: string): Promise<void> {
  const { error, count } = await supabase
    .from('vital_sign_thresholds')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('organization_id', organizationId)
  if (error) throw new Error(`Grenzwert konnte nicht gelöscht werden: ${error.message}`)
  if (!count) throw new UserFacingError('Grenzwert nicht gefunden.')
}
