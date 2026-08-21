// ═══════════════════════════════════════════════════════════════
// Akten-Zugriffs-Audit — Append-only Logging in akten_zugriff_log
// ═══════════════════════════════════════════════════════════════
// Die Tabelle ist per DB-Trigger (prevent_modify_akten_audit) gegen
// UPDATE/DELETE geschützt. Dieses Modul erstellt ausschließlich Eintraege.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ZugriffAktion, ZugriffEntitaetTyp } from './types'
import { logger } from '@/lib/logger'
const log = logger.child('akten-zugriff-log')

export interface LogZugriffParams {
  entitaetTyp: ZugriffEntitaetTyp
  entitaetId: string
  aktion: ZugriffAktion
  benutzerId: string
  benutzerRolle?: string | null
  dokumentId?: string | null
  vertragId?: string | null
  details?: Record<string, unknown> | null
  organizationId: string
}

export async function logAktenZugriff(
  supabase: SupabaseClient,
  params: LogZugriffParams
): Promise<void> {
  const { error } = await supabase.from('akten_zugriff_log').insert({
    organization_id: params.organizationId,
    dokument_id: params.dokumentId ?? null,
    vertrag_id: params.vertragId ?? null,
    entitaet_typ: params.entitaetTyp,
    entitaet_id: params.entitaetId,
    aktion: params.aktion,
    benutzer_id: params.benutzerId,
    benutzer_rolle: params.benutzerRolle ?? null,
    details: params.details ?? null,
  })

  if (error) {
    log.errorWithException('Fehler beim Schreiben des Audit-Logs', error)
    throw new Error(`Zugriffs-Log konnte nicht geschrieben werden: ${error.message}`)
  }
}

export interface ZugriffLogFilter {
  organizationId: string
  entitaetTyp?: ZugriffEntitaetTyp
  entitaetId?: string
  benutzerId?: string
  von?: string
  bis?: string
  limit?: number
}

export async function listAktenZugriffLog(supabase: SupabaseClient, filter: ZugriffLogFilter) {
  let query = supabase
    .from('akten_zugriff_log')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })
    .limit(filter.limit ?? 200)

  if (filter.entitaetTyp) query = query.eq('entitaet_typ', filter.entitaetTyp)
  if (filter.entitaetId) query = query.eq('entitaet_id', filter.entitaetId)
  if (filter.benutzerId) query = query.eq('benutzer_id', filter.benutzerId)
  if (filter.von) query = query.gte('created_at', filter.von)
  if (filter.bis) query = query.lte('created_at', filter.bis)

  const { data, error } = await query
  if (error) throw new Error(`Zugriffs-Log konnte nicht geladen werden: ${error.message}`)
  return data ?? []
}
