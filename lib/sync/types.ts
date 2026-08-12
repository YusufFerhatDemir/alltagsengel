// ═══════════════════════════════════════════════════════════════
// Server-seitige Sync-Typen — Block 20
// ═══════════════════════════════════════════════════════════════
// Spiegeln die Tabellen sync_audit_log / sync_konflikte (Migration
// 20260828010000_sync_offline.sql). Getrennt von lib/offline/types.ts,
// weil dort die CLIENT-seitigen (IndexedDB, camelCase-frei, epoch-ms)
// Typen liegen — hier sind es DB-Zeilen (timestamptz als ISO-String).
// ═══════════════════════════════════════════════════════════════

import type { OfflineEntityTyp, KonfliktStrategie, KonfliktStatus } from '@/lib/offline/types'

export type SyncErgebnisStatus = 'synced' | 'error' | 'conflict_resolved' | 'conflict_pending' | 'skipped_idempotent' | 'unsupported'

export interface SyncItemErgebnis {
  queue_item_id: string
  idempotency_key: string
  entity_typ: OfflineEntityTyp
  status: SyncErgebnisStatus
  message: string
  konflikt_id?: string
}

export interface SyncBatchAntwort {
  ergebnisse: SyncItemErgebnis[]
  zusammenfassung: {
    erfolg: number
    fehler: number
    konflikte: number
    uebersprungen: number
  }
}

export interface SyncAuditLogRow {
  id: string
  organization_id: string
  user_id: string
  queue_item_id: string
  idempotency_key: string
  entity_typ: OfflineEntityTyp
  aktion: 'sync_start' | 'sync_success' | 'sync_error' | 'conflict_detected' | 'conflict_resolved' | 'retry'
  details: Record<string, unknown> | null
  erstellt_am: string
}

export interface SyncKonfliktRow {
  id: string
  organization_id: string
  user_id: string
  queue_item_id: string
  idempotency_key: string
  entity_typ: OfflineEntityTyp
  entity_id: string | null
  lokale_daten: Record<string, unknown>
  server_daten: Record<string, unknown> | null
  strategie: KonfliktStrategie
  status: KonfliktStatus
  aufgeloest_mit: 'lokal' | 'server' | null
  aufgeloest_von: string | null
  aufgeloest_am: string | null
  erstellt_am: string
}
