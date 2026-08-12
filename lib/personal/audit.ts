import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuditEntitaetTyp, AuditAktion, PersonalAuditLog } from './types'

export interface WriteAuditParams {
  organizationId: string
  entitaetTyp: AuditEntitaetTyp
  entitaetId: string
  caregiverId?: string | null
  aktion: AuditAktion
  vorher?: Record<string, unknown> | null
  nachher?: Record<string, unknown> | null
  grund?: string | null
  benutzerId: string
  benutzerRolle?: string | null
}

export async function writeAuditLog(supabase: SupabaseClient, params: WriteAuditParams): Promise<void> {
  await supabase.from('personal_audit_log').insert({
    organization_id: params.organizationId,
    entitaet_typ: params.entitaetTyp,
    entitaet_id: params.entitaetId,
    caregiver_id: params.caregiverId ?? null,
    aktion: params.aktion,
    vorher: params.vorher ?? null,
    nachher: params.nachher ?? null,
    grund: params.grund ?? null,
    benutzer_id: params.benutzerId,
    benutzer_rolle: params.benutzerRolle ?? null,
  })
}

export interface ListAuditFilter {
  organizationId: string
  entitaetTyp?: AuditEntitaetTyp
  entitaetId?: string
  caregiverId?: string
  aktion?: AuditAktion
  limit?: number
}

export async function listAuditLog(supabase: SupabaseClient, filter: ListAuditFilter): Promise<PersonalAuditLog[]> {
  let query = supabase
    .from('personal_audit_log')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })

  if (filter.entitaetTyp) query = query.eq('entitaet_typ', filter.entitaetTyp)
  if (filter.entitaetId) query = query.eq('entitaet_id', filter.entitaetId)
  if (filter.caregiverId) query = query.eq('caregiver_id', filter.caregiverId)
  if (filter.aktion) query = query.eq('aktion', filter.aktion)
  if (filter.limit) query = query.limit(filter.limit)

  const { data, error } = await query
  if (error) throw new Error(`Audit-Log konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as PersonalAuditLog[]
}
