// ═══════════════════════════════════════════════════════════════
// Mobile/Offline — geteilte Typen
// Client-seitige Offline-Queue mit Sync, Verschlüsselung,
// Konfliktauflösung und Idempotency.
// ═══════════════════════════════════════════════════════════════

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error'

export const SYNC_STATUS_WERTE: SyncStatus[] = ['pending', 'syncing', 'synced', 'error']

export type OfflineEntityTyp =
  | 'leistungsnachweis' | 'pflegebericht' | 'signatur'
  | 'medikament_eingabe' | 'vitalwerte' | 'wunddoku'

export const OFFLINE_ENTITY_TYPEN: OfflineEntityTyp[] = [
  'leistungsnachweis', 'pflegebericht', 'signatur',
  'medikament_eingabe', 'vitalwerte', 'wunddoku',
]

export type KonfliktStrategie = 'last_write_wins' | 'server_wins' | 'manuell'

export type KonfliktStatus = 'offen' | 'aufgeloest' | 'verworfen'

export interface OfflineQueueItem {
  id: string
  idempotency_key: string
  entity_typ: OfflineEntityTyp
  aktion: 'create' | 'update' | 'delete'
  endpoint: string
  payload: Record<string, unknown>
  status: SyncStatus
  retry_count: number
  max_retries: number
  naechster_retry: number | null
  fehler_nachricht: string | null
  erstellt_am: number
  zuletzt_versucht: number | null
  synchronisiert_am: number | null
  user_id: string
  organization_id: string
}

export interface KonfliktLogEintrag {
  id: string
  queue_item_id: string
  entity_typ: OfflineEntityTyp
  entity_id: string | null
  lokale_daten: Record<string, unknown>
  server_daten: Record<string, unknown> | null
  strategie: KonfliktStrategie
  status: KonfliktStatus
  aufgeloest_mit: 'lokal' | 'server' | null
  aufgeloest_am: number | null
  erstellt_am: number
}

export interface SyncAuditLogEintrag {
  id: string
  queue_item_id: string
  entity_typ: OfflineEntityTyp
  aktion: 'sync_start' | 'sync_success' | 'sync_error' | 'conflict_detected' | 'conflict_resolved' | 'retry'
  details: Record<string, unknown> | null
  erstellt_am: number
}

export interface SyncZustand {
  status: SyncStatus
  pending_count: number
  syncing_count: number
  error_count: number
  letzter_sync: number | null
  ist_online: boolean
}

export interface OfflineConfig {
  max_retries: number
  retry_backoff_ms: number
  max_queue_size: number
  encryption_key_name: string
  konflikt_strategie: KonfliktStrategie
  sync_intervall_ms: number
  batch_size: number
}

export const DEFAULT_OFFLINE_CONFIG: OfflineConfig = {
  max_retries: 5,
  retry_backoff_ms: 2000,
  max_queue_size: 1000,
  encryption_key_name: 'alltagsengel_offline_key',
  konflikt_strategie: 'last_write_wins',
  sync_intervall_ms: 30_000,
  batch_size: 10,
}

// ── Validierung ──────────────────────────────────────────────────

export function validiereEntityTyp(t: string): asserts t is OfflineEntityTyp {
  if (!OFFLINE_ENTITY_TYPEN.includes(t as OfflineEntityTyp)) {
    throw new Error(`Ungültiger Entity-Typ: ${t}`)
  }
}

export function validiereSyncStatus(s: string): asserts s is SyncStatus {
  if (!SYNC_STATUS_WERTE.includes(s as SyncStatus)) {
    throw new Error(`Ungültiger Sync-Status: ${s}`)
  }
}

export function validiereQueueItem(item: Partial<OfflineQueueItem>): void {
  if (!item.idempotency_key || typeof item.idempotency_key !== 'string') {
    throw new Error('Idempotency-Key ist ein Pflichtfeld.')
  }
  if (!item.entity_typ) {
    throw new Error('Entity-Typ ist ein Pflichtfeld.')
  }
  validiereEntityTyp(item.entity_typ)
  if (!item.endpoint || typeof item.endpoint !== 'string') {
    throw new Error('Endpoint ist ein Pflichtfeld.')
  }
  if (!item.payload || typeof item.payload !== 'object') {
    throw new Error('Payload ist ein Pflichtfeld.')
  }
  if (!item.user_id || typeof item.user_id !== 'string') {
    throw new Error('User-ID ist ein Pflichtfeld.')
  }
  if (!item.organization_id || typeof item.organization_id !== 'string') {
    throw new Error('Organization-ID ist ein Pflichtfeld.')
  }
}
