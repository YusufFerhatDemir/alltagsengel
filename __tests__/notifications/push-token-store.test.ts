/**
 * Geraete-Token und Push-Einwilligung (lib/notifications/push/token-store.ts)
 *
 * Zwei Dinge scheitern hier bewusst UNTERSCHIEDLICH, und genau darin liegt
 * das Risiko dieser Datei:
 *
 *   Die Geraeteliste ist nachsichtig. Fehlt die Migration 20260930000000,
 *   fehlt die Spalte organization_id — PostgREST verwirft dann mit 42703
 *   die GANZE Abfrage, nicht nur die Spalte. Das Modul faengt das ab und
 *   liest ohne die neue Spalte weiter. Der Kanal bleibt am Leben.
 *
 *   Die EINWILLIGUNG ist fail-closed. Ob jemand Push abgewaehlt hat, darf
 *   nicht geraten werden: jeder Lesefehler ausser "Tabelle fehlt" heisst
 *   "nicht senden".
 *
 * Dazu kam ein Befund, den erst der Blick auf das Schema sichtbar macht:
 * notification_preferences hat PRIMARY KEY (user_id, channel) — je Nutzer
 * und Kanal genau EINE Zeile. Der Lesepfad filterte trotzdem zusaetzlich
 * auf organization_id, und damit war ein in Mandant A erklaerter
 * Widerspruch in Mandant B unsichtbar: dieselbe Person bekam dort weiter
 * Push, obwohl sie abgewaehlt hatte.
 */

import { describe, it, expect } from 'vitest'
import {
  tokenKuerzel,
  registriereGeraet,
  entferneGeraet,
  entwerteToken,
  markiereGenutzt,
  geraeteFuerNutzer,
  pushErlaubt,
  setzePushErlaubnis,
} from '@/lib/notifications/push/token-store'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf, type FakeAntwort } from '../helpers/supabase-fake'

const NUTZER = '11111111-1111-4111-8111-111111111111'
const ORG_A = '00000000-0000-4000-8000-000460629986'
const ORG_B = '99999999-9999-4999-8999-999999999999'
const TOKEN = 'fMEP0vJqS0aBcDeFgHiJkL:APA91bHxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

const SPALTE_FEHLT = { message: 'column "organization_id" does not exist', code: '42703' }
const TABELLE_FEHLT = { message: 'relation "notification_preferences" does not exist', code: '42P01' }

interface Welt {
  tokens?: FakeAntwort | ((a: FakeAufruf) => FakeAntwort)
  praeferenzen?: FakeAntwort
}

function fake(w: Welt = {}) {
  return erstelleFakeSupabase((a: FakeAufruf): FakeAntwort => {
    if (a.tabelle === 'fcm_tokens') {
      const t = w.tokens ?? { data: [], error: null, count: 0 }
      return typeof t === 'function' ? t(a) : t
    }
    if (a.tabelle === 'notification_preferences') return w.praeferenzen ?? { data: [], error: null }
    return { data: null, error: null }
  })
}

// ═══════════════════════════════════════════════════════════════════════
// 1 — Token im Log
// ═══════════════════════════════════════════════════════════════════════

describe('tokenKuerzel', () => {
  it('gibt genug zum Unterscheiden preis und zu wenig zum Senden', () => {
    const k = tokenKuerzel(TOKEN)
    expect(k).toBe(`${TOKEN.slice(0, 12)}…`)
    expect(k.length).toBeLessThan(TOKEN.length)
    expect(TOKEN.startsWith(k.slice(0, -1))).toBe(true)
  })

  it('gibt einen kurzen Token gar nicht preis', () => {
    expect(tokenKuerzel('kurz')).toBe('…')
    expect(tokenKuerzel('123456789012')).toBe('…')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2 — Registrierung
// ═══════════════════════════════════════════════════════════════════════

describe('registriereGeraet', () => {
  it('schreibt idempotent ueber (user_id, token)', async () => {
    const f = fake()
    const erg = await registriereGeraet({ userId: NUTZER, organizationId: ORG_A, token: TOKEN, admin: f.client })
    expect(erg.ok).toBe(true)

    const ins = f.auf('fcm_tokens').find(a => a.operation === 'insert')!
    const z = ins.payload as Record<string, unknown>
    expect(z.user_id).toBe(NUTZER)
    expect(z.token).toBe(TOKEN)
    expect(z.organization_id).toBe(ORG_A)
    // Doppelte Zeilen wuerden jede Nachricht mehrfach zustellen.
    expect(ins.filter.some(x => x.methode === 'insert')).toBe(false)
  })

  it('meldet ein bereits bekanntes Geraet als "bekannt"', async () => {
    const f = fake({ tokens: a => (a.head ? { count: 1 } : { data: null, error: null }) })
    const erg = await registriereGeraet({ userId: NUTZER, organizationId: ORG_A, token: TOKEN, admin: f.client })
    expect(erg).toEqual({ ok: true, bekannt: true })
  })

  it('schneidet Leerzeichen am Token ab', async () => {
    const f = fake()
    await registriereGeraet({ userId: NUTZER, organizationId: ORG_A, token: `  ${TOKEN}  `, admin: f.client })
    const z = f.auf('fcm_tokens').find(a => a.operation === 'insert')!.payload as Record<string, unknown>
    expect(z.token).toBe(TOKEN)
  })

  it('weist ungueltige Nutzer-ID und zu kurzen Token ab, ohne die Datenbank anzufassen', async () => {
    const f = fake()
    expect((await registriereGeraet({ userId: 'nicht-uuid', organizationId: ORG_A, token: TOKEN, admin: f.client })).ok).toBe(false)
    expect((await registriereGeraet({ userId: NUTZER, organizationId: ORG_A, token: 'kurz', admin: f.client })).ok).toBe(false)
    expect((await registriereGeraet({ userId: NUTZER, organizationId: ORG_A, token: '', admin: f.client })).ok).toBe(false)
    expect(f.aufrufe).toHaveLength(0)
  })

  it('faellt bei unbekannter Plattform auf android zurueck, statt den Wert durchzureichen', async () => {
    const f = fake()
    await registriereGeraet({ userId: NUTZER, organizationId: ORG_A, token: TOKEN, platform: 'symbian', admin: f.client })
    const z = f.auf('fcm_tokens').find(a => a.operation === 'insert')!.payload as Record<string, unknown>
    expect(z.platform).toBe('android')
  })

  it('uebernimmt eine bekannte Plattform', async () => {
    const f = fake()
    await registriereGeraet({ userId: NUTZER, organizationId: ORG_A, token: TOKEN, platform: 'ios', admin: f.client })
    const z = f.auf('fcm_tokens').find(a => a.operation === 'insert')!.payload as Record<string, unknown>
    expect(z.platform).toBe('ios')
  })

  it('laesst eine ungueltige Organisations-ID weg, statt sie zu schreiben', async () => {
    const f = fake()
    await registriereGeraet({ userId: NUTZER, organizationId: 'keine-uuid', token: TOKEN, admin: f.client })
    const z = f.auf('fcm_tokens').find(a => a.operation === 'insert')!.payload as Record<string, unknown>
    expect(z).not.toHaveProperty('organization_id')
  })

  it('wiederholt bei fehlender Spalte im Altformat, statt die Registrierung zu verlieren', async () => {
    let versuch = 0
    const f = fake({
      tokens: a => {
        if (a.head) return { count: 0 }
        versuch++
        return versuch === 1 ? { data: null, error: SPALTE_FEHLT } : { data: null, error: null }
      },
    })
    const erg = await registriereGeraet({ userId: NUTZER, organizationId: ORG_A, token: TOKEN, admin: f.client })
    expect(erg.ok).toBe(true)

    const schreibversuche = f.auf('fcm_tokens').filter(a => a.operation === 'insert')
    expect(schreibversuche).toHaveLength(2)
    const zweiter = schreibversuche[1].payload as Record<string, unknown>
    expect(zweiter).not.toHaveProperty('organization_id')
    expect(zweiter).not.toHaveProperty('last_used_at')
  })

  it('meldet jeden anderen Schreibfehler zurueck, statt Erfolg zu behaupten', async () => {
    const f = fake({ tokens: a => (a.head ? { count: 0 } : { data: null, error: { message: 'permission denied', code: '42501' } }) })
    const erg = await registriereGeraet({ userId: NUTZER, organizationId: ORG_A, token: TOKEN, admin: f.client })
    expect(erg.ok).toBe(false)
    expect(erg.grund).toContain('permission denied')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3 — Abmelden und Rotation
// ═══════════════════════════════════════════════════════════════════════

describe('entferneGeraet', () => {
  it('loescht immer NUR beim eigenen Nutzer — fremde Token sind so nicht erreichbar', async () => {
    const f = fake()
    await entferneGeraet(NUTZER, TOKEN, f.client)
    const del = f.auf('fcm_tokens').find(a => a.operation === 'delete')!
    expect(hatFilter(del, 'eq', 'user_id', NUTZER)).toBe(true)
    expect(hatFilter(del, 'eq', 'token', TOKEN)).toBe(true)
  })

  it('weist ungueltige Eingaben ab, ohne zu loeschen', async () => {
    const f = fake()
    expect((await entferneGeraet('nicht-uuid', TOKEN, f.client)).ok).toBe(false)
    expect((await entferneGeraet(NUTZER, '   ', f.client)).ok).toBe(false)
    expect(f.aufrufe).toHaveLength(0)
  })

  it('meldet einen Loeschfehler zurueck', async () => {
    const f = fake({ tokens: { data: null, error: { message: 'timeout' } } })
    expect(await entferneGeraet(NUTZER, TOKEN, f.client)).toEqual({ ok: false, grund: 'timeout' })
  })
})

describe('entwerteToken', () => {
  it('loescht bewusst OHNE user_id — der Sendeweg kennt nur den Token', async () => {
    const f = fake()
    expect(await entwerteToken(TOKEN, 'UNREGISTERED', f.client)).toBe(true)
    const del = f.auf('fcm_tokens').find(a => a.operation === 'delete')!
    expect(hatFilter(del, 'eq', 'token', TOKEN)).toBe(true)
    expect(del.filter.some(x => x.spalte === 'user_id')).toBe(false)
  })

  it('meldet false statt zu werfen — die Rotation darf den Sendeweg nicht abbrechen', async () => {
    const f = fake({ tokens: { data: null, error: { message: 'deadlock' } } })
    expect(await entwerteToken(TOKEN, 'UNREGISTERED', f.client)).toBe(false)
  })
})

describe('markiereGenutzt', () => {
  it('setzt last_used_at fuer alle uebergebenen Token', async () => {
    const f = fake()
    await markiereGenutzt([TOKEN, 'zweiter-token'], f.client)
    const upd = f.auf('fcm_tokens').find(a => a.operation === 'update')!
    expect(Object.keys(upd.payload as object)).toEqual(['last_used_at'])
    expect(hatFilter(upd, 'in', 'token', [TOKEN, 'zweiter-token'])).toBe(true)
  })

  it('macht bei leerer Liste gar nichts', async () => {
    const f = fake()
    await markiereGenutzt([], f.client)
    expect(f.aufrufe).toHaveLength(0)
  })

  it('schluckt jeden Fehler — der Nutzungszeitpunkt ist Statistik, kein Zustellzustand', async () => {
    for (const fehler of [SPALTE_FEHLT, { message: 'timeout' }]) {
      const f = fake({ tokens: { data: null, error: fehler } })
      await expect(markiereGenutzt([TOKEN], f.client)).resolves.toBeUndefined()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4 — Geraeteliste
// ═══════════════════════════════════════════════════════════════════════

describe('geraeteFuerNutzer', () => {
  const zeile = {
    id: 'g1', user_id: NUTZER, token: TOKEN, platform: 'ios',
    organization_id: ORG_A, last_used_at: '2026-08-01T10:00:00Z',
  }

  it('grenzt auf Nutzer UND Mandant ein — RLS greift beim Service-Role-Client nicht', async () => {
    const f = fake({ tokens: { data: [zeile] } })
    await geraeteFuerNutzer(NUTZER, ORG_A, f.client)
    const a = f.ersterAuf('fcm_tokens')!
    expect(hatFilter(a, 'eq', 'user_id', NUTZER)).toBe(true)
    expect(hatFilter(a, 'eq', 'organization_id', ORG_A)).toBe(true)
  })

  it('laesst den Mandantenfilter weg, wenn keine gueltige Organisation uebergeben wird', async () => {
    const f = fake({ tokens: { data: [zeile] } })
    await geraeteFuerNutzer(NUTZER, 'keine-uuid', f.client)
    expect(f.ersterAuf('fcm_tokens')!.filter.some(x => x.spalte === 'organization_id')).toBe(false)
  })

  it('uebersetzt die Zeilen und normalisiert eine unbekannte Plattform', async () => {
    const f = fake({ tokens: { data: [{ ...zeile, platform: 'symbian' }] } })
    const [g] = await geraeteFuerNutzer(NUTZER, ORG_A, f.client)
    expect(g).toEqual({
      id: 'g1', userId: NUTZER, organizationId: ORG_A, token: TOKEN,
      platform: 'android', lastUsedAt: '2026-08-01T10:00:00Z',
    })
  })

  it('liest bei fehlender Spalte ohne organization_id nach — der Kanal bleibt am Leben', async () => {
    let versuch = 0
    const f = fake({
      tokens: () => {
        versuch++
        return versuch === 1
          ? { data: null, error: SPALTE_FEHLT }
          : { data: [{ id: 'g1', user_id: NUTZER, token: TOKEN, platform: 'ios' }] }
      },
    })
    const geraete = await geraeteFuerNutzer(NUTZER, ORG_A, f.client)
    expect(geraete).toHaveLength(1)
    expect(geraete[0].organizationId).toBeNull()

    // Die Nutzergrenze bleibt auch im Rueckfall stehen — sie ist die
    // eigentliche Grenze, organization_id nur die zusaetzliche.
    const zweite = f.auf('fcm_tokens')[1]
    expect(hatFilter(zweite, 'eq', 'user_id', NUTZER)).toBe(true)
    expect(zweite.filter.some(x => x.spalte === 'organization_id')).toBe(false)
  })

  it('liefert bei jedem anderen Lesefehler eine leere Liste (es wird dann nichts gesendet)', async () => {
    const f = fake({ tokens: { data: null, error: { message: 'permission denied', code: '42501' } } })
    expect(await geraeteFuerNutzer(NUTZER, ORG_A, f.client)).toEqual([])
  })

  it('liefert bei ungueltiger Nutzer-ID sofort eine leere Liste', async () => {
    const f = fake()
    expect(await geraeteFuerNutzer('nicht-uuid', ORG_A, f.client)).toEqual([])
    expect(f.aufrufe).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5 — Einwilligung: fail-closed
// ═══════════════════════════════════════════════════════════════════════

describe('pushErlaubt', () => {
  it('fehlende Zeile heisst erlaubt — das registrierte Geraet ist bereits die Einwilligung', async () => {
    const f = fake({ praeferenzen: { data: [] } })
    expect(await pushErlaubt(NUTZER, ORG_A, f.client)).toEqual({ erlaubt: true })
  })

  it('enabled=false heisst Widerspruch', async () => {
    const f = fake({ praeferenzen: { data: [{ enabled: false }] } })
    const e = await pushErlaubt(NUTZER, ORG_A, f.client)
    expect(e.erlaubt).toBe(false)
    expect(e.grund).toMatch(/abgewaehlt/)
  })

  it('enabled=true heisst erlaubt', async () => {
    const f = fake({ praeferenzen: { data: [{ enabled: true }] } })
    expect((await pushErlaubt(NUTZER, ORG_A, f.client)).erlaubt).toBe(true)
  })

  it('fehlende Tabelle heisst erlaubt — sonst waere der Kanal vor dem Apply komplett tot', async () => {
    const f = fake({ praeferenzen: { data: null, error: TABELLE_FEHLT } })
    const e = await pushErlaubt(NUTZER, ORG_A, f.client)
    expect(e.erlaubt).toBe(true)
    expect(e.grund).toMatch(/Migration/)
  })

  it('JEDER andere Lesefehler heisst NICHT senden', async () => {
    for (const fehler of [
      { message: 'permission denied', code: '42501' },
      { message: 'timeout' },
      SPALTE_FEHLT,
    ]) {
      const f = fake({ praeferenzen: { data: null, error: fehler } })
      expect((await pushErlaubt(NUTZER, ORG_A, f.client)).erlaubt, fehler.message).toBe(false)
    }
  })

  it('ungueltige Nutzer-ID heisst NICHT senden, ohne Datenbankzugriff', async () => {
    const f = fake()
    expect((await pushErlaubt('nicht-uuid', ORG_A, f.client)).erlaubt).toBe(false)
    expect(f.aufrufe).toHaveLength(0)
  })

  it('BEFUND: der Widerspruch gilt nutzerweit, nicht je Mandant', async () => {
    // notification_preferences hat PRIMARY KEY (user_id, channel) — es gibt
    // je Nutzer und Kanal nur EINE Zeile. Der frueher zusaetzlich gesetzte
    // organization_id-Filter machte einen in Mandant A erklaerten
    // Widerspruch in Mandant B unsichtbar.
    const f = fake({ praeferenzen: { data: [{ enabled: false }] } })
    expect((await pushErlaubt(NUTZER, ORG_B, f.client)).erlaubt).toBe(false)

    const a = f.ersterAuf('notification_preferences')!
    expect(hatFilter(a, 'eq', 'user_id', NUTZER)).toBe(true)
    expect(hatFilter(a, 'eq', 'channel', 'push')).toBe(true)
    expect(a.filter.some(x => x.spalte === 'organization_id')).toBe(false)
  })

  it('fragt genau den Push-Kanal ab, nicht irgendeinen', async () => {
    const f = fake({ praeferenzen: { data: [] } })
    await pushErlaubt(NUTZER, ORG_A, f.client)
    expect(hatFilter(f.ersterAuf('notification_preferences'), 'eq', 'channel', 'push')).toBe(true)
  })
})

describe('setzePushErlaubnis', () => {
  it('schreibt den Widerspruch auf den Schluessel (user_id, channel)', async () => {
    const f = fake()
    expect(await setzePushErlaubnis(NUTZER, ORG_A, false, f.client)).toEqual({ ok: true })
    const z = f.ersterAuf('notification_preferences', 'insert')!.payload as Record<string, unknown>
    expect(z.user_id).toBe(NUTZER)
    expect(z.channel).toBe('push')
    expect(z.enabled).toBe(false)
    expect(z.organization_id).toBe(ORG_A)
  })

  it('nimmt den Widerspruch auch wieder zurueck', async () => {
    const f = fake()
    await setzePushErlaubnis(NUTZER, ORG_A, true, f.client)
    const z = f.ersterAuf('notification_preferences', 'insert')!.payload as Record<string, unknown>
    expect(z.enabled).toBe(true)
  })

  it('weist ungueltige IDs ab, ohne zu schreiben', async () => {
    const f = fake()
    expect((await setzePushErlaubnis('nicht-uuid', ORG_A, false, f.client)).ok).toBe(false)
    expect((await setzePushErlaubnis(NUTZER, 'nicht-uuid', false, f.client)).ok).toBe(false)
    expect(f.aufrufe).toHaveLength(0)
  })

  it('meldet einen Schreibfehler zurueck, statt Erfolg zu behaupten', async () => {
    const f = fake({ praeferenzen: { data: null, error: { message: 'permission denied' } } })
    expect(await setzePushErlaubnis(NUTZER, ORG_A, false, f.client)).toEqual({ ok: false, grund: 'permission denied' })
  })

  it('gesetzter Widerspruch wird vom Lesepfad auch wirklich gesehen', async () => {
    // Schreiben und Lesen muessen denselben Schluessel benutzen — sonst
    // laeuft die Einstellung ins Leere und niemand merkt es.
    const s = fake()
    await setzePushErlaubnis(NUTZER, ORG_A, false, s.client)
    const geschrieben = s.ersterAuf('notification_preferences', 'insert')!.payload as Record<string, unknown>

    const l = fake({ praeferenzen: { data: [{ enabled: geschrieben.enabled }] } })
    expect((await pushErlaubt(NUTZER, ORG_A, l.client)).erlaubt).toBe(false)
  })
})
