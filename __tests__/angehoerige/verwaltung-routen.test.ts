/**
 * Angehörigenzugänge — die Verwaltungsseite (/api/admin/angehoerige)
 *
 * Drei Befunde vom 27.08.2026, jeweils mit Gegenprobe:
 *
 *  1. ROLLE DARF, DATENBANK NICHT. Die Routen lassen jede Rolle mit
 *     `stammdaten.lesen`/`.schreiben` herein — also auch pdl und qm.
 *     Gearbeitet haben sie aber mit dem RLS-Client, und auf
 *     `angehoerigen_zugaenge` greift für Nicht-Admins keine Policy
 *     (`is_admin()` ist live auf admin|superadmin beschränkt). Eine PDL
 *     bekam eine leere Liste ohne Fehlermeldung und beim Anlegen einen
 *     HTTP 500 mit roher Postgres-Meldung.
 *
 *  2. WIDERRUF WAR EINE SACKGASSE. `unique_user_client` verbietet einen
 *     zweiten Zugang für dasselbe Paar; ein Weg zurück fehlte. Nach
 *     einem versehentlichen Widerruf liess sich der Angehörige nie
 *     wieder freischalten — der neue Anlegeversuch kam als 500 zurück.
 *
 *  3. WIDERRUF LIESS SICH UMGEHEN. `aktualisiereFreigaben` änderte auch
 *     einen widerrufenen Zugang, und `widerrufeZugang` schrieb ohne
 *     Statusprüfung — ein zweiter Widerruf überschrieb Grund und
 *     Zeitpunkt des ersten.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const ORG = 'org-1'
const FREMD_ORG = 'org-2'
const PDL = 'user-pdl'
const K1 = 'client-1'
const ZUGANG = 'zugang-1'
const ANGEH = 'user-angeh'

const { mockRequireAngehAdmin, mockCreateAdminClient, mockLogAuditEvent } = vi.hoisted(() => ({
  mockRequireAngehAdmin: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockLogAuditEvent: vi.fn(),
}))

vi.mock('@/lib/angehoerige/api-auth', () => ({ requireAngehAdmin: mockRequireAngehAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockCreateAdminClient }))
vi.mock('@/lib/audit-log', () => ({ logAuditEventOrWarn: mockLogAuditEvent }))

import { GET as LISTE, POST as ANLEGEN } from '@/app/api/admin/angehoerige/route'
import { PATCH } from '@/app/api/admin/angehoerige/[id]/route'

// ── Doppelgänger ───────────────────────────────────────────────────
type Zeile = Record<string, unknown>
interface Aufruf {
  tabelle: string
  op: 'select' | 'insert' | 'update'
  filter: Array<[string, string, unknown]>
  werte?: Zeile
}

function fakeDb(bestand: Record<string, Zeile[]>) {
  const aufrufe: Aufruf[] = []

  function passt(row: Zeile, [art, feld, wert]: [string, string, unknown]): boolean {
    if (art === 'eq') return row[feld] === wert
    if (art === 'neq') return row[feld] !== wert
    if (art === 'in') return (wert as unknown[]).includes(row[feld])
    return true
  }

  return {
    aufrufe,
    from(tabelle: string) {
      const a: Aufruf = { tabelle, op: 'select', filter: [] }
      aufrufe.push(a)

      function ergebnis() {
        const treffer = (bestand[tabelle] ?? []).filter(r => a.filter.every(f => passt(r, f)))
        if (a.op === 'insert') {
          const zeile = { id: `neu-${aufrufe.length}`, ...(a.werte ?? {}) }
          // Unique-Index unique_user_client nachbilden.
          const doppelt = (bestand[tabelle] ?? []).some(r =>
            r.user_id === zeile.user_id && r.client_id === zeile.client_id)
          if (tabelle === 'angehoerigen_zugaenge' && doppelt) {
            return { data: null, error: { message: 'duplicate key value violates unique constraint "unique_user_client"', code: '23505' }, count: null }
          }
          ;(bestand[tabelle] ??= []).push(zeile)
          return { data: zeile, error: null, count: null }
        }
        if (a.op === 'update') {
          if (treffer.length === 0) return { data: null, error: null, count: 0 }
          for (const r of treffer) Object.assign(r, a.werte)
          return { data: treffer[0], error: null, count: treffer.length }
        }
        return { data: treffer, error: null, count: treffer.length }
      }

      const kette: Record<string, unknown> = {
        select() { return kette },
        insert(werte: Zeile) { a.op = 'insert'; a.werte = werte; return kette },
        update(werte: Zeile) { a.op = 'update'; a.werte = werte; return kette },
        eq(f: string, w: unknown) { a.filter.push(['eq', f, w]); return kette },
        neq(f: string, w: unknown) { a.filter.push(['neq', f, w]); return kette },
        in(f: string, w: unknown[]) { a.filter.push(['in', f, w]); return kette },
        order() { return kette },
        limit() { return kette },
        single: async () => {
          const e = ergebnis()
          if (e.error) return e
          const d = Array.isArray(e.data) ? e.data[0] ?? null : e.data
          return d ? { data: d, error: null } : { data: null, error: { message: 'no rows', code: 'PGRST116' } }
        },
        maybeSingle: async () => {
          const e = ergebnis()
          if (e.error) return e
          return { data: Array.isArray(e.data) ? e.data[0] ?? null : e.data, error: null }
        },
        then: (aufloesen: (w: unknown) => unknown) => Promise.resolve(ergebnis()).then(aufloesen),
      }
      return kette
    },
  }
}

function bestandMit(zugangStatus: string): Record<string, Zeile[]> {
  return {
    clients: [{ id: K1, organization_id: ORG, first_name: 'Anna', last_name: 'Meier' }],
    profiles: [
      { id: ANGEH, first_name: 'Tochter', last_name: 'Meier', email: 't@example.org', deleted_at: null },
      { id: 'user-geloescht', first_name: 'Weg', last_name: 'Weg', email: null, deleted_at: '2026-01-01' },
    ],
    angehoerigen_zugaenge: [{
      id: ZUGANG,
      organization_id: ORG,
      user_id: ANGEH,
      client_id: K1,
      rolle: 'angehoeriger',
      status: zugangStatus,
      freigegebene_bereiche: ['termine'],
      pflegeberichte_freigegeben: false,
      widerrufen_von: zugangStatus === 'widerrufen' ? PDL : null,
      widerrufen_am: zugangStatus === 'widerrufen' ? '2026-08-01T00:00:00Z' : null,
      widerruf_grund: zugangStatus === 'widerrufen' ? 'erster Grund' : null,
      gueltig_bis: null,
    }],
    angehoerigen_audit_log: [],
  }
}

function alsPdl() {
  mockRequireAngehAdmin.mockResolvedValue({
    ok: true,
    ctx: { userId: PDL, organizationId: ORG, role: 'pdl', name: 'PDL' },
  })
}

function patchAnfrage(body: unknown) {
  return new Request('http://x/api/admin/angehoerige/zugang-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }) as never
}
const params = { params: Promise.resolve({ id: ZUGANG }) }

beforeEach(() => {
  vi.clearAllMocks()
  mockLogAuditEvent.mockResolvedValue(undefined)
})

// ═══════════════════════════════════════════════════════════════════
describe('eine PDL kann die Zugänge verwalten', () => {
  it('sieht die Zugänge ihrer Organisation', async () => {
    alsPdl()
    mockCreateAdminClient.mockReturnValue(fakeDb(bestandMit('aktiv')))
    const res = await LISTE(new Request('http://x/api/admin/angehoerige') as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].client_name).toBe('Anna Meier')
    expect(body[0].user_email).toBe('t@example.org')
  })

  it('die Liste bleibt auf die eigene Organisation begrenzt', async () => {
    alsPdl()
    const bestand = bestandMit('aktiv')
    bestand.angehoerigen_zugaenge.push({ ...bestand.angehoerigen_zugaenge[0], id: 'fremd', organization_id: FREMD_ORG })
    mockCreateAdminClient.mockReturnValue(fakeDb(bestand))
    const body = await (await LISTE(new Request('http://x/api/admin/angehoerige') as never)).json()
    expect(body.map((z: { id: string }) => z.id)).toEqual([ZUGANG])
  })

  it('legt einen Zugang an und protokolliert ihn', async () => {
    alsPdl()
    const bestand = bestandMit('aktiv')
    bestand.angehoerigen_zugaenge = []
    mockCreateAdminClient.mockReturnValue(fakeDb(bestand))

    const req = new Request('http://x/api/admin/angehoerige', {
      method: 'POST',
      body: JSON.stringify({
        client_id: K1, user_id: ANGEH, rolle: 'angehoeriger',
        freigegebene_bereiche: ['termine', 'dokumente'],
      }),
    })
    const res = await ANLEGEN(req as never)
    expect(res.status).toBe(201)
    expect(bestand.angehoerigen_zugaenge).toHaveLength(1)
    expect(bestand.angehoerigen_audit_log).toHaveLength(1)
    expect(bestand.angehoerigen_audit_log[0].aktion).toBe('zugang_erteilt')
    expect(mockLogAuditEvent).toHaveBeenCalledOnce()
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Anlegen prüft Klient und Empfänger', () => {
  it('fremder Klient: 404', async () => {
    alsPdl()
    mockCreateAdminClient.mockReturnValue(fakeDb(bestandMit('aktiv')))
    const req = new Request('http://x/api', {
      method: 'POST',
      body: JSON.stringify({ client_id: 'client-fremd', user_id: ANGEH, rolle: 'angehoeriger', freigegebene_bereiche: ['termine'] }),
    })
    expect((await ANLEGEN(req as never)).status).toBe(404)
  })

  it('unbekannte oder gelöschte Benutzer-ID: 404 statt Zugang ins Leere', async () => {
    for (const uid of ['gibt-es-nicht', 'user-geloescht']) {
      alsPdl()
      const bestand = bestandMit('aktiv')
      bestand.angehoerigen_zugaenge = []
      mockCreateAdminClient.mockReturnValue(fakeDb(bestand))
      const req = new Request('http://x/api', {
        method: 'POST',
        body: JSON.stringify({ client_id: K1, user_id: uid, rolle: 'angehoeriger', freigegebene_bereiche: ['termine'] }),
      })
      expect((await ANLEGEN(req as never)).status, uid).toBe(404)
      expect(bestand.angehoerigen_zugaenge).toHaveLength(0)
    }
  })

  it('zweiter Zugang für dasselbe Paar: 409 mit verständlicher Meldung, keine rohe DB-Meldung', async () => {
    alsPdl()
    mockCreateAdminClient.mockReturnValue(fakeDb(bestandMit('widerrufen')))
    const req = new Request('http://x/api', {
      method: 'POST',
      body: JSON.stringify({ client_id: K1, user_id: ANGEH, rolle: 'angehoeriger', freigegebene_bereiche: ['termine'] }),
    })
    const res = await ANLEGEN(req as never)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('bereits ein Zugang')
    expect(body.error).not.toContain('unique constraint')
    expect(body.error).not.toContain('duplicate key')
  })

  it('ungültige Bereiche: 400', async () => {
    alsPdl()
    const bestand = bestandMit('aktiv')
    bestand.angehoerigen_zugaenge = []
    mockCreateAdminClient.mockReturnValue(fakeDb(bestand))
    const req = new Request('http://x/api', {
      method: 'POST',
      body: JSON.stringify({ client_id: K1, user_id: ANGEH, rolle: 'angehoeriger', freigegebene_bereiche: ['abrechnung'] }),
    })
    expect((await ANLEGEN(req as never)).status).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Widerruf und Reaktivierung', () => {
  it('Widerruf setzt Status, Grund und Protokolleintrag', async () => {
    alsPdl()
    const bestand = bestandMit('aktiv')
    mockCreateAdminClient.mockReturnValue(fakeDb(bestand))
    const res = await PATCH(patchAnfrage({ action: 'widerrufen', grund: 'Wunsch der Klientin' }), params)
    expect(res.status).toBe(200)
    expect(bestand.angehoerigen_zugaenge[0].status).toBe('widerrufen')
    expect(bestand.angehoerigen_zugaenge[0].widerruf_grund).toBe('Wunsch der Klientin')
    expect(bestand.angehoerigen_audit_log[0].aktion).toBe('zugang_widerrufen')
  })

  it('zweiter Widerruf überschreibt den ersten nicht', async () => {
    alsPdl()
    const bestand = bestandMit('widerrufen')
    mockCreateAdminClient.mockReturnValue(fakeDb(bestand))
    const res = await PATCH(patchAnfrage({ action: 'widerrufen', grund: 'zweiter Grund' }), params)
    expect(res.status).toBe(409)
    expect(bestand.angehoerigen_zugaenge[0].widerruf_grund).toBe('erster Grund')
  })

  it('ein widerrufener Zugang lässt sich nicht per Freigabe-Update wiederbeleben', async () => {
    alsPdl()
    const bestand = bestandMit('widerrufen')
    mockCreateAdminClient.mockReturnValue(fakeDb(bestand))
    const res = await PATCH(patchAnfrage({ freigegebene_bereiche: ['termine', 'dokumente'] }), params)
    expect(res.status).toBe(409)
    expect(bestand.angehoerigen_zugaenge[0].freigegebene_bereiche).toEqual(['termine'])
    expect(bestand.angehoerigen_zugaenge[0].status).toBe('widerrufen')
  })

  it('Reaktivieren hebt den Widerruf auf und räumt die Widerrufsspuren weg', async () => {
    alsPdl()
    const bestand = bestandMit('widerrufen')
    mockCreateAdminClient.mockReturnValue(fakeDb(bestand))
    const res = await PATCH(patchAnfrage({
      action: 'reaktivieren',
      freigegebene_bereiche: ['termine'],
      pflegeberichte_freigegeben: false,
    }), params)
    expect(res.status).toBe(200)
    const z = bestand.angehoerigen_zugaenge[0]
    expect(z.status).toBe('aktiv')
    expect(z.widerruf_grund).toBeNull()
    expect(z.widerrufen_am).toBeNull()
    expect(bestand.angehoerigen_audit_log[0].aktion).toBe('zugang_erteilt')
    expect((bestand.angehoerigen_audit_log[0].details as { reaktivierung: boolean }).reaktivierung).toBe(true)
  })

  it('Reaktivieren ohne Bereichsliste wird abgewiesen — der alte Umfang gilt nicht still weiter', async () => {
    alsPdl()
    const bestand = bestandMit('widerrufen')
    mockCreateAdminClient.mockReturnValue(fakeDb(bestand))
    const res = await PATCH(patchAnfrage({ action: 'reaktivieren' }), params)
    expect(res.status).toBe(400)
    expect(bestand.angehoerigen_zugaenge[0].status).toBe('widerrufen')
  })

  it('ein bereits aktiver Zugang lässt sich nicht reaktivieren', async () => {
    alsPdl()
    const bestand = bestandMit('aktiv')
    mockCreateAdminClient.mockReturnValue(fakeDb(bestand))
    const res = await PATCH(patchAnfrage({
      action: 'reaktivieren', freigegebene_bereiche: ['termine', 'dokumente'],
    }), params)
    expect(res.status).toBe(409)
    expect(bestand.angehoerigen_zugaenge[0].freigegebene_bereiche).toEqual(['termine'])
  })

  it('Freigaben eines aktiven Zugangs lassen sich ändern und werden protokolliert', async () => {
    alsPdl()
    const bestand = bestandMit('aktiv')
    mockCreateAdminClient.mockReturnValue(fakeDb(bestand))
    const res = await PATCH(patchAnfrage({
      freigegebene_bereiche: ['termine', 'leistungen'], pflegeberichte_freigegeben: true,
    }), params)
    expect(res.status).toBe(200)
    expect(bestand.angehoerigen_zugaenge[0].freigegebene_bereiche).toEqual(['termine', 'leistungen'])
    expect(bestand.angehoerigen_zugaenge[0].pflegeberichte_freigegeben).toBe(true)
    expect(bestand.angehoerigen_audit_log[0].aktion).toBe('freigabe_geaendert')
  })

  it('ein Zugang aus einer fremden Organisation ist nicht änderbar', async () => {
    alsPdl()
    const bestand = bestandMit('aktiv')
    bestand.angehoerigen_zugaenge[0].organization_id = FREMD_ORG
    mockCreateAdminClient.mockReturnValue(fakeDb(bestand))
    const res = await PATCH(patchAnfrage({ action: 'widerrufen', grund: 'x' }), params)
    expect(res.status).toBe(409)
    expect(bestand.angehoerigen_zugaenge[0].status).toBe('aktiv')
  })

  it('unbekannte Aktion: 400', async () => {
    alsPdl()
    mockCreateAdminClient.mockReturnValue(fakeDb(bestandMit('aktiv')))
    expect((await PATCH(patchAnfrage({ action: 'loeschen' }), params)).status).toBe(400)
  })

  it('unlesbarer Body: 400 statt Ausnahme', async () => {
    alsPdl()
    mockCreateAdminClient.mockReturnValue(fakeDb(bestandMit('aktiv')))
    const req = new Request('http://x/api', { method: 'PATCH', body: 'kein json' }) as never
    expect((await PATCH(req, params)).status).toBe(400)
  })
})
