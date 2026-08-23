// ═══════════════════════════════════════════════════════════════════════
// Wiederholung von Benachrichtigungen — Idempotenz und Sperren
// ═══════════════════════════════════════════════════════════════════════
// Der Kern: derselbe Vorgang darf auf demselben Kanal genau EINMAL
// zugestellt werden — auch wenn der Lauf zweimal startet.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendeIdempotent, wartezeitMinuten, MAX_VERSUCHE, offeneZustellungen } from '@/lib/notifications/retry'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const VORGANG = '00000000-0000-4000-8000-0000000000bb'

interface Zeile {
  id?: string
  status: string
  channel: string
  correlation_id?: string | null
  attempt_count?: number
  attempted_at?: string | null
  created_at?: string
  recipient?: string
  notification_id?: string | null
  sanitized_error?: string | null
}

/**
 * Stub mit echtem Zeilenspeicher: Inserts landen im selben Array, das
 * die Leseabfragen bedient. Damit wirkt die Idempotenz genau so wie in
 * der Datenbank — der zweite Lauf sieht, was der erste geschrieben hat.
 */
function makeStub(start: Zeile[] = [], opts: { lesefehler?: boolean } = {}) {
  const zeilen: Zeile[] = [...start]

  function filterAnwenden(filter: Array<[string, unknown]>, inFilter: Array<[string, unknown[]]>) {
    return zeilen.filter(z => {
      for (const [spalte, wert] of filter) {
        if ((z as Record<string, unknown>)[spalte] !== wert) return false
      }
      for (const [spalte, werte] of inFilter) {
        if (!werte.includes((z as Record<string, unknown>)[spalte])) return false
      }
      return true
    })
  }

  const client = {
    from() {
      return {
        select: () => {
          const filter: Array<[string, unknown]> = []
          const inFilter: Array<[string, unknown[]]> = []
          const kette: Record<string, unknown> = {}
          kette.eq = (s: string, w: unknown) => { filter.push([s, w]); return kette }
          kette.in = (s: string, w: unknown[]) => { inFilter.push([s, w]); return kette }
          kette.order = () => kette
          kette.limit = () => kette
          kette.then = (aufloesen: (w: unknown) => unknown) => {
            if (opts.lesefehler) {
              return Promise.resolve({ data: null, count: null, error: { message: 'kaputt' } }).then(aufloesen)
            }
            const treffer = filterAnwenden(filter, inFilter)
            return Promise.resolve({ data: treffer, count: treffer.length, error: null }).then(aufloesen)
          }
          return kette
        },
        insert: async (zeile: Record<string, unknown>) => {
          // Partial-Unique-Index nachbilden.
          const erfolg = ['sent', 'delivered'].includes(String(zeile.status))
          if (erfolg && zeile.correlation_id) {
            const dublette = zeilen.some(
              z => z.correlation_id === zeile.correlation_id &&
                   z.channel === zeile.channel &&
                   ['sent', 'delivered'].includes(z.status)
            )
            if (dublette) return { error: { code: '23505', message: 'duplicate key' } }
          }
          zeilen.push(zeile as unknown as Zeile)
          return { error: null }
        },
      }
    },
  } as unknown as SupabaseClient

  return { client, zeilen }
}

const basis = {
  kontext: { organizationId: ORG, correlationId: VORGANG },
  channel: 'email' as const,
  provider: 'resend' as const,
  recipient: 'kunde@example.org',
}

describe('sendeIdempotent', () => {
  it('versendet beim ersten Lauf und protokolliert', async () => {
    const { client, zeilen } = makeStub()
    const senden = vi.fn(async () => ({ ok: true, providerMessageId: 'msg-1' }))
    const r = await sendeIdempotent({ ...basis, senden, admin: client })

    expect(senden).toHaveBeenCalledTimes(1)
    expect(r.status).toBe('versendet')
    expect(r.versuch).toBe(1)
    expect(zeilen.filter(z => z.status === 'sent')).toHaveLength(1)
  })

  it('sendet beim zweiten Lauf desselben Vorgangs NICHT erneut', async () => {
    const { client } = makeStub()
    const senden = vi.fn(async () => ({ ok: true, providerMessageId: 'msg-1' }))

    await sendeIdempotent({ ...basis, senden, admin: client })
    const zweiter = await sendeIdempotent({ ...basis, senden, admin: client })

    expect(senden).toHaveBeenCalledTimes(1)
    expect(zweiter.status).toBe('bereits_zugestellt')
  })

  it('trennt Kanaele: derselbe Vorgang darf per WhatsApp trotzdem raus', async () => {
    const { client } = makeStub()
    const senden = vi.fn(async () => ({ ok: true }))

    await sendeIdempotent({ ...basis, senden, admin: client })
    const whatsapp = await sendeIdempotent({
      ...basis,
      channel: 'whatsapp',
      provider: 'whatsapp_api',
      recipient: '491701234567',
      senden,
      admin: client,
    })

    expect(senden).toHaveBeenCalledTimes(2)
    expect(whatsapp.status).toBe('versendet')
  })

  it('protokolliert Fehlversuche und laesst Wiederholung zu', async () => {
    const { client, zeilen } = makeStub()
    const senden = vi.fn(async () => ({ ok: false, fehler: 'Resend 500' }))

    const r = await sendeIdempotent({ ...basis, senden, admin: client })
    expect(r.status).toBe('fehlgeschlagen')
    expect(zeilen.filter(z => z.status === 'failed')).toHaveLength(1)

    // Wartezeit ignorieren (manueller Nachversand)
    const zweiter = await sendeIdempotent({ ...basis, senden, admin: client, sofort: true })
    expect(zweiter.status).toBe('fehlgeschlagen')
    expect(zweiter.versuch).toBe(2)
  })

  it('haelt die Wartezeit zwischen zwei Versuchen ein', async () => {
    const { client } = makeStub([
      {
        status: 'failed',
        channel: 'email',
        correlation_id: VORGANG,
        attempt_count: 1,
        attempted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      },
    ])
    const senden = vi.fn(async () => ({ ok: true }))
    const r = await sendeIdempotent({ ...basis, senden, admin: client })

    expect(r.status).toBe('wartet')
    expect(senden).not.toHaveBeenCalled()
  })

  it('gibt nach MAX_VERSUCHE auf', async () => {
    const alt = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
    const { client } = makeStub(
      Array.from({ length: MAX_VERSUCHE }, () => ({
        status: 'failed',
        channel: 'email',
        correlation_id: VORGANG,
        attempt_count: 1,
        attempted_at: alt,
        created_at: alt,
      }))
    )
    const senden = vi.fn(async () => ({ ok: true }))
    const r = await sendeIdempotent({ ...basis, senden, admin: client })

    expect(r.status).toBe('aufgegeben')
    expect(senden).not.toHaveBeenCalled()
  })

  it('zaehlt uebersprungene Laeufe nicht gegen die Obergrenze', async () => {
    const { client, zeilen } = makeStub()
    const senden = vi.fn(async () => ({ ok: false, uebersprungen: true, fehler: 'kein API-Key' }))

    const r = await sendeIdempotent({ ...basis, senden, admin: client })
    expect(r.status).toBe('uebersprungen')
    expect(zeilen.filter(z => z.status === 'skipped')).toHaveLength(1)

    // Naechster Lauf mit Key: es wird versendet, Versuchsnummer bleibt 1.
    const senden2 = vi.fn(async () => ({ ok: true }))
    const zweiter = await sendeIdempotent({ ...basis, senden: senden2, admin: client })
    expect(zweiter.status).toBe('versendet')
    expect(zweiter.versuch).toBe(1)
  })

  it('behandelt eine Ausnahme im Versand als Fehlversuch', async () => {
    const { client, zeilen } = makeStub()
    const senden = vi.fn(async () => { throw new Error('Netzwerk weg') })
    const r = await sendeIdempotent({ ...basis, senden, admin: client })

    expect(r.status).toBe('fehlgeschlagen')
    expect(zeilen[0].status).toBe('failed')
  })

  it('sendet NICHT, wenn die Zustellspur nicht lesbar ist (fail-closed)', async () => {
    const { client } = makeStub([], { lesefehler: true })
    const senden = vi.fn(async () => ({ ok: true }))
    const r = await sendeIdempotent({ ...basis, senden, admin: client })

    expect(senden).not.toHaveBeenCalled()
    expect(r.status).toBe('bereits_zugestellt')
  })

  it('meldet eine parallel entstandene Dublette, statt sie zu verschweigen', async () => {
    // Erfolgszeile existiert schon, aber die Vorabpruefung wird umgangen,
    // indem der Vorgang unter einem anderen Status vorliegt: hier wird
    // der Unique-Index direkt getroffen.
    const { client } = makeStub()
    const senden = vi.fn(async () => ({ ok: true }))
    await sendeIdempotent({ ...basis, senden, admin: client })

    // Zweiter Lauf mit abweichender Organisation umgeht die Vorabpruefung
    // (die filtert auf organization_id), trifft aber den Index.
    const r = await sendeIdempotent({
      ...basis,
      kontext: { organizationId: '00000000-0000-4000-8000-0000000000cc', correlationId: VORGANG },
      senden,
      admin: client,
      sofort: true,
    })
    expect(r.status).toBe('versendet')
  })
})

describe('wartezeitMinuten', () => {
  it('waechst exponentiell und deckelt', () => {
    expect(wartezeitMinuten(0)).toBe(0)
    expect(wartezeitMinuten(1)).toBe(1)
    expect(wartezeitMinuten(2)).toBe(5)
    expect(wartezeitMinuten(3)).toBe(15)
    expect(wartezeitMinuten(4)).toBe(60)
    expect(wartezeitMinuten(5)).toBe(240)
    expect(wartezeitMinuten(99)).toBe(240)
  })
})

describe('offeneZustellungen', () => {
  it('blendet Vorgaenge aus, die spaeter doch zugestellt wurden', async () => {
    const jetzt = new Date().toISOString()
    const { client } = makeStub([
      { id: 'a', status: 'failed', channel: 'email', correlation_id: VORGANG, recipient: 'a@b.de', attempt_count: 1, created_at: jetzt, attempted_at: jetzt },
      { id: 'b', status: 'sent', channel: 'email', correlation_id: VORGANG, recipient: 'a@b.de', attempt_count: 2, created_at: jetzt, attempted_at: jetzt },
    ].map(z => ({ ...z, organization_id: ORG } as never)))

    const offen = await offeneZustellungen(ORG, { admin: client })
    expect(offen).toHaveLength(0)
  })

  it('markiert aufgegebene Vorgaenge', async () => {
    const jetzt = new Date().toISOString()
    const { client } = makeStub([
      { id: 'a', status: 'failed', channel: 'email', correlation_id: VORGANG, recipient: 'a@b.de', attempt_count: MAX_VERSUCHE, created_at: jetzt, attempted_at: jetzt, organization_id: ORG } as never,
    ])
    const offen = await offeneZustellungen(ORG, { admin: client })
    expect(offen).toHaveLength(1)
    expect(offen[0].aufgegeben).toBe(true)
  })
})
