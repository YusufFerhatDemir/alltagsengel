import { describe, it, expect } from 'vitest'
import { OFFLINE_ENTITY_TYPEN } from '@/lib/offline/types'
import {
  SYNC_ENTITY_REGISTRY,
  resolveSyncRoute,
  extrahiereEntityId,
} from '@/lib/sync/entity-registry'
import {
  hatKonflikt,
  entscheideKonflikt,
  entscheideManuelleAufloesung,
} from '@/lib/sync/conflict'

/** Entity-IDs sind ueberall uuids — die Registry prueft das inzwischen. */
const TEST_ID = '77777777-7777-4777-8777-777777777777'

// ── Entity-Registry ──────────────────────────────────────────────

describe('SYNC_ENTITY_REGISTRY', () => {
  it('hat für jeden Offline-Entity-Typ einen Registry-Eintrag', () => {
    for (const typ of OFFLINE_ENTITY_TYPEN) {
      expect(SYNC_ENTITY_REGISTRY[typ]).toBeDefined()
      expect(SYNC_ENTITY_REGISTRY[typ].tabelle).toBeTruthy()
      expect(SYNC_ENTITY_REGISTRY[typ].updatedAtSpalte).toBe('updated_at')
    }
  })
})

describe('resolveSyncRoute', () => {
  it('liefert POST-Endpunkt für create (pflegebericht)', () => {
    const route = resolveSyncRoute(SYNC_ENTITY_REGISTRY.pflegebericht, 'create')
    expect(route).toEqual({ endpoint: '/api/pflege/verlauf', methode: 'POST' })
  })

  it('liefert PATCH-Endpunkt mit eingesetzter ID für update (pflege_risiko)', () => {
    const route = resolveSyncRoute(SYNC_ENTITY_REGISTRY.pflege_risiko, 'update', TEST_ID)
    expect(route).toEqual({ endpoint: `/api/pflege/risiken/${TEST_ID}`, methode: 'PATCH' })
  })

  it('liefert DELETE-Endpunkt mit eingesetzter ID für delete (vitalwerte)', () => {
    const route = resolveSyncRoute(SYNC_ENTITY_REGISTRY.vitalwerte, 'delete', TEST_ID)
    expect(route).toEqual({ endpoint: `/api/vitals/${TEST_ID}`, methode: 'DELETE' })
  })

  it('gibt null zurück, wenn die ID keine UUID ist', () => {
    // Die ID kommt aus payload.id des Geraets. Ein Wert wie
    // '../../admin/organizations' wuerde von new URL() in lib/sync/apply.ts
    // zu einem ganz anderen Endpunkt normalisiert.
    expect(resolveSyncRoute(SYNC_ENTITY_REGISTRY.pflege_risiko, 'update', 'risk-1')).toBeNull()
    expect(resolveSyncRoute(SYNC_ENTITY_REGISTRY.vitalwerte, 'delete', '../../admin/organizations')).toBeNull()
  })

  it('gibt null zurück, wenn create nicht unterstützt wird (leistungsnachweis)', () => {
    const route = resolveSyncRoute(SYNC_ENTITY_REGISTRY.leistungsnachweis, 'create')
    expect(route).toBeNull()
  })

  it('gibt null zurück, wenn update-ID fehlt, aber die Vorlage eine ID braucht', () => {
    const route = resolveSyncRoute(SYNC_ENTITY_REGISTRY.pflege_risiko, 'update')
    expect(route).toBeNull()
  })

  it('gibt null zurück, wenn delete nicht unterstützt wird (pflegebericht)', () => {
    const route = resolveSyncRoute(SYNC_ENTITY_REGISTRY.pflegebericht, 'delete', TEST_ID)
    expect(route).toBeNull()
  })

  it('medikament_eingabe: create unterstützt, update nicht (append-only)', () => {
    expect(resolveSyncRoute(SYNC_ENTITY_REGISTRY.medikament_eingabe, 'create')).toEqual({
      endpoint: '/api/medikamente/eingaben',
      methode: 'POST',
    })
    expect(resolveSyncRoute(SYNC_ENTITY_REGISTRY.medikament_eingabe, 'update', TEST_ID)).toBeNull()
  })
})

describe('extrahiereEntityId', () => {
  it('liefert die ID, wenn vorhanden und eine UUID ist', () => {
    expect(extrahiereEntityId({ id: TEST_ID, name: 'x' })).toBe(TEST_ID)
  })

  it('liefert null, wenn die ID keine UUID ist', () => {
    expect(extrahiereEntityId({ id: 'abc-123' })).toBeNull()
  })

  it('liefert null, wenn keine ID im Payload ist', () => {
    expect(extrahiereEntityId({ name: 'x' })).toBeNull()
  })

  it('liefert null, wenn die ID kein String ist', () => {
    expect(extrahiereEntityId({ id: 42 })).toBeNull()
  })

  it('liefert null bei leerem String', () => {
    expect(extrahiereEntityId({ id: '' })).toBeNull()
  })
})

// ── Konfliktlösung ────────────────────────────────────────────────

describe('hatKonflikt', () => {
  it('kein Konflikt ohne Basis-Snapshot (basisUpdatedAt fehlt)', () => {
    expect(hatKonflikt({ serverUpdatedAt: '2026-08-12T10:00:00Z', basisUpdatedAt: undefined })).toBe(false)
  })

  it('kein Konflikt, wenn Zeitstempel identisch sind', () => {
    expect(hatKonflikt({ serverUpdatedAt: '2026-08-12T10:00:00Z', basisUpdatedAt: '2026-08-12T10:00:00Z' })).toBe(false)
  })

  it('Konflikt, wenn Server-Stand sich seit dem Snapshot geändert hat', () => {
    expect(hatKonflikt({ serverUpdatedAt: '2026-08-12T11:00:00Z', basisUpdatedAt: '2026-08-12T10:00:00Z' })).toBe(true)
  })

  it('KONFLIKT, wenn der Client eine Basis behauptet, aber kein Server-Stand ermittelt werden konnte', () => {
    // Frueher galt das als konfliktfrei und die lokale Aenderung wurde
    // angewendet. Genau dieser Zweig greift, wenn die Zeile nicht gefunden
    // wurde, die Abfrage fehlschlug oder updated_at NULL ist — und in allen
    // dreien konnten Server-Daten still ueberschrieben werden. Jetzt
    // fail-closed: im Zweifel ist es ein Konflikt.
    expect(hatKonflikt({ serverUpdatedAt: null, basisUpdatedAt: '2026-08-12T10:00:00Z' })).toBe(true)
  })
})

describe('entscheideKonflikt', () => {
  it('last_write_wins: lokale Änderung gewinnt, Konflikt gilt als aufgelöst', () => {
    expect(entscheideKonflikt('last_write_wins')).toEqual({
      wendeLokaleAenderungAn: true, status: 'aufgeloest', aufgeloestMit: 'lokal',
    })
  })

  it('server_wins: lokale Änderung wird verworfen, Konflikt gilt als aufgelöst', () => {
    expect(entscheideKonflikt('server_wins')).toEqual({
      wendeLokaleAenderungAn: false, status: 'aufgeloest', aufgeloestMit: 'server',
    })
  })

  it('manuell: keine automatische Entscheidung, Konflikt bleibt offen', () => {
    expect(entscheideKonflikt('manuell')).toEqual({
      wendeLokaleAenderungAn: false, status: 'offen', aufgeloestMit: null,
    })
  })
})

describe('entscheideManuelleAufloesung', () => {
  it("'lokal' wendet die lokale Änderung nachträglich an", () => {
    expect(entscheideManuelleAufloesung('lokal')).toEqual({
      wendeLokaleAenderungAn: true, status: 'aufgeloest', aufgeloestMit: 'lokal',
    })
  })

  it("'server' behält den Server-Stand", () => {
    expect(entscheideManuelleAufloesung('server')).toEqual({
      wendeLokaleAenderungAn: false, status: 'aufgeloest', aufgeloestMit: 'server',
    })
  })
})
