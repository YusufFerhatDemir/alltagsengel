// ═══════════════════════════════════════════════════════════════════════
// Wiederholungslauf — Fehlerklassen, Dead Letter, Sperre
// ═══════════════════════════════════════════════════════════════════════
//
// Geprueft wird der Worker gegen einen Zeilenspeicher, der die Regeln der
// Datenbank nachbildet: den partiellen Unique-Index auf die Erfolgszeile
// und die drei Sperr-Funktionen. Was die ECHTE Datenbank durchsetzt,
// steht in retry-worker-pglite.test.ts — dieser Test ist der schnelle
// Durchlauf ueber die Verzweigungen des Workers.
//
// Zeit wird injiziert (`jetzt`), damit Wartezeiten ohne echtes Warten
// pruefbar sind.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('resend', () => ({ Resend: class { emails = { send: async () => ({ data: null, error: null }) } } }))
vi.mock('web-push', () => ({
  default: { setVapidDetails: () => {}, sendNotification: async () => ({ statusCode: 201 }) },
}))

import { fuehreWiederholungslaufAus } from '@/lib/notifications/retry-worker'
import { registriereVorgang, _leereRegister } from '@/lib/notifications/wiederherstellung'
import { _setzeSchemaMerkerZurueck } from '@/lib/notifications/delivery-log'
import { MAX_VERSUCHE } from '@/lib/notifications/retry'
import type { SendeErgebnis } from '@/lib/notifications/retry'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const FREMD_ORG = '00000000-0000-4000-8000-0000000000ff'
const BUCHUNG = '00000000-0000-4000-8000-0000000000dd'
const EMPFAENGER = '00000000-0000-4000-8000-0000000000ee'

const MINUTE = 60_000

/**
 * Startzeitpunkt der Modelluhr: ein Tag in der Vergangenheit.
 *
 * Der Worker bekommt seine Zeit ueber `jetzt` injiziert, sendeIdempotent()
 * und die Protokollzeilen benutzen dagegen die echte Uhr. Liegt die
 * Modelluhr fest in der Vergangenheit, sind alle gesetzten Zeitstempel
 * aus Sicht der echten Uhr sicher abgelaufen — die Wartezeitpruefung
 * dort greift also nie zufaellig ein und verdeckt, was hier geprueft
 * werden soll. Relativ zu Date.now() statt auf ein festes Datum, damit
 * der Test nicht vom Systemdatum abhaengt.
 */
const T0 = Date.now() - 24 * 60 * 60_000

let uhr = T0
const jetzt = () => uhr

interface Zeile {
  id: string
  organization_id: string
  channel: string
  recipient: string
  status: string
  attempt_count: number
  correlation_id: string | null
  notification_id: string | null
  sanitized_error: string | null
  provider: string | null
  provider_message_id: string | null
  created_at: string
  attempted_at: string | null
  delivered_at: string | null
  failed_at: string | null
  queued_at: string | null
  vorgang_art: string | null
  vorgang_ref: string | null
  vorgang_empfaenger: string | null
  grund: string | null
}

interface Lauf {
  id: string
  status: string
  heartbeat_am: number
  verarbeitet: number
  dead_letter: number
  abbruchgrund: string | null
}

let zaehler = 0
function neueId(prefix: string): string {
  zaehler++
  const hex = zaehler.toString(16).padStart(12, '0')
  return `${prefix}-0000-4000-8000-${hex}`
}

function vorgangsId(): string {
  return neueId('11111111')
}

/** Zeile mit sinnvollen Vorbelegungen; `ueber` ueberschreibt gezielt. */
function zustellzeile(ueber: Partial<Zeile> = {}): Zeile {
  const t = new Date(uhr).toISOString()
  return {
    id: neueId('22222222'),
    organization_id: ORG,
    channel: 'email',
    recipient: 'kunde@example.org',
    status: 'failed',
    attempt_count: 1,
    correlation_id: vorgangsId(),
    notification_id: null,
    sanitized_error: 'Vorheriger Fehler',
    provider: 'resend',
    provider_message_id: null,
    created_at: t,
    attempted_at: t,
    delivered_at: null,
    failed_at: t,
    queued_at: null,
    vorgang_art: 'test-vorgang',
    vorgang_ref: BUCHUNG,
    vorgang_empfaenger: EMPFAENGER,
    grund: null,
    ...ueber,
  }
}

// ───────────────────────────────────────────────────────────────────────
// Zeilenspeicher mit den Regeln der Datenbank
// ───────────────────────────────────────────────────────────────────────

function macheStub(start: Zeile[] = []) {
  const zeilen: Zeile[] = [...start]
  const laeufe: Lauf[] = []
  const organisationen = [{ id: ORG }, { id: FREMD_ORG }]

  function tabelle(name: string): Zeile[] | Array<{ id: string }> {
    return name === 'organizations' ? organisationen : zeilen
  }

  function builder(name: string) {
    const gleich: Array<[string, unknown]> = []
    const drin: Array<[string, unknown[]]> = []
    const kette: Record<string, unknown> = {}

    const treffer = () =>
      (tabelle(name) as Array<Record<string, unknown>>).filter(z => {
        for (const [s, w] of gleich) if (z[s] !== w) return false
        for (const [s, w] of drin) if (!w.includes(z[s])) return false
        return true
      })

    kette.eq = (s: string, w: unknown) => { gleich.push([s, w]); return kette }
    kette.in = (s: string, w: unknown[]) => { drin.push([s, w]); return kette }
    kette.order = () => kette
    kette.limit = () => kette
    kette.then = (auf: (w: unknown) => unknown) => {
      const t = treffer()
      return Promise.resolve({ data: t, count: t.length, error: null }).then(auf)
    }
    return kette
  }

  const client = {
    from(name: string) {
      return {
        select: () => builder(name),
        insert: async (zeile: Record<string, unknown>) => {
          // Partieller Unique-Index uq_notification_delivery_log_erfolg.
          const erfolg = ['sent', 'delivered'].includes(String(zeile.status))
          if (erfolg && zeile.correlation_id) {
            const dublette = zeilen.some(
              z => z.correlation_id === zeile.correlation_id &&
                   z.channel === zeile.channel &&
                   ['sent', 'delivered'].includes(z.status)
            )
            if (dublette) return { error: { code: '23505', message: 'duplicate key' } }
          }
          zeilen.push({ ...zustellzeile(), ...(zeile as Partial<Zeile>) } as Zeile)
          return { error: null }
        },
      }
    },
    async rpc(name: string, params: Record<string, unknown> = {}) {
      if (name === 'zustellung_retry_beanspruchen') {
        const stale = (params.p_stale_minuten as number) ?? 10
        const aktiv = laeufe.find(l => l.status === 'laeuft')
        if (aktiv) {
          if (aktiv.heartbeat_am > uhr - stale * MINUTE) {
            return {
              data: null,
              error: { message: `ZUSTELLUNG_RETRY_LAEUFT: Lauf ${aktiv.id} ist aktiv.` },
            }
          }
          aktiv.heartbeat_am = uhr
          return { data: [{ lauf_id: aktiv.id, uebernommen: true }], error: null }
        }
        const neu: Lauf = {
          id: neueId('33333333'), status: 'laeuft', heartbeat_am: uhr,
          verarbeitet: 0, dead_letter: 0, abbruchgrund: null,
        }
        laeufe.push(neu)
        return { data: [{ lauf_id: neu.id, uebernommen: false }], error: null }
      }
      if (name === 'zustellung_retry_heartbeat') {
        const l = laeufe.find(x => x.id === params.p_lauf_id && x.status === 'laeuft')
        if (l) l.heartbeat_am = uhr
        return { data: Boolean(l), error: null }
      }
      if (name === 'zustellung_retry_abschliessen') {
        const l = laeufe.find(x => x.id === params.p_lauf_id && x.status === 'laeuft')
        if (l) {
          l.status = params.p_abbruchgrund ? 'abgebrochen' : 'fertig'
          l.verarbeitet = (params.p_verarbeitet as number) ?? 0
          l.dead_letter = (params.p_dead_letter as number) ?? 0
          l.abbruchgrund = (params.p_abbruchgrund as string | null) ?? null
        }
        return { data: Boolean(l), error: null }
      }
      return { data: null, error: { message: `unbekannte RPC ${name}` } }
    },
  } as unknown as SupabaseClient

  return { client, zeilen, laeufe }
}

/** Registriert einen Vorgang, dessen Versandergebnis der Test vorgibt. */
function registriereTestVorgang(ergebnis: () => Promise<SendeErgebnis>) {
  const senden = vi.fn(ergebnis)
  registriereVorgang('test-vorgang', ['email', 'push', 'in_app'], senden)
  return senden
}

function lauf(client: SupabaseClient, ueber: Record<string, unknown> = {}) {
  return fuehreWiederholungslaufAus({
    admin: client,
    jetzt,
    organisationen: [ORG],
    zeitbudgetMs: 60_000,
    ...ueber,
  })
}

beforeEach(() => {
  uhr = T0
  _leereRegister()
  _setzeSchemaMerkerZurueck()
})

// ───────────────────────────────────────────────────────────────────────

describe('Fehlerklassen: was wiederholt wird', () => {
  const voruebergehend: Array<[string, unknown]> = [
    ['RESEND voruebergehend nicht erreichbar', { statusCode: 503, message: 'Service Unavailable' }],
    ['Zeitueberschreitung', Object.assign(new Error('socket hang up ETIMEDOUT'), {})],
    ['429 Rate Limit', { statusCode: 429, message: 'Too many requests' }],
    ['5xx', { statusCode: 500, message: 'Internal Server Error' }],
  ]

  for (const [name, fehler] of voruebergehend) {
    it(`${name} → erneuter Versuch, kein Dead Letter`, async () => {
      const { client, zeilen } = macheStub([
        zustellzeile({ attempt_count: 1, attempted_at: new Date(uhr - 30 * MINUTE).toISOString() }),
      ])
      const senden = registriereTestVorgang(async () => ({ ok: false, fehler }))

      const e = await lauf(client)

      expect(senden).toHaveBeenCalledTimes(1)
      expect(e.metriken.fehlgeschlagen).toBe(1)
      expect(e.metriken.deadLetter).toBe(0)
      // Der Fehlversuch ist als eigene Zeile protokolliert — daran haengt
      // die Versuchszaehlung des naechsten Laufs.
      expect(zeilen.filter(z => z.status === 'failed')).toHaveLength(2)
      expect(zeilen.some(z => z.grund === 'dauerhaft_fehlgeschlagen')).toBe(false)
    })
  }

  it('400 mit ungueltiger Adresse → sofort Dead Letter, keine vier weiteren Versuche', async () => {
    const { client, zeilen } = macheStub([
      zustellzeile({ attempt_count: 1, attempted_at: new Date(uhr - 30 * MINUTE).toISOString() }),
    ])
    const senden = registriereTestVorgang(async () => ({
      ok: false,
      fehler: {
        statusCode: 400,
        message: 'validation_error: invalid to email address kunde@example.org (api_key=re_geheim123456789)',
      },
    }))

    const e = await lauf(client)

    expect(senden).toHaveBeenCalledTimes(1)
    expect(e.metriken.deadLetter).toBe(1)
    const tot = zeilen.find(z => z.grund === 'dauerhaft_fehlgeschlagen')
    expect(tot).toBeDefined()
    expect(tot?.status).toBe('skipped')
    // Der Fehlertext darf weder Adresse noch Schluessel enthalten.
    expect(tot?.sanitized_error).not.toContain('@')
    expect(tot?.sanitized_error).not.toContain('re_geheim123456789')
    expect(tot?.sanitized_error).toContain('validation_error')
  })

  it('nach dem Dead Letter wird der Vorgang nie wieder angefasst', async () => {
    const { client } = macheStub([
      zustellzeile({ attempt_count: 1, attempted_at: new Date(uhr - 30 * MINUTE).toISOString() }),
    ])
    const senden = registriereTestVorgang(async () => ({
      ok: false,
      fehler: { statusCode: 400, message: 'validation_error' },
    }))

    await lauf(client)
    uhr += 6 * 60 * MINUTE
    const zweiter = await lauf(client)

    expect(senden).toHaveBeenCalledTimes(1)
    expect(zweiter.metriken.verarbeitet).toBe(0)
    expect(zweiter.metriken.deadLetter).toBe(0)
  })
})

describe('Wartezeit', () => {
  it('haelt die exponentielle Wartezeit ein', async () => {
    const { client } = macheStub([
      zustellzeile({ attempt_count: 2, attempted_at: new Date(uhr - 1 * MINUTE).toISOString() }),
    ])
    const senden = registriereTestVorgang(async () => ({ ok: true }))

    // Nach dem 2. Versuch sind 5 Minuten zu warten.
    const zuFrueh = await lauf(client)
    expect(senden).not.toHaveBeenCalled()
    expect(zuFrueh.metriken.wartend).toBe(1)

    uhr += 5 * MINUTE
    const jetztGeht = await lauf(client)
    expect(senden).toHaveBeenCalledTimes(1)
    expect(jetztGeht.metriken.erfolgreich).toBe(1)
  })

  it('laesst eine frische queued-Zeile in Ruhe — der Erstversand laeuft noch', async () => {
    const { client } = macheStub([
      zustellzeile({ status: 'queued', attempt_count: 1, attempted_at: null, sanitized_error: null }),
    ])
    const senden = registriereTestVorgang(async () => ({ ok: true }))

    const e = await lauf(client)
    expect(senden).not.toHaveBeenCalled()
    expect(e.metriken.wartend).toBe(1)
  })

  it('nimmt eine haengen gebliebene queued-Zeile nach der Schwelle auf', async () => {
    const { client } = macheStub([
      zustellzeile({
        status: 'queued', attempt_count: 1, attempted_at: null, sanitized_error: null,
        created_at: new Date(uhr - 30 * MINUTE).toISOString(),
      }),
    ])
    const senden = registriereTestVorgang(async () => ({ ok: true }))

    const e = await lauf(client)
    expect(senden).toHaveBeenCalledTimes(1)
    expect(e.metriken.erfolgreich).toBe(1)
  })
})

describe('Dead Letter', () => {
  it(`gibt nach ${MAX_VERSUCHE} Versuchen auf, ohne noch einmal zu senden`, async () => {
    const { client, zeilen } = macheStub([
      zustellzeile({
        attempt_count: MAX_VERSUCHE,
        attempted_at: new Date(uhr - 24 * 60 * MINUTE).toISOString(),
      }),
    ])
    const senden = registriereTestVorgang(async () => ({ ok: true }))

    const e = await lauf(client)

    expect(senden).not.toHaveBeenCalled()
    expect(e.metriken.deadLetter).toBe(1)
    expect(zeilen.find(z => z.grund === 'max_versuche_erreicht')?.status).toBe('skipped')
  })

  it('haelt eine Zustellung ohne Vorgangsbezug zunaechst offen und gibt sie erst nach der Karenz auf', async () => {
    const { client, zeilen } = macheStub([
      zustellzeile({
        vorgang_art: null, vorgang_ref: null,
        created_at: new Date(uhr - 2 * 60 * MINUTE).toISOString(),
        attempted_at: new Date(uhr - 2 * 60 * MINUTE).toISOString(),
      }),
    ])
    registriereTestVorgang(async () => ({ ok: true }))

    const frueh = await lauf(client)
    expect(frueh.metriken.deadLetter).toBe(0)
    expect(frueh.metriken.wartend).toBe(1)

    uhr += 25 * 60 * MINUTE
    const spaet = await lauf(client)
    expect(spaet.metriken.deadLetter).toBe(1)
    expect(zeilen.some(z => z.grund === 'nicht_wiederherstellbar')).toBe(true)
  })

  it('gibt einen Vorgang auf, dessen Kanal nicht registriert ist', async () => {
    const { client } = macheStub([
      zustellzeile({
        channel: 'whatsapp', recipient: '491701234567',
        created_at: new Date(uhr - 48 * 60 * MINUTE).toISOString(),
        attempted_at: new Date(uhr - 48 * 60 * MINUTE).toISOString(),
      }),
    ])
    // 'test-vorgang' kennt whatsapp nicht.
    registriereTestVorgang(async () => ({ ok: true }))

    const e = await lauf(client)
    expect(e.metriken.deadLetter).toBe(1)
  })
})

describe('Idempotenz', () => {
  it('versendet nicht erneut, was schon zugestellt ist', async () => {
    const vorgang = vorgangsId()
    const { client } = macheStub([
      zustellzeile({ correlation_id: vorgang, status: 'failed', attempt_count: 1,
        attempted_at: new Date(uhr - 60 * MINUTE).toISOString() }),
      zustellzeile({ correlation_id: vorgang, status: 'sent', attempt_count: 2 }),
    ])
    const senden = registriereTestVorgang(async () => ({ ok: true }))

    const e = await lauf(client)

    expect(senden).not.toHaveBeenCalled()
    expect(e.metriken.verarbeitet).toBe(0)
  })

  it('fasst mehrere Fehlversuche desselben Vorgangs zu EINEM Versuch zusammen', async () => {
    const vorgang = vorgangsId()
    const alt = new Date(uhr - 6 * 60 * MINUTE).toISOString()
    const { client } = macheStub([
      zustellzeile({ correlation_id: vorgang, attempt_count: 1, created_at: alt, attempted_at: alt }),
      zustellzeile({ correlation_id: vorgang, attempt_count: 2, created_at: alt, attempted_at: alt }),
      zustellzeile({ correlation_id: vorgang, attempt_count: 3, created_at: alt, attempted_at: alt }),
    ])
    const senden = registriereTestVorgang(async () => ({ ok: true }))

    const e = await lauf(client)

    expect(senden).toHaveBeenCalledTimes(1)
    expect(e.metriken.erfolgreich).toBe(1)
  })
})

describe('Mandantengrenze', () => {
  it('fasst nur Zeilen der bearbeiteten Organisation an', async () => {
    const { client } = macheStub([
      zustellzeile({ organization_id: FREMD_ORG,
        attempted_at: new Date(uhr - 60 * MINUTE).toISOString() }),
    ])
    const senden = registriereTestVorgang(async () => ({ ok: true }))

    const e = await lauf(client, { organisationen: [ORG] })
    expect(senden).not.toHaveBeenCalled()
    expect(e.metriken.verarbeitet).toBe(0)
  })

  it('traegt die organization_id der Quellzeile in die Dead-Letter-Zeile', async () => {
    const { client, zeilen } = macheStub([
      zustellzeile({ organization_id: FREMD_ORG, attempt_count: MAX_VERSUCHE,
        attempted_at: new Date(uhr - 60 * MINUTE).toISOString() }),
    ])
    registriereTestVorgang(async () => ({ ok: true }))

    await lauf(client, { organisationen: [FREMD_ORG] })
    const tot = zeilen.find(z => z.grund === 'max_versuche_erreicht')
    expect(tot?.organization_id).toBe(FREMD_ORG)
  })
})

describe('Sperre', () => {
  it('ein zweiter Lauf laeuft nicht mit — er meldet blockiert', async () => {
    const { client } = macheStub([
      zustellzeile({ attempted_at: new Date(uhr - 60 * MINUTE).toISOString() }),
    ])
    const senden = registriereTestVorgang(async () => ({ ok: true }))

    // Erster Lauf haelt die Sperre nicht mehr (er ist fertig) — deshalb
    // wird sie hier durch einen gleichzeitigen zweiten Lauf geprueft.
    const [a, b] = await Promise.all([lauf(client), lauf(client)])
    const stati = [a.status, b.status].sort()

    expect(stati).toEqual(['blockiert', 'fertig'])
    expect(senden).toHaveBeenCalledTimes(1)
  })

  it('uebernimmt eine verwaiste Sperre, wenn der Herzschlag alt ist', async () => {
    const { client, laeufe } = macheStub([])
    registriereTestVorgang(async () => ({ ok: true }))

    laeufe.push({
      id: neueId('33333333'), status: 'laeuft', heartbeat_am: uhr - 30 * MINUTE,
      verarbeitet: 0, dead_letter: 0, abbruchgrund: null,
    })

    const e = await lauf(client)
    expect(e.status).toBe('fertig')
    expect(e.uebernommen).toBe(true)
  })

  it('gibt die Sperre auch bei einem Abbruch wieder frei', async () => {
    const { client, laeufe } = macheStub([])
    registriereTestVorgang(async () => ({ ok: true }))

    const kaputt = {
      ...client,
      from(name: string) {
        if (name === 'organizations') throw new Error('Datenbank weg')
        return (client as unknown as { from: (n: string) => unknown }).from(name)
      },
    } as unknown as SupabaseClient

    const e = await fuehreWiederholungslaufAus({ admin: kaputt, jetzt })
    expect(e.ok).toBe(false)
    expect(e.status).toBe('abgebrochen')
    expect(laeufe[0].status).toBe('abgebrochen')

    // Und der naechste Lauf kommt wieder durch.
    const danach = await lauf(client)
    expect(danach.status).toBe('fertig')
  })
})

describe('Absturzsicherheit', () => {
  it('macht nach einem abgebrochenen Lauf bei den restlichen Vorgaengen weiter', async () => {
    const alt = new Date(uhr - 6 * 60 * MINUTE).toISOString()
    const zehn = Array.from({ length: 10 }, () =>
      zustellzeile({ attempt_count: 1, created_at: alt, attempted_at: alt })
    )
    const { client } = macheStub(zehn)
    const senden = registriereTestVorgang(async () => ({ ok: true }))

    const erster = await lauf(client, { maxVorgaenge: 3 })
    expect(erster.status).toBe('abgebrochen')
    expect(erster.grund).toBe('obergrenze_erreicht')
    expect(erster.metriken.erfolgreich).toBe(3)

    const zweiter = await lauf(client)
    // Die drei erledigten sind jetzt 'sent' und fallen aus der Auswahl —
    // der zweite Lauf faengt bei Nummer vier an.
    expect(zweiter.metriken.erfolgreich).toBe(7)
    expect(senden).toHaveBeenCalledTimes(10)
  })

  it('haelt das Zeitbudget ein und meldet den Abbruchgrund', async () => {
    const alt = new Date(uhr - 6 * 60 * MINUTE).toISOString()
    const { client } = macheStub(
      Array.from({ length: 5 }, () => zustellzeile({ created_at: alt, attempted_at: alt }))
    )
    // Jeder Versand kostet 40 Sekunden Modellzeit.
    registriereTestVorgang(async () => { uhr += 40_000; return { ok: true } })

    const e = await lauf(client, { zeitbudgetMs: 60_000 })
    expect(e.status).toBe('abgebrochen')
    expect(e.grund).toBe('zeitbudget_erschoepft')
    expect(e.metriken.erfolgreich).toBeLessThan(5)
  })
})

describe('Schema-Voraussetzung', () => {
  it('verweigert den Lauf, wenn die Vorgangsspalten fehlen', async () => {
    const { client } = macheStub([])
    const ohneSpalten = {
      ...client,
      from() {
        return {
          select: () => ({
            eq: () => ohneSpalten.from().select(),
            in: () => ohneSpalten.from().select(),
            order: () => ohneSpalten.from().select(),
            limit: () => ohneSpalten.from().select(),
            then: (auf: (w: unknown) => unknown) =>
              Promise.resolve({ data: null, error: { code: '42703', message: 'column does not exist' } }).then(auf),
          }),
        }
      },
    } as unknown as SupabaseClient & { from: () => { select: () => Record<string, unknown> } }

    const e = await fuehreWiederholungslaufAus({ admin: ohneSpalten as unknown as SupabaseClient, jetzt })
    expect(e.ok).toBe(false)
    expect(e.status).toBe('nicht_bereit')
    expect(e.grund).toContain('20260927000000')
  })
})
