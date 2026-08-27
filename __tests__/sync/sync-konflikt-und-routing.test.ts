/**
 * Offline-Sync — Konflikterkennung, Endpunkt-Auflösung, interner Aufruf
 *
 * Das Sync-Modul nimmt Änderungen entgegen, die auf einem Gerät entstanden
 * sind, während es offline war. Zwei Klassen von Fehlern sind hier teuer,
 * und beide sind still:
 *
 *   1. DATENVERLUST — eine lokale Änderung überschreibt neuere Server-Daten
 *      (oder wird verworfen), ohne dass ein Konflikt gemeldet wird. Jede
 *      Stelle, an der die Konflikterkennung "im Zweifel nein" sagt, ist
 *      deshalb ein Fehler und wird hier als fail-closed geprüft.
 *   2. FREMDAUFRUF — `payload` kommt vom Gerät. Landet `payload.id`
 *      ungeprüft im Pfad, ruft der Server mit dem Sitzungs-Cookie des
 *      Nutzers einen Endpunkt auf, der gar nicht in der Registry steht.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { hatKonflikt, entscheideKonflikt, entscheideManuelleAufloesung } from '@/lib/sync/conflict'
import {
  SYNC_ENTITY_REGISTRY,
  resolveSyncRoute,
  extrahiereEntityId,
  hatUngueltigeEntityId,
  istGueltigeEntityId,
} from '@/lib/sync/entity-registry'
import { wendeAenderungAn, SYNC_FETCH_TIMEOUT_MS } from '@/lib/sync/apply'
import { warBereitsErfolgreich } from '@/lib/sync/audit'
import { erstelleFakeSupabase, type FakeAufruf } from '../helpers/supabase-fake'

const ID = '77777777-7777-4777-8777-777777777777'
const ORG = '00000000-0000-4000-8000-000000000001'

// ═══════════════════════════════════════════════════════════════════
// hatKonflikt — die Datenverlust-Schranke
// ═══════════════════════════════════════════════════════════════════

describe('hatKonflikt', () => {
  const T1 = '2026-08-01T10:00:00.000Z'
  const T2 = '2026-08-01T11:00:00.000Z'

  it('meldet keinen Konflikt, wenn der Client auf dem aktuellen Stand aufsetzt', () => {
    expect(hatKonflikt({ serverUpdatedAt: T1, basisUpdatedAt: T1 })).toBe(false)
  })

  it('erkennt denselben Zeitpunkt in anderer Schreibweise als konfliktfrei', () => {
    // Postgres liefert '+00:00', der Client speichert oft 'Z'.
    expect(hatKonflikt({
      serverUpdatedAt: '2026-08-01T10:00:00+00:00',
      basisUpdatedAt: '2026-08-01T10:00:00.000Z',
    })).toBe(false)
  })

  it('meldet einen Konflikt, wenn der Server sich inzwischen weiterbewegt hat', () => {
    expect(hatKonflikt({ serverUpdatedAt: T2, basisUpdatedAt: T1 })).toBe(true)
  })

  it('meldet keinen Konflikt ohne Basis-Snapshot — das ist der create-Fall', () => {
    expect(hatKonflikt({ serverUpdatedAt: T2, basisUpdatedAt: null })).toBe(false)
    expect(hatKonflikt({ serverUpdatedAt: T2, basisUpdatedAt: undefined })).toBe(false)
  })

  // ── fail-closed ──────────────────────────────────────────────────
  it('meldet einen Konflikt, wenn der Client eine Basis behauptet, der Server aber keinen Stand hat', () => {
    // Vorher gewann hier kommentarlos die lokale Änderung. Genau in diesem
    // Fall (Zeile nicht gefunden, Abfrage fehlgeschlagen, updated_at NULL)
    // sind Server-Daten still verschwunden.
    expect(hatKonflikt({ serverUpdatedAt: null, basisUpdatedAt: T1 })).toBe(true)
  })

  it('meldet einen Konflikt bei unlesbarem Server-Zeitstempel', () => {
    expect(hatKonflikt({ serverUpdatedAt: 'kaputt', basisUpdatedAt: T1 })).toBe(true)
  })

  it('meldet einen Konflikt bei unlesbarem Basis-Zeitstempel', () => {
    expect(hatKonflikt({ serverUpdatedAt: T1, basisUpdatedAt: 'kaputt' })).toBe(true)
  })
})

describe('entscheideKonflikt', () => {
  it('last_write_wins wendet die lokale Änderung an und gilt als aufgelöst', () => {
    expect(entscheideKonflikt('last_write_wins')).toEqual({
      wendeLokaleAenderungAn: true, status: 'aufgeloest', aufgeloestMit: 'lokal',
    })
  })

  it('server_wins verwirft die lokale Änderung', () => {
    expect(entscheideKonflikt('server_wins')).toEqual({
      wendeLokaleAenderungAn: false, status: 'aufgeloest', aufgeloestMit: 'server',
    })
  })

  it('manuell entscheidet nichts und schreibt nichts', () => {
    expect(entscheideKonflikt('manuell')).toEqual({
      wendeLokaleAenderungAn: false, status: 'offen', aufgeloestMit: null,
    })
  })

  it('manuelle Auflösung nach lokal wendet die Änderung nachträglich an', () => {
    expect(entscheideManuelleAufloesung('lokal').wendeLokaleAenderungAn).toBe(true)
    expect(entscheideManuelleAufloesung('server').wendeLokaleAenderungAn).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Entity-ID — client-kontrolliert
// ═══════════════════════════════════════════════════════════════════

describe('Entity-ID aus dem Geräte-Payload', () => {
  it('akzeptiert eine UUID', () => {
    expect(extrahiereEntityId({ id: ID })).toBe(ID)
    expect(istGueltigeEntityId(ID)).toBe(true)
  })

  it('liefert null, wenn gar keine id im Payload steht', () => {
    expect(extrahiereEntityId({})).toBeNull()
    expect(hatUngueltigeEntityId({}), 'fehlende id ist kein Fehler — create').toBe(false)
  })

  it.each([
    ['Pfad-Traversal', '../../admin/organizations'],
    ['absolute URL', 'https://example.invalid/x'],
    ['protokollrelativ', '//example.invalid/x'],
    ['Query-Anhang', `${ID}?rolle=admin`],
    ['Fragment', `${ID}#x`],
    ['leer', ''],
    ['keine UUID', 'abc'],
  ])('weist %s als Entity-ID ab', (_name, wert) => {
    expect(istGueltigeEntityId(wert)).toBe(false)
    expect(extrahiereEntityId({ id: wert })).toBeNull()
  })

  it('unterscheidet "kaputte id" von "keine id"', () => {
    // Der Aufrufer muss beides trennen: ohne id ist ein create regulär,
    // mit kaputter id darf das Item NICHT als konfliktfrei durchlaufen.
    expect(hatUngueltigeEntityId({ id: '../../admin' })).toBe(true)
    expect(hatUngueltigeEntityId({ id: null })).toBe(false)
    expect(hatUngueltigeEntityId({ id: ID })).toBe(false)
  })

  it('weist eine nicht-string id ab', () => {
    expect(istGueltigeEntityId(42)).toBe(false)
    expect(istGueltigeEntityId({ toString: () => ID })).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════
// resolveSyncRoute
// ═══════════════════════════════════════════════════════════════════

describe('resolveSyncRoute', () => {
  const vitals = SYNC_ENTITY_REGISTRY.vitalwerte

  it('setzt die ID in die Update-Vorlage ein', () => {
    expect(resolveSyncRoute(vitals, 'update', ID)).toEqual({ endpoint: `/api/vitals/${ID}`, methode: 'PATCH' })
  })

  it('nutzt für create den Endpunkt ohne ID', () => {
    expect(resolveSyncRoute(vitals, 'create')).toEqual({ endpoint: '/api/vitals', methode: 'POST' })
  })

  it('löst delete mit der hinterlegten Methode auf', () => {
    expect(resolveSyncRoute(vitals, 'delete', ID)).toEqual({ endpoint: `/api/vitals/${ID}`, methode: 'DELETE' })
  })

  it('baut KEINEN Endpunkt aus einer manipulierten ID', () => {
    // Ohne die Prüfung entstand '/api/vitals/../../admin/organizations',
    // was new URL() zu '/admin/organizations' normalisiert.
    expect(resolveSyncRoute(vitals, 'update', '../../admin/organizations')).toBeNull()
    expect(resolveSyncRoute(vitals, 'delete', '../../admin/organizations')).toBeNull()
  })

  it('liefert null, wenn eine Aktion für den Typ nicht hinterlegt ist', () => {
    expect(resolveSyncRoute(SYNC_ENTITY_REGISTRY.medikament_eingabe, 'update', ID)).toBeNull()
    expect(resolveSyncRoute(SYNC_ENTITY_REGISTRY.leistungsnachweis, 'create')).toBeNull()
    expect(resolveSyncRoute(vitals, 'delete', null)).toBeNull()
  })

  it('braucht keine ID, wenn die Vorlage keinen Platzhalter hat', () => {
    // leistungsnachweis erwartet die ID im Body, nicht im Pfad.
    expect(resolveSyncRoute(SYNC_ENTITY_REGISTRY.leistungsnachweis, 'update', null))
      .toEqual({ endpoint: '/api/leistungsnachweis/crud', methode: 'PATCH' })
  })

  it('hinterlegt für jeden Registry-Eintrag Tabelle und Zeitstempel-Spalte', () => {
    // Fehlt eines von beiden, laeuft der Konflikt-Check ins Leere.
    for (const [typ, e] of Object.entries(SYNC_ENTITY_REGISTRY)) {
      expect(e.tabelle, `${typ}: Tabelle fehlt`).toBeTruthy()
      expect(e.updatedAtSpalte, `${typ}: updatedAt-Spalte fehlt`).toBeTruthy()
    }
  })

  it('nutzt für Updates durchgängig PATCH, nie PUT', () => {
    for (const [typ, e] of Object.entries(SYNC_ENTITY_REGISTRY)) {
      if (e.updateEndpointVorlage) expect(e.updateMethode, typ).toBe('PATCH')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
// wendeAenderungAn — hier verlässt der Sitzungs-Cookie das Haus
// ═══════════════════════════════════════════════════════════════════

describe('wendeAenderungAn', () => {
  const basis = {
    origin: 'https://app.example',
    methode: 'PATCH' as const,
    payload: { id: ID, wert: 1 },
    cookieHeader: 'sb-access-token=geheim',
  }

  afterEach(() => { vi.restoreAllMocks() })

  it('ruft den Endpunkt auf dem eigenen Origin mit Cookie und Payload auf', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }))
    const ergebnis = await wendeAenderungAn({ ...basis, endpoint: `/api/vitals/${ID}` })

    expect(ergebnis).toEqual({ ok: true, status: 200, text: '' })
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe(`https://app.example/api/vitals/${ID}`)
    expect((init as RequestInit).method).toBe('PATCH')
    expect(((init as RequestInit).headers as Record<string, string>).Cookie).toBe('sb-access-token=geheim')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(basis.payload)
  })

  it('setzt ein Zeitlimit — fetch hat von sich aus keines', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }))
    await wendeAenderungAn({ ...basis, endpoint: '/api/vitals' })
    expect((fetchSpy.mock.calls[0][1] as RequestInit).signal,
      'ohne AbortSignal blockiert ein hängender Endpunkt den ganzen Batch').toBeDefined()
    expect(SYNC_FETCH_TIMEOUT_MS).toBeGreaterThan(0)
  })

  it('meldet ein Zeitlimit als 504, statt den Batch mit einer Ausnahme zu reißen', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(timeout)
    const ergebnis = await wendeAenderungAn({ ...basis, endpoint: '/api/vitals' })
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.status).toBe(504)
  })

  it('meldet einen Netzwerkfehler als 502', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))
    const ergebnis = await wendeAenderungAn({ ...basis, endpoint: '/api/vitals' })
    expect(ergebnis).toMatchObject({ ok: false, status: 502 })
  })

  it('schickt den Cookie NICHT an einen fremden Host', async () => {
    // new URL(endpoint, origin) ignoriert die Basis bei absolutem endpoint.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }))
    await expect(wendeAenderungAn({ ...basis, endpoint: 'https://example.invalid/klau' })).rejects.toThrow()
    await expect(wendeAenderungAn({ ...basis, endpoint: '//example.invalid/klau' })).rejects.toThrow()
    expect(fetchSpy, 'es darf gar kein Aufruf abgesetzt werden').not.toHaveBeenCalled()
  })

  it('ruft keinen Endpunkt außerhalb von /api/ auf', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }))
    await expect(wendeAenderungAn({ ...basis, endpoint: '/api/vitals/../../admin/organizations' })).rejects.toThrow()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('gibt den Fehlertext des Ziel-Endpunkts weiter', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Keine Berechtigung', { status: 403 }))
    const ergebnis = await wendeAenderungAn({ ...basis, endpoint: '/api/vitals' })
    expect(ergebnis).toEqual({ ok: false, status: 403, text: 'Keine Berechtigung' })
  })
})

// ═══════════════════════════════════════════════════════════════════
// Idempotenz
// ═══════════════════════════════════════════════════════════════════

describe('warBereitsErfolgreich', () => {
  it('erkennt einen bereits erfolgreich synchronisierten Schlüssel', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: { id: 'a' } }))
    await expect(warBereitsErfolgreich(fake.client, ORG, 'k-1')).resolves.toBe(true)
  })

  it('fragt org-gefenced und nur nach erfolgreichen Läufen', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: null }))
    await warBereitsErfolgreich(fake.client, ORG, 'k-1')
    const a = fake.ersterAuf('sync_audit_log')
    expect(a!.filter.some(f => f.spalte === 'organization_id' && f.wert === ORG)).toBe(true)
    expect(a!.filter.some(f => f.spalte === 'idempotency_key' && f.wert === 'k-1')).toBe(true)
    expect(a!.filter.some(f => f.spalte === 'aktion' && f.wert === 'sync_success'),
      'ohne diesen Filter gilt auch ein fehlgeschlagener Lauf als erledigt').toBe(true)
  })

  it('lässt einen unbekannten Schlüssel durch', async () => {
    const fake = erstelleFakeSupabase(() => ({ data: null }))
    await expect(warBereitsErfolgreich(fake.client, ORG, 'neu')).resolves.toBe(false)
  })

  it('behauptet bei einem DB-Fehler NICHT "noch nicht synchronisiert"', async () => {
    // Vorher: `return false` → die Aktion lief erneut. Bei append-only-
    // Entitäten (medikament_eingaben) entsteht daraus eine doppelt
    // dokumentierte Medikamentengabe.
    const fake = erstelleFakeSupabase((_a: FakeAufruf) => ({
      data: null, error: { message: 'connection reset', code: '08006' },
    }))
    await expect(warBereitsErfolgreich(fake.client, ORG, 'k-1')).rejects.toThrow()
  })
})
