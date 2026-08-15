// ═══════════════════════════════════════════════════════════════
// Pflegedoku-Audit — pflege_audit_log
// Änderungshistorie für medizinische Dokumentation (Aufnahme, Anamnese,
// Diagnosen, Risiken, Verlauf, Maßnahmen/-pläne). Append-only — die
// Tabelle ist per DB-Trigger gegen UPDATE/DELETE geschützt
// (supabase/migrations/20260921040000_pflege_audit_log.sql).
// Signatur-Stil 1:1 wie lib/ops/aktivitaetslog.ts (logAktivitaet).
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PflegeAuditAktion, PflegeAuditEntitaetTyp, PflegeAuditLogEintrag } from './types'

export async function logPflegeAktivitaet(
  supabase: SupabaseClient,
  params: {
    organizationId: string
    entitaetTyp: PflegeAuditEntitaetTyp
    entitaetId: string
    aktion: PflegeAuditAktion
    vorher?: object | null
    nachher?: object | null
    akteurId?: string | null
    ipAdresse?: string | null
  },
): Promise<PflegeAuditLogEintrag> {
  const { data, error } = await supabase
    .from('pflege_audit_log')
    .insert({
      organization_id: params.organizationId,
      entitaet_typ: params.entitaetTyp,
      entitaet_id: params.entitaetId,
      aktion: params.aktion,
      vorher: params.vorher ?? null,
      nachher: params.nachher ?? null,
      akteur_id: params.akteurId ?? null,
      ip_adresse: params.ipAdresse ?? null,
    })
    .select('*')
    .single()
  if (error || !data) {
    throw new Error(`Pflegedoku-Aktivität konnte nicht protokolliert werden: ${error?.message ?? 'unbekannt'}`)
  }
  return data as PflegeAuditLogEintrag
}

export interface ListPflegeAuditLogFilter {
  organizationId: string
  entitaetTyp?: PflegeAuditEntitaetTyp
  entitaetId?: string
  akteurId?: string
  limit?: number
  offset?: number
}

export async function listPflegeAuditLog(
  supabase: SupabaseClient,
  filter: ListPflegeAuditLogFilter,
): Promise<PflegeAuditLogEintrag[]> {
  let query = supabase
    .from('pflege_audit_log')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('erstellt_am', { ascending: false })

  if (filter.entitaetTyp) query = query.eq('entitaet_typ', filter.entitaetTyp)
  if (filter.entitaetId) query = query.eq('entitaet_id', filter.entitaetId)
  if (filter.akteurId) query = query.eq('akteur_id', filter.akteurId)
  if (filter.limit) query = query.limit(filter.limit)
  if (filter.offset) query = query.range(filter.offset, filter.offset + (filter.limit ?? 50) - 1)

  const { data, error } = await query
  if (error) throw new Error(`Pflegedoku-Audit-Log konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as PflegeAuditLogEintrag[]
}
