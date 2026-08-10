import type {
  OfflineQueueItem,
  KonfliktLogEintrag,
  SyncAuditLogEintrag,
  SyncZustand,
  OfflineConfig,
  OfflineEntityTyp,
  SyncStatus,
  KonfliktStrategie,
} from './types'
import { DEFAULT_OFFLINE_CONFIG, validiereQueueItem } from './types'
import { OfflineStore } from './offline-store'

export class OfflineQueue {
  private store: OfflineStore
  private config: OfflineConfig
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private isSyncing = false
  private onlineListener: (() => void) | null = null
  private offlineListener: (() => void) | null = null
  private statusCallbacks: Set<(zustand: SyncZustand) => void> = new Set()

  constructor(config: Partial<OfflineConfig> = {}) {
    this.config = { ...DEFAULT_OFFLINE_CONFIG, ...config }
    this.store = new OfflineStore(this.config.encryption_key_name)
  }

  async init(): Promise<void> {
    await this.store.init()
    this.setupNetworkListeners()
  }

  destroy(): void {
    this.stopAutoSync()
    this.removeNetworkListeners()
    this.statusCallbacks.clear()
  }

  // ── Queue-Operationen ──────────────────────────────────────────

  async enqueue(
    item: Omit<OfflineQueueItem, 'id' | 'status' | 'retry_count' | 'naechster_retry' | 'fehler_nachricht' | 'erstellt_am' | 'zuletzt_versucht' | 'synchronisiert_am'>,
  ): Promise<OfflineQueueItem> {
    const existing = await this.store.getByIdempotencyKey(item.idempotency_key)
    if (existing) return existing

    const vollstaendig: OfflineQueueItem = {
      ...item,
      id: generateId(),
      status: 'pending',
      retry_count: 0,
      max_retries: this.config.max_retries,
      naechster_retry: null,
      fehler_nachricht: null,
      erstellt_am: Date.now(),
      zuletzt_versucht: null,
      synchronisiert_am: null,
    }

    validiereQueueItem(vollstaendig)

    const count = await this.store.getQueueCount()
    if (count >= this.config.max_queue_size) {
      throw new Error(`Offline-Queue ist voll (max. ${this.config.max_queue_size} Einträge).`)
    }

    await this.store.saveQueueItem(vollstaendig)

    await this.logAudit({
      id: generateId(),
      queue_item_id: vollstaendig.id,
      entity_typ: vollstaendig.entity_typ,
      aktion: 'sync_start',
      details: { endpoint: vollstaendig.endpoint, aktion: vollstaendig.aktion },
      erstellt_am: Date.now(),
    })

    this.notifyStatusChange()
    return vollstaendig
  }

  async getQueue(): Promise<OfflineQueueItem[]> {
    return this.store.getAllQueueItems()
  }

  async getPendingItems(): Promise<OfflineQueueItem[]> {
    return this.store.getQueueItemsByStatus('pending')
  }

  async getErrorItems(): Promise<OfflineQueueItem[]> {
    return this.store.getQueueItemsByStatus('error')
  }

  async removeItem(id: string): Promise<void> {
    await this.store.deleteQueueItem(id)
    this.notifyStatusChange()
  }

  async clearSynced(): Promise<number> {
    const synced = await this.store.getQueueItemsByStatus('synced')
    for (const item of synced) {
      await this.store.deleteQueueItem(item.id)
    }
    this.notifyStatusChange()
    return synced.length
  }

  // ── Sync ──────────────────────────────────────────────────────

  async syncAll(fetchFn: typeof fetch = globalThis.fetch): Promise<{
    erfolg: number
    fehler: number
    konflikte: number
  }> {
    if (this.isSyncing) return { erfolg: 0, fehler: 0, konflikte: 0 }
    if (!this.isOnline()) return { erfolg: 0, fehler: 0, konflikte: 0 }

    this.isSyncing = true
    let erfolg = 0
    let fehler = 0
    let konflikte = 0

    try {
      const pending = await this.store.getQueueItemsByStatus('pending')
      const retryable = (await this.store.getQueueItemsByStatus('error'))
        .filter(i => i.retry_count < i.max_retries && (!i.naechster_retry || i.naechster_retry <= Date.now()))

      const items = [...pending, ...retryable].slice(0, this.config.batch_size)

      for (const item of items) {
        try {
          await this.store.updateQueueItemStatus(item.id, 'syncing')
          this.notifyStatusChange()

          const response = await fetchFn(item.endpoint, {
            method: item.aktion === 'delete' ? 'DELETE' : item.aktion === 'update' ? 'PUT' : 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': item.idempotency_key,
            },
            body: JSON.stringify(item.payload),
          })

          if (response.ok) {
            await this.store.updateQueueItem(item.id, {
              status: 'synced',
              synchronisiert_am: Date.now(),
              zuletzt_versucht: Date.now(),
            })
            await this.logAudit({
              id: generateId(),
              queue_item_id: item.id,
              entity_typ: item.entity_typ,
              aktion: 'sync_success',
              details: { status_code: response.status },
              erstellt_am: Date.now(),
            })
            erfolg++
          } else if (response.status === 409) {
            const serverData = await response.json().catch(() => null)
            await this.handleConflict(item, serverData)
            konflikte++
          } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          const retryCount = item.retry_count + 1
          const backoff = this.config.retry_backoff_ms * Math.pow(2, retryCount - 1)

          await this.store.updateQueueItem(item.id, {
            status: 'error',
            retry_count: retryCount,
            fehler_nachricht: msg,
            zuletzt_versucht: Date.now(),
            naechster_retry: retryCount < item.max_retries ? Date.now() + backoff : null,
          })
          await this.logAudit({
            id: generateId(),
            queue_item_id: item.id,
            entity_typ: item.entity_typ,
            aktion: retryCount < item.max_retries ? 'retry' : 'sync_error',
            details: { fehler: msg, versuch: retryCount },
            erstellt_am: Date.now(),
          })
          fehler++
        }
      }
    } finally {
      this.isSyncing = false
      this.notifyStatusChange()
    }

    return { erfolg, fehler, konflikte }
  }

  // ── Konflikte ──────────────────────────────────────────────────

  private async handleConflict(
    item: OfflineQueueItem,
    serverData: Record<string, unknown> | null,
  ): Promise<void> {
    const konflikt: KonfliktLogEintrag = {
      id: generateId(),
      queue_item_id: item.id,
      entity_typ: item.entity_typ,
      entity_id: (item.payload as any)?.id || null,
      lokale_daten: item.payload,
      server_daten: serverData,
      strategie: this.config.konflikt_strategie,
      status: 'offen',
      aufgeloest_mit: null,
      aufgeloest_am: null,
      erstellt_am: Date.now(),
    }

    if (this.config.konflikt_strategie === 'last_write_wins') {
      konflikt.status = 'aufgeloest'
      konflikt.aufgeloest_mit = 'lokal'
      konflikt.aufgeloest_am = Date.now()

      await this.store.updateQueueItem(item.id, {
        status: 'pending',
        retry_count: item.retry_count + 1,
      })
    } else if (this.config.konflikt_strategie === 'server_wins') {
      konflikt.status = 'aufgeloest'
      konflikt.aufgeloest_mit = 'server'
      konflikt.aufgeloest_am = Date.now()

      await this.store.updateQueueItem(item.id, {
        status: 'synced',
        synchronisiert_am: Date.now(),
      })
    } else {
      await this.store.updateQueueItem(item.id, {
        status: 'conflict',
        zuletzt_versucht: Date.now(),
      })
    }

    await this.store.saveConflict(konflikt)
    await this.logAudit({
      id: generateId(),
      queue_item_id: item.id,
      entity_typ: item.entity_typ,
      aktion: 'conflict_detected',
      details: {
        strategie: this.config.konflikt_strategie,
        aufgeloest: konflikt.status === 'aufgeloest',
      },
      erstellt_am: Date.now(),
    })
  }

  async getConflicts(): Promise<KonfliktLogEintrag[]> {
    return this.store.getAllConflicts()
  }

  async resolveConflict(
    conflictId: string,
    resolution: 'lokal' | 'server',
  ): Promise<void> {
    await this.store.updateConflict(conflictId, {
      status: 'aufgeloest',
      aufgeloest_mit: resolution,
      aufgeloest_am: Date.now(),
    })
    await this.logAudit({
      id: generateId(),
      queue_item_id: conflictId,
      entity_typ: 'leistungsnachweis',
      aktion: 'conflict_resolved',
      details: { resolution },
      erstellt_am: Date.now(),
    })
  }

  // ── Status ────────────────────────────────────────────────────

  async getZustand(): Promise<SyncZustand> {
    const items = await this.store.getAllQueueItems()
    const pending = items.filter(i => i.status === 'pending').length
    const syncing = items.filter(i => i.status === 'syncing').length
    const errors = items.filter(i => i.status === 'error').length
    const lastSync = items
      .filter(i => i.synchronisiert_am)
      .reduce((max, i) => Math.max(max, i.synchronisiert_am!), 0)

    let status: SyncStatus = 'synced'
    if (errors > 0) status = 'error'
    if (syncing > 0) status = 'syncing'
    if (pending > 0) status = 'pending'

    return {
      status,
      pending_count: pending,
      syncing_count: syncing,
      error_count: errors,
      letzter_sync: lastSync || null,
      ist_online: this.isOnline(),
    }
  }

  onStatusChange(callback: (zustand: SyncZustand) => void): () => void {
    this.statusCallbacks.add(callback)
    return () => this.statusCallbacks.delete(callback)
  }

  private async notifyStatusChange(): Promise<void> {
    const zustand = await this.getZustand()
    for (const cb of this.statusCallbacks) {
      try { cb(zustand) } catch {}
    }
  }

  // ── Auto-Sync ──────────────────────────────────────────────────

  startAutoSync(fetchFn: typeof fetch = globalThis.fetch): void {
    if (this.syncTimer) return
    this.syncTimer = setInterval(() => {
      if (this.isOnline()) this.syncAll(fetchFn)
    }, this.config.sync_intervall_ms)
  }

  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
  }

  // ── Netzwerk ──────────────────────────────────────────────────

  isOnline(): boolean {
    if (typeof navigator === 'undefined') return true
    return navigator.onLine
  }

  private setupNetworkListeners(): void {
    if (typeof window === 'undefined') return
    this.onlineListener = () => {
      this.syncAll()
      this.notifyStatusChange()
    }
    this.offlineListener = () => this.notifyStatusChange()
    window.addEventListener('online', this.onlineListener)
    window.addEventListener('offline', this.offlineListener)
  }

  private removeNetworkListeners(): void {
    if (typeof window === 'undefined') return
    if (this.onlineListener) window.removeEventListener('online', this.onlineListener)
    if (this.offlineListener) window.removeEventListener('offline', this.offlineListener)
  }

  // ── Audit-Log ──────────────────────────────────────────────────

  private async logAudit(entry: SyncAuditLogEintrag): Promise<void> {
    await this.store.saveAuditLog(entry)
  }

  async getAuditLog(queueItemId?: string): Promise<SyncAuditLogEintrag[]> {
    return this.store.getAuditLog(queueItemId)
  }
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}
