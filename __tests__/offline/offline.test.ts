import { describe, it, expect } from 'vitest'
import {
  validiereEntityTyp,
  validiereSyncStatus,
  validiereQueueItem,
  OFFLINE_ENTITY_TYPEN,
  SYNC_STATUS_WERTE,
  DEFAULT_OFFLINE_CONFIG,
} from '@/lib/offline/types'
import type { OfflineQueueItem, SyncZustand } from '@/lib/offline/types'

// ── Entity-Typ-Validierung ───────────────────────────────────────

describe('validiereEntityTyp', () => {
  it('akzeptiert alle gültigen Typen', () => {
    for (const t of OFFLINE_ENTITY_TYPEN) {
      expect(() => validiereEntityTyp(t)).not.toThrow()
    }
  })

  it('wirft bei ungültigem Typ', () => {
    expect(() => validiereEntityTyp('ungueltig')).toThrow('Ungültiger Entity-Typ')
  })

  it('wirft bei leerem String', () => {
    expect(() => validiereEntityTyp('')).toThrow('Ungültiger Entity-Typ')
  })
})

// ── Sync-Status-Validierung ──────────────────────────────────────

describe('validiereSyncStatus', () => {
  it('akzeptiert alle gültigen Status', () => {
    for (const s of SYNC_STATUS_WERTE) {
      expect(() => validiereSyncStatus(s)).not.toThrow()
    }
  })

  it('wirft bei ungültigem Status', () => {
    expect(() => validiereSyncStatus('xyz')).toThrow('Ungültiger Sync-Status')
  })
})

// ── Queue-Item-Validierung ───────────────────────────────────────

describe('validiereQueueItem', () => {
  const basis: Partial<OfflineQueueItem> = {
    idempotency_key: 'key-001',
    entity_typ: 'leistungsnachweis',
    aktion: 'create',
    endpoint: '/api/leistungsnachweise',
    payload: { client_id: 'c1', beschreibung: 'Test' },
    user_id: 'u1',
    organization_id: 'org1',
  }

  it('akzeptiert vollständiges Item', () => {
    expect(() => validiereQueueItem(basis)).not.toThrow()
  })

  it('wirft bei fehlendem Idempotency-Key', () => {
    expect(() => validiereQueueItem({ ...basis, idempotency_key: '' })).toThrow('Idempotency-Key')
  })

  it('wirft bei fehlendem Entity-Typ', () => {
    expect(() => validiereQueueItem({ ...basis, entity_typ: undefined })).toThrow('Entity-Typ')
  })

  it('wirft bei ungültigem Entity-Typ', () => {
    expect(() => validiereQueueItem({ ...basis, entity_typ: 'xyz' as any })).toThrow('Ungültiger Entity-Typ')
  })

  it('wirft bei fehlendem Endpoint', () => {
    expect(() => validiereQueueItem({ ...basis, endpoint: '' })).toThrow('Endpoint')
  })

  it('wirft bei fehlendem Payload', () => {
    expect(() => validiereQueueItem({ ...basis, payload: undefined })).toThrow('Payload')
  })

  it('wirft bei fehlender User-ID', () => {
    expect(() => validiereQueueItem({ ...basis, user_id: '' })).toThrow('User-ID')
  })

  it('wirft bei fehlender Organization-ID', () => {
    expect(() => validiereQueueItem({ ...basis, organization_id: '' })).toThrow('Organization-ID')
  })
})

// ── Default-Config ───────────────────────────────────────────────

describe('DEFAULT_OFFLINE_CONFIG', () => {
  it('hat sinnvolle Defaults', () => {
    expect(DEFAULT_OFFLINE_CONFIG.max_retries).toBe(5)
    expect(DEFAULT_OFFLINE_CONFIG.retry_backoff_ms).toBe(2000)
    expect(DEFAULT_OFFLINE_CONFIG.max_queue_size).toBe(1000)
    expect(DEFAULT_OFFLINE_CONFIG.sync_intervall_ms).toBe(30_000)
    expect(DEFAULT_OFFLINE_CONFIG.batch_size).toBe(10)
    expect(DEFAULT_OFFLINE_CONFIG.konflikt_strategie).toBe('last_write_wins')
  })

  it('hat Encryption-Key-Name', () => {
    expect(DEFAULT_OFFLINE_CONFIG.encryption_key_name).toBe('alltagsengel_offline_key')
  })
})

// ── Entity-Typen vollständig ─────────────────────────────────────

describe('OFFLINE_ENTITY_TYPEN', () => {
  it('enthält alle erwarteten Typen', () => {
    expect(OFFLINE_ENTITY_TYPEN).toContain('leistungsnachweis')
    expect(OFFLINE_ENTITY_TYPEN).toContain('pflegebericht')
    expect(OFFLINE_ENTITY_TYPEN).toContain('signatur')
    expect(OFFLINE_ENTITY_TYPEN).toContain('medikament_eingabe')
    expect(OFFLINE_ENTITY_TYPEN).toContain('vitalwerte')
    expect(OFFLINE_ENTITY_TYPEN).toContain('wunddoku')
  })

  // Block 20: Erweiterung auf alle Pflegedoku-Module aus lib/pflege/
  // (Anamnesen, Aufnahmen, Diagnosen, Maßnahmen, Maßnahmenpläne, Risiken).
  it('enthält die Block-20-Pflegedoku-Erweiterung', () => {
    expect(OFFLINE_ENTITY_TYPEN).toContain('pflege_anamnese')
    expect(OFFLINE_ENTITY_TYPEN).toContain('pflege_aufnahme')
    expect(OFFLINE_ENTITY_TYPEN).toContain('pflege_diagnose')
    expect(OFFLINE_ENTITY_TYPEN).toContain('pflege_massnahme')
    expect(OFFLINE_ENTITY_TYPEN).toContain('pflege_massnahmenplan')
    expect(OFFLINE_ENTITY_TYPEN).toContain('pflege_risiko')
  })

  it('hat 12 Typen (6 ursprüngliche + 6 aus Block 20)', () => {
    expect(OFFLINE_ENTITY_TYPEN).toHaveLength(12)
  })

  it('validiereEntityTyp akzeptiert die neuen Pflegedoku-Typen', () => {
    expect(() => validiereEntityTyp('pflege_massnahmenplan')).not.toThrow()
    expect(() => validiereEntityTyp('pflege_risiko')).not.toThrow()
  })
})

// ── Sync-Zustand-Typen ──────────────────────────────────────────

describe('SyncZustand-Typ-Sicherheit', () => {
  it('SyncZustand hat die richtige Struktur', () => {
    const zustand: SyncZustand = {
      status: 'pending',
      pending_count: 3,
      syncing_count: 1,
      error_count: 0,
      letzter_sync: null,
      ist_online: true,
    }

    expect(zustand.status).toBe('pending')
    expect(zustand.pending_count).toBe(3)
    expect(zustand.syncing_count).toBe(1)
    expect(zustand.error_count).toBe(0)
    expect(zustand.letzter_sync).toBeNull()
    expect(zustand.ist_online).toBe(true)
  })

  it('SyncZustand akzeptiert alle Status', () => {
    for (const s of SYNC_STATUS_WERTE) {
      const z: SyncZustand = {
        status: s,
        pending_count: 0,
        syncing_count: 0,
        error_count: 0,
        letzter_sync: Date.now(),
        ist_online: false,
      }
      expect(z.status).toBe(s)
    }
  })
})

// ── Idempotency-Key-Generierung ──────────────────────────────────

describe('Idempotency-Key-Regeln', () => {
  it('verschiedene Keys sollten unterschiedlich sein', () => {
    const key1 = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const key2 = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    expect(key1).not.toBe(key2)
  })

  it('Key-Format ist valide', () => {
    const key = `leistung-c1-${Date.now()}`
    expect(typeof key).toBe('string')
    expect(key.length).toBeGreaterThan(0)
  })
})

// ── Konfliktstrategie ────────────────────────────────────────────

describe('Konfliktstrategien', () => {
  it('Last-Write-Wins ist Standard', () => {
    expect(DEFAULT_OFFLINE_CONFIG.konflikt_strategie).toBe('last_write_wins')
  })

  it('alle Strategien sind typsicher', () => {
    const strategien: Array<'last_write_wins' | 'server_wins' | 'manuell'> = [
      'last_write_wins', 'server_wins', 'manuell',
    ]
    expect(strategien).toHaveLength(3)
  })
})

// ── Retry-Backoff ────────────────────────────────────────────────

describe('Retry-Backoff-Berechnung', () => {
  const base = DEFAULT_OFFLINE_CONFIG.retry_backoff_ms

  it('exponentieller Backoff', () => {
    expect(base * Math.pow(2, 0)).toBe(2000)
    expect(base * Math.pow(2, 1)).toBe(4000)
    expect(base * Math.pow(2, 2)).toBe(8000)
    expect(base * Math.pow(2, 3)).toBe(16000)
    expect(base * Math.pow(2, 4)).toBe(32000)
  })

  it('maximaler Backoff nach max_retries Versuchen', () => {
    const maxBackoff = base * Math.pow(2, DEFAULT_OFFLINE_CONFIG.max_retries - 1)
    expect(maxBackoff).toBe(32000)
  })
})

// ── Offline-Speicher: Verschlüsselung ist fail-closed (Delta Phase 4) ──
//
// Vorher gaben encrypt()/decrypt() die Daten bei fehlendem Schlüssel
// unverändert zurück, während encryptItem() den Eintrag trotzdem mit
// `_isEncrypted: true` beschriftete. Ergebnis: Pflegedaten (Art. 9 DSGVO)
// lagen im Klartext auf dem Gerät und galten in jeder Prüfung als
// verschlüsselt. Ohne Schlüssel darf jetzt nichts gespeichert werden.

describe('OfflineStore — fail-closed ohne Schlüssel', () => {
  it('speichert keinen Queue-Eintrag, solange init() nicht lief', async () => {
    const { OfflineStore } = await import('@/lib/offline/offline-store')
    const store = new OfflineStore('ae_test_key')

    const eintrag = {
      id: 'q-1',
      entity_typ: 'pflegebericht',
      status: 'pending',
      idempotency_key: 'idem-1',
      payload: { text: 'Blutdruck 130/85, Patient wirkt müde' },
    } as any

    await expect(store.saveQueueItem(eintrag)).rejects.toThrow(/ohne Schlüssel/)
  })
})
