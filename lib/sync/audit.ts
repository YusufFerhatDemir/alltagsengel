// ═══════════════════════════════════════════════════════════════
// Persistenz für sync_audit_log / sync_konflikte — Block 20.
// Nutzt ausschließlich den Admin-Client (service_role), da der
// Sync-Endpunkt org-übergreifend für den eingeloggten User schreibt
// und die Zeilen selbst der Beleg für RLS-Zwecke sind (nicht
// umgekehrt). Aufrufer setzt organization_id/user_id explizit.
// ═══════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import type { OfflineEntityTyp, KonfliktStrategie, KonfliktStatus } from '@/lib/offline/types'
import type { SyncAuditLogRow, SyncKonfliktRow } from './types'
import { logger } from '@/lib/logger'
const log = logger.child('sync/audit')

export interface SchreibeAuditParams {
  organizationId: string
  userId: string
  queueItemId: string
  idempotencyKey: string
  entityTyp: OfflineEntityTyp
  aktion: SyncAuditLogRow['aktion']
  details?: Record<string, unknown> | null
}

export async function schreibeSyncAudit(admin: SupabaseClient, params: SchreibeAuditParams): Promise<void> {
  const { error } = await admin.from('sync_audit_log').insert({
    organization_id: params.organizationId,
    user_id: params.userId,
    queue_item_id: params.queueItemId,
    idempotency_key: params.idempotencyKey,
    entity_typ: params.entityTyp,
    aktion: params.aktion,
    details: params.details ?? null,
  })
  if (error) {
    // Audit-Fehler dürfen den Sync selbst nicht blockieren — nur loggen.
    log.error('Konnte sync_audit_log nicht schreiben', { errorMessage: error.message })
  }
}

/**
 * Prüft, ob dieser idempotency_key innerhalb der Organisation bereits
 * erfolgreich synchronisiert wurde — Grundlage der Idempotenz des
 * Batch-Sync-Endpunkts (erneutes Senden desselben Queue-Items durch den
 * Client, z. B. nach einem Netzwerk-Timeout, führt die Aktion nicht
 * doppelt aus).
 */
export async function warBereitsErfolgreich(
  admin: SupabaseClient,
  organizationId: string,
  idempotencyKey: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from('sync_audit_log')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('idempotency_key', idempotencyKey)
    .eq('aktion', 'sync_success')
    .limit(1)
    .maybeSingle()

  if (error) {
    // NICHT `return false`: das hiesse "noch nicht synchronisiert" und
    // fuehrte die Aktion erneut aus. Bei append-only-Entitaeten (etwa
    // medikament_eingaben) entsteht dabei aus einem vorübergehenden
    // DB-Fehler ein doppelter Datensatz — eine doppelt dokumentierte
    // Medikamentengabe. Der Wurf landet im Fehlerzweig des Aufrufers, das
    // Item bleibt in der Queue und wird spaeter erneut versucht.
    log.error('Idempotency-Check fehlgeschlagen', { errorMessage: error.message })
    throw new Error(`Idempotenz-Pruefung fehlgeschlagen: ${error.message}`)
  }
  return !!data
}

export interface SchreibeKonfliktParams {
  organizationId: string
  userId: string
  queueItemId: string
  idempotencyKey: string
  entityTyp: OfflineEntityTyp
  entityId: string | null
  lokaleDaten: Record<string, unknown>
  serverDaten: Record<string, unknown> | null
  strategie: KonfliktStrategie
  status: KonfliktStatus
  aufgeloestMit: 'lokal' | 'server' | null
  aufgeloestVon?: string | null
}

export async function schreibeSyncKonflikt(admin: SupabaseClient, params: SchreibeKonfliktParams): Promise<SyncKonfliktRow | null> {
  const { data, error } = await admin
    .from('sync_konflikte')
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      queue_item_id: params.queueItemId,
      idempotency_key: params.idempotencyKey,
      entity_typ: params.entityTyp,
      entity_id: params.entityId,
      lokale_daten: params.lokaleDaten,
      server_daten: params.serverDaten,
      strategie: params.strategie,
      status: params.status,
      aufgeloest_mit: params.aufgeloestMit,
      aufgeloest_von: params.aufgeloestVon ?? (params.status === 'aufgeloest' ? params.userId : null),
      aufgeloest_am: params.status === 'aufgeloest' ? new Date().toISOString() : null,
    })
    .select()
    .single()

  if (error) {
    log.error('Konnte sync_konflikte nicht schreiben', { errorMessage: error.message })
    return null
  }
  return data as SyncKonfliktRow
}

export async function holeKonflikt(admin: SupabaseClient, id: string, organizationId: string): Promise<SyncKonfliktRow | null> {
  const { data, error } = await admin
    .from('sync_konflikte')
    .select('*')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as SyncKonfliktRow | null) ?? null
}

export async function listeOffeneKonflikte(admin: SupabaseClient, organizationId?: string): Promise<SyncKonfliktRow[]> {
  let query = admin.from('sync_konflikte').select('*').eq('status', 'offen').order('erstellt_am', { ascending: false })
  if (organizationId) query = query.eq('organization_id', organizationId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as SyncKonfliktRow[]
}

export async function loeseKonfliktAuf(
  admin: SupabaseClient,
  id: string,
  organizationId: string,
  update: { status: KonfliktStatus; aufgeloestMit: 'lokal' | 'server' | null; aufgeloestVon: string },
): Promise<SyncKonfliktRow> {
  const { data, error } = await admin
    .from('sync_konflikte')
    .update({
      status: update.status,
      aufgeloest_mit: update.aufgeloestMit,
      aufgeloest_von: update.aufgeloestVon,
      aufgeloest_am: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Konflikt nicht gefunden.')
  return data as SyncKonfliktRow
}
