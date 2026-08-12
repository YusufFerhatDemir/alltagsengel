import type { SupabaseClient } from '@supabase/supabase-js'
import type { WfAuditLogEintrag, ListWfAuditFilter } from './types'

export async function listAudit(
  supabase: SupabaseClient,
  filter: ListWfAuditFilter,
): Promise<WfAuditLogEintrag[]> {
  let query = supabase
    .from('wf_audit_log')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })

  if (filter.typ) query = query.eq('typ', filter.typ)
  if (filter.entitaetTyp) query = query.eq('entitaet_typ', filter.entitaetTyp)
  if (filter.entitaetId) query = query.eq('entitaet_id', filter.entitaetId)
  if (filter.limit) query = query.limit(filter.limit)
  if (filter.offset) query = query.range(filter.offset, filter.offset + (filter.limit ?? 50) - 1)

  const { data, error } = await query
  if (error) throw new Error(`Audit-Log konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as WfAuditLogEintrag[]
}
