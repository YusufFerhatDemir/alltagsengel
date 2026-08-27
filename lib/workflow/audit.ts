import type { SupabaseClient } from '@supabase/supabase-js'
import type { WfAuditLogEintrag, ListWfAuditFilter } from './types'
import { WF_AUDIT_TYP_WERTE } from './types'
import { pruefeEnum, pruefeLimit, pruefeOffset, STANDARD_LIMIT } from './validierung'

export async function listAudit(
  supabase: SupabaseClient,
  filter: ListWfAuditFilter,
): Promise<WfAuditLogEintrag[]> {
  const typ = pruefeEnum(filter.typ, WF_AUDIT_TYP_WERTE, 'typ')
  const limit = pruefeLimit(filter.limit)
  const offset = pruefeOffset(filter.offset)

  let query = supabase
    .from('wf_audit_log')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })

  if (typ) query = query.eq('typ', typ)
  if (filter.entitaetTyp) query = query.eq('entitaet_typ', filter.entitaetTyp)
  if (filter.entitaetId) query = query.eq('entitaet_id', filter.entitaetId)
  if (limit) query = query.limit(limit)
  if (offset) query = query.range(offset, offset + (limit ?? STANDARD_LIMIT) - 1)

  const { data, error } = await query
  if (error) throw new Error(`Audit-Log konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as WfAuditLogEintrag[]
}
