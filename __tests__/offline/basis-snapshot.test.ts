// ═══════════════════════════════════════════════════════════════════
// Offline-Queue: der Basis-Snapshot ist Pflicht, sonst ist die
// Konflikterkennung eine Attrappe
// ═══════════════════════════════════════════════════════════════════
// Befund: `basis_updated_at` kam im ganzen Projekt genau zweimal vor —
// beide Male in app/api/sync/route.ts, einmal als Kommentar, einmal als
// Lesezugriff. GESCHRIEBEN hat es nie jemand. Damit bekam hatKonflikt()
// immer `undefined`, meldete immer „kein Konflikt", und jede
// Offline-Aenderung ueberschrieb den Serverstand bedingungslos —
// gleichgueltig, ob 'server_wins' oder 'manuell' eingestellt war. Die
// Konfliktansicht unter /admin/sync-konflikte konnte gar nichts
// anzeigen.
//
// Zwei Riegel schliessen das, an beiden Enden der Kette:
//  · Die Queue nimmt ein 'update' ohne Snapshot nicht mehr an.
//  · Der Server behandelt ein 'update' ohne Snapshot als Konflikt —
//    fuer Clients, die an der Queue vorbei schreiben.

import { describe, it, expect } from 'vitest'
import {
  validiereQueueItem,
  mitBasisSnapshot,
  BASIS_SNAPSHOT_FELD,
  type OfflineQueueItem,
} from '@/lib/offline/types'
import { hatKonflikt } from '@/lib/sync/conflict'

const T_ALT = '2026-08-31T08:00:00.000Z'
const T_NEU = '2026-08-31T09:30:00.000Z'

function item(over: Partial<OfflineQueueItem> = {}): Partial<OfflineQueueItem> {
  return {
    idempotency_key: 'k-1',
    entity_typ: 'pflegebericht',
    aktion: 'create',
    endpoint: '/api/pflege/verlauf',
    payload: { id: '11111111-1111-4111-8111-111111111111', text: 'Besuch' },
    user_id: 'u-1',
    organization_id: 'o-1',
    ...over,
  }
}

describe('die Queue verlangt bei update einen Ausgangszustand', () => {
  it('nimmt ein update ohne Snapshot nicht an', () => {
    expect(() => validiereQueueItem(item({ aktion: 'update' })))
      .toThrow(/basis_updated_at/)
  })

  it('nennt in der Meldung den Grund, nicht nur das Feld', () => {
    try {
      validiereQueueItem(item({ aktion: 'update' }))
      throw new Error('haette werfen muessen')
    } catch (e) {
      expect((e as Error).message).toMatch(/ueberschreibt neuere Serverdaten/)
    }
  })

  it('nimmt ein update MIT Snapshot an', () => {
    expect(() => validiereQueueItem(item({
      aktion: 'update',
      payload: mitBasisSnapshot({ id: 'x', text: 'Besuch' }, T_ALT),
    }))).not.toThrow()
  })

  it('weist einen unlesbaren Snapshot ab, statt ihn durchzureichen', () => {
    // Ein unlesbarer Zeitstempel kaeme am Server als NaN an. Dort waere
    // er zwar ein Konflikt (fail-closed), aber die Aenderung haette den
    // Weg schon umsonst gemacht — und der Engel bekaeme erst nach dem
    // Sync eine Fehlermeldung ohne erkennbare Ursache.
    for (const kaputt of ['gestern', '', '   ', '2026-13-45T99:99:99Z']) {
      expect(() => validiereQueueItem(item({
        aktion: 'update',
        payload: { id: 'x', [BASIS_SNAPSHOT_FELD]: kaputt },
      }))).toThrow()
    }
  })

  it('weist einen Snapshot ab, der kein Text ist', () => {
    for (const falsch of [12345, null, {}, []]) {
      expect(() => validiereQueueItem(item({
        aktion: 'update',
        payload: { id: 'x', [BASIS_SNAPSHOT_FELD]: falsch as unknown },
      }))).toThrow(/basis_updated_at/)
    }
  })

  it('laesst create und delete unberuehrt — dort gibt es keinen Vorzustand', () => {
    expect(() => validiereQueueItem(item({ aktion: 'create' }))).not.toThrow()
    expect(() => validiereQueueItem(item({ aktion: 'delete' }))).not.toThrow()
  })
})

describe('mitBasisSnapshot', () => {
  it('haengt den Snapshot an, ohne den Payload zu veraendern', () => {
    const original = { id: 'x', text: 'Besuch' }
    const gebaut = mitBasisSnapshot(original, T_ALT)
    expect(gebaut).toEqual({ id: 'x', text: 'Besuch', basis_updated_at: T_ALT })
    expect(original).toEqual({ id: 'x', text: 'Besuch' })
  })

  it('nutzt denselben Feldnamen, den der Server liest', () => {
    expect(BASIS_SNAPSHOT_FELD).toBe('basis_updated_at')
    expect(Object.keys(mitBasisSnapshot({}, T_ALT))).toEqual([BASIS_SNAPSHOT_FELD])
  })
})

describe('die Kette Queue → Server haelt zusammen', () => {
  it('der Payload aus mitBasisSnapshot wird vom Server als konfliktfrei erkannt', () => {
    const payload = mitBasisSnapshot({ id: 'x' }, T_ALT)
    expect(hatKonflikt({
      serverUpdatedAt: T_ALT,
      basisUpdatedAt: payload[BASIS_SNAPSHOT_FELD] as string,
      aktion: 'update',
    })).toBe(false)
  })

  it('hat sich der Server weiterbewegt, meldet er den Konflikt', () => {
    const payload = mitBasisSnapshot({ id: 'x' }, T_ALT)
    expect(hatKonflikt({
      serverUpdatedAt: T_NEU,
      basisUpdatedAt: payload[BASIS_SNAPSHOT_FELD] as string,
      aktion: 'update',
    })).toBe(true)
  })

  it('ein Client an der Queue vorbei kommt trotzdem nicht durch', () => {
    // Die Queue-Pruefung greift nur im Browser. Ein nativer Client oder
    // ein direkter POST auf /api/sync muss am Server scheitern.
    expect(hatKonflikt({ serverUpdatedAt: T_NEU, basisUpdatedAt: undefined, aktion: 'update' }))
      .toBe(true)
  })
})
