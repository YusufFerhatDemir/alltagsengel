import type { KimClient, KimAuditLogEntry } from './types'
import { logger } from '@/lib/logger'
const log = logger.child('kim-audit')

export type KimAuditAktion =
  | 'erstellt'
  | 'bearbeitet'
  | 'gesendet'
  | 'sendefehler'
  | 'zugestellt'
  | 'gelesen'
  | 'storniert'
  | 'wiederholt'
  | 'empfangen'
  | 'anhang_hochgeladen'
  | 'anhang_heruntergeladen'
  | 'adresse_angelegt'
  | 'adresse_geaendert'
  | 'adresse_verifiziert'
  | 'provider_konfiguriert'
  // Eingehender Anhang bei der Pruefung verworfen (Migration 20261010000006).
  | 'anhang_abgewiesen'

export interface WriteKimAuditParams {
  organizationId: string
  aktion: KimAuditAktion
  messageId?: string | null
  actorId?: string | null
  details?: Record<string, unknown>
}

/**
 * Protokolliert eine KIM-Aktion. Fail-soft nach demselben Muster wie
 * lib/audit-log.ts: ein Logging-Fehler darf die eigentliche Aktion
 * (Nachricht senden, Anhang hochladen, …) nicht blockieren.
 */
export async function writeKimAuditLog(supabase: KimClient, params: WriteKimAuditParams): Promise<void> {
  const { error } = await supabase.from('kim_audit_log').insert({
    organization_id: params.organizationId,
    message_id: params.messageId ?? null,
    aktion: params.aktion,
    actor_id: params.actorId ?? null,
    details: params.details ?? {},
  })
  if (error) {
    log.error('Insert fehlgeschlagen', { errorMessage: error.message, aktion: params.aktion, messageId: params.messageId })
  }
}

export interface ListKimAuditFilter {
  organizationId: string
  messageId?: string
  aktion?: KimAuditAktion
  limit?: number
}

export async function listKimAuditLog(supabase: KimClient, filter: ListKimAuditFilter): Promise<KimAuditLogEntry[]> {
  let query = supabase
    .from('kim_audit_log')
    .select('*')
    .eq('organization_id', filter.organizationId)
    .order('created_at', { ascending: false })

  if (filter.messageId) query = query.eq('message_id', filter.messageId)
  if (filter.aktion) query = query.eq('aktion', filter.aktion)
  query = query.limit(filter.limit ?? 200)

  const { data, error } = await query
  if (error) throw new Error(`KIM-Audit-Log konnte nicht geladen werden: ${error.message}`)
  return (data ?? []) as KimAuditLogEntry[]
}
