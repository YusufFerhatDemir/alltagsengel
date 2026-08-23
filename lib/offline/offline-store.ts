import type {
  OfflineQueueItem,
  KonfliktLogEintrag,
  SyncAuditLogEintrag,
  SyncStatus,
} from './types'

const DB_NAME = 'alltagsengel_offline'
// v2: Store 'keys' ergänzt — der AES-Schlüssel liegt nicht mehr im
// localStorage, sondern als non-extractable CryptoKey hier. Siehe
// getOrCreateKey().
const DB_VERSION = 2
const STORE_QUEUE = 'queue'
const STORE_CONFLICTS = 'conflicts'
const STORE_AUDIT = 'audit'
const STORE_KEYS = 'keys'

export class OfflineStore {
  private db: IDBDatabase | null = null
  private encryptionKeyName: string
  private cryptoKey: CryptoKey | null = null

  constructor(encryptionKeyName: string) {
    this.encryptionKeyName = encryptionKeyName
  }

  async init(): Promise<void> {
    this.db = await this.openDB()
    this.cryptoKey = await this.getOrCreateKey()
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          const qs = db.createObjectStore(STORE_QUEUE, { keyPath: 'id' })
          qs.createIndex('status', 'status', { unique: false })
          qs.createIndex('idempotency_key', 'idempotency_key', { unique: true })
          qs.createIndex('entity_typ', 'entity_typ', { unique: false })
        }
        if (!db.objectStoreNames.contains(STORE_CONFLICTS)) {
          const cs = db.createObjectStore(STORE_CONFLICTS, { keyPath: 'id' })
          cs.createIndex('queue_item_id', 'queue_item_id', { unique: false })
          cs.createIndex('status', 'status', { unique: false })
        }
        if (!db.objectStoreNames.contains(STORE_AUDIT)) {
          const as_ = db.createObjectStore(STORE_AUDIT, { keyPath: 'id' })
          as_.createIndex('queue_item_id', 'queue_item_id', { unique: false })
        }
        if (!db.objectStoreNames.contains(STORE_KEYS)) {
          db.createObjectStore(STORE_KEYS, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  // ── Verschlüsselung ──────────────────────────────────────────

  /**
   * Schlüssel holen oder anlegen.
   *
   * Der Schlüssel liegt als NICHT-exportierbarer CryptoKey in der IndexedDB,
   * nicht mehr als Base64-String im localStorage. Vorher wurde er mit
   * `generateKey(…, true, …)` exportierbar erzeugt, per exportKey ausgelesen
   * und im Klartext neben das Chiffrat gelegt — Schloss und Schlüssel im
   * selben Fach. Jedes Skript im Seitenkontext konnte beides einsammeln.
   *
   * Ein CryptoKey übersteht den Structured Clone der IndexedDB; als
   * non-extractable erzeugt, gibt ihn danach auch die Web-Crypto-API nicht
   * mehr als Bytes heraus. Ver- und Entschlüsseln geht weiter, Auslesen nicht.
   *
   * Ein bereits vorhandener localStorage-Schlüssel wird einmalig übernommen
   * und dort gelöscht — sonst wären die bisher abgelegten Einträge nicht mehr
   * lesbar.
   */
  private async getOrCreateKey(): Promise<CryptoKey> {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      throw new Error('Web Crypto API nicht verfügbar.')
    }

    const ausIdb = await this.get(STORE_KEYS, this.encryptionKeyName)
    if (ausIdb?.key) return ausIdb.key as CryptoKey

    // Einmalige Übernahme des Altschlüssels aus dem localStorage.
    const alt = localStorage.getItem(this.encryptionKeyName)
    if (alt) {
      const raw = Uint8Array.from(atob(alt), c => c.charCodeAt(0))
      const uebernommen = await crypto.subtle.importKey(
        'raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'],
      )
      await this.put(STORE_KEYS, { id: this.encryptionKeyName, key: uebernommen })
      localStorage.removeItem(this.encryptionKeyName)
      return uebernommen
    }

    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false, // nicht exportierbar
      ['encrypt', 'decrypt'],
    )
    await this.put(STORE_KEYS, { id: this.encryptionKeyName, key })
    return key
  }

  private async encrypt(data: string): Promise<string> {
    // FAIL-CLOSED. Vorher stand hier `if (!this.cryptoKey) return data` — die
    // Daten gingen dann im KLARTEXT in die IndexedDB, wurden von encryptItem()
    // aber trotzdem mit `_isEncrypted: true` beschriftet. Das Ergebnis war
    // schlimmer als gar keine Verschlüsselung: unverschlüsselte Pflegedaten
    // (Art. 9 DSGVO) auf dem Endgerät, die bei jeder Prüfung als verschlüsselt
    // gezählt worden wären. Ohne Schlüssel wird jetzt nicht gespeichert.
    if (!this.cryptoKey) {
      throw new Error(
        'Offline-Speicher ohne Schlüssel — es werden keine Pflegedaten abgelegt. ' +
        'init() muss vor dem ersten Schreibzugriff erfolgreich gelaufen sein.',
      )
    }
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoded = new TextEncoder().encode(data)
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.cryptoKey, encoded)
    const combined = new Uint8Array(iv.length + new Uint8Array(cipher).length)
    combined.set(iv)
    combined.set(new Uint8Array(cipher), iv.length)
    return btoa(String.fromCharCode(...combined))
  }

  private async decrypt(data: string): Promise<string> {
    // Gegenstück zu encrypt(): ohne Schlüssel wird nicht geraten, dass das
    // Chiffrat vielleicht Klartext ist, sondern abgebrochen.
    if (!this.cryptoKey) {
      throw new Error('Offline-Speicher ohne Schlüssel — Daten nicht lesbar.')
    }
    const combined = Uint8Array.from(atob(data), c => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const cipher = combined.slice(12)
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, this.cryptoKey, cipher)
    return new TextDecoder().decode(plain)
  }

  private async encryptItem<T extends object>(item: T): Promise<T> {
    const json = JSON.stringify(item)
    const encrypted = await this.encrypt(json)
    const indexed = item as T & Record<string, unknown>
    return {
      id: indexed.id,
      status: indexed.status,
      idempotency_key: indexed.idempotency_key,
      entity_typ: indexed.entity_typ,
      _encrypted: encrypted,
      _isEncrypted: true,
    } as T
  }

  private async decryptItem<T>(item: any): Promise<T> {
    if (item._isEncrypted && item._encrypted) {
      const json = await this.decrypt(item._encrypted)
      return JSON.parse(json) as T
    }
    return item as T
  }

  // ── Queue-Operationen ──────────────────────────────────────────

  async saveQueueItem(item: OfflineQueueItem): Promise<void> {
    const encrypted = await this.encryptItem(item)
    await this.put(STORE_QUEUE, encrypted)
  }

  async getQueueItem(id: string): Promise<OfflineQueueItem | null> {
    const raw = await this.get(STORE_QUEUE, id)
    if (!raw) return null
    return this.decryptItem<OfflineQueueItem>(raw)
  }

  async getByIdempotencyKey(key: string): Promise<OfflineQueueItem | null> {
    const raw = await this.getByIndex(STORE_QUEUE, 'idempotency_key', key)
    if (!raw) return null
    return this.decryptItem<OfflineQueueItem>(raw)
  }

  async getAllQueueItems(): Promise<OfflineQueueItem[]> {
    const items = await this.getAll(STORE_QUEUE)
    return Promise.all(items.map(i => this.decryptItem<OfflineQueueItem>(i)))
  }

  async getQueueItemsByStatus(status: SyncStatus): Promise<OfflineQueueItem[]> {
    const all = await this.getAllQueueItems()
    return all.filter(i => i.status === status)
  }

  async updateQueueItem(id: string, updates: Partial<OfflineQueueItem>): Promise<void> {
    const existing = await this.getQueueItem(id)
    if (!existing) return
    const updated = { ...existing, ...updates }
    await this.saveQueueItem(updated)
  }

  async updateQueueItemStatus(id: string, status: SyncStatus): Promise<void> {
    await this.updateQueueItem(id, { status })
  }

  async deleteQueueItem(id: string): Promise<void> {
    await this.delete(STORE_QUEUE, id)
  }

  async getQueueCount(): Promise<number> {
    return this.count(STORE_QUEUE)
  }

  // ── Konflikte ──────────────────────────────────────────────────

  async saveConflict(konflikt: KonfliktLogEintrag): Promise<void> {
    await this.put(STORE_CONFLICTS, konflikt)
  }

  async getAllConflicts(): Promise<KonfliktLogEintrag[]> {
    return this.getAll(STORE_CONFLICTS)
  }

  async updateConflict(id: string, updates: Partial<KonfliktLogEintrag>): Promise<void> {
    const existing = await this.get(STORE_CONFLICTS, id)
    if (!existing) return
    await this.put(STORE_CONFLICTS, { ...existing, ...updates })
  }

  // ── Audit-Log ──────────────────────────────────────────────────

  async saveAuditLog(entry: SyncAuditLogEintrag): Promise<void> {
    await this.put(STORE_AUDIT, entry)
  }

  async getAuditLog(queueItemId?: string): Promise<SyncAuditLogEintrag[]> {
    if (queueItemId) {
      return this.getAllByIndex(STORE_AUDIT, 'queue_item_id', queueItemId)
    }
    return this.getAll(STORE_AUDIT)
  }

  // ── IndexedDB-Helfer ──────────────────────────────────────────

  private put(store: string, value: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(store, 'readwrite')
      tx.objectStore(store).put(value)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  private get(store: string, key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(store, 'readonly')
      const req = tx.objectStore(store).get(key)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  }

  private getByIndex(store: string, index: string, key: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(store, 'readonly')
      const req = tx.objectStore(store).index(index).get(key)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  }

  private getAll(store: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(store, 'readonly')
      const req = tx.objectStore(store).getAll()
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  }

  private getAllByIndex(store: string, index: string, key: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(store, 'readonly')
      const req = tx.objectStore(store).index(index).getAll(key)
      req.onsuccess = () => resolve(req.result || [])
      req.onerror = () => reject(req.error)
    })
  }

  private delete(store: string, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(store, 'readwrite')
      tx.objectStore(store).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  private count(store: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(store, 'readonly')
      const req = tx.objectStore(store).count()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
}
