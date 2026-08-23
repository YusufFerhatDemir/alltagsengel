// ═══════════════════════════════════════════════════════════════════════
// Zustellspur — Sanitisierung, Protokoll, Idempotenz
// ═══════════════════════════════════════════════════════════════════════
// Geprueft wird die Entscheidungslogik, nicht Resend/Meta/web-push. Die
// Datenbank ist ein Stub: er protokolliert, was geschrieben werden soll,
// und kann Fehler (inkl. 23505) gezielt liefern.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  sanitisiereFehler,
  protokolliereZustellung,
  bereitsZugestellt,
  vorgangsId,
} from '@/lib/notifications/delivery-log'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const VORGANG = '00000000-0000-4000-8000-0000000000bb'

interface StubOptionen {
  /** Vorhandene Zeilen (fuer count-Abfragen). */
  count?: number
  /** Fehler beim Insert. */
  insertError?: { code?: string; message: string } | null
  /** Fehler beim Lesen. */
  selectError?: { message: string } | null
}

function makeStub(opts: StubOptionen = {}) {
  const protokoll = { inserts: [] as Record<string, unknown>[] }

  const abfrage = () => {
    const kette: Record<string, unknown> = {}
    const weiter = () => kette
    kette.eq = weiter
    kette.in = weiter
    kette.order = weiter
    kette.limit = weiter
    kette.then = (aufloesen: (w: unknown) => unknown) =>
      Promise.resolve(
        opts.selectError
          ? { data: null, count: null, error: opts.selectError }
          : { data: [], count: opts.count ?? 0, error: null }
      ).then(aufloesen)
    return kette
  }

  const client = {
    from() {
      return {
        select: () => abfrage(),
        insert: async (zeile: Record<string, unknown>) => {
          protokoll.inserts.push(zeile)
          return { error: opts.insertError ?? null }
        },
      }
    },
  } as unknown as SupabaseClient

  return { client, protokoll }
}

describe('sanitisiereFehler', () => {
  it('entfernt Bearer-Token', () => {
    const t = sanitisiereFehler('Request failed: Authorization: Bearer abc123DEF456ghi789')
    expect(t).not.toContain('abc123DEF456ghi789')
    expect(t).toContain('[entfernt]')
  })

  it('entfernt Resend- und Supabase-Schluessel', () => {
    const t = sanitisiereFehler('key re_AbCdEf123456 und sb_secret_XyZ9876543 abgelehnt')!
    expect(t).not.toContain('AbCdEf123456')
    expect(t).not.toContain('XyZ9876543')
  })

  it('entfernt dreiteilige Token im JWT-Format', () => {
    const token = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NSJ9', 'abcdefghijkl'].join('.')
    const t = sanitisiereFehler(`invalid token ${token}`)!
    expect(t).not.toContain('eyJzdWIiOiIxMjM0NSJ9')
    expect(t).toContain('[token entfernt]')
  })

  it('entfernt E-Mail-Adressen und Telefonnummern', () => {
    const t = sanitisiereFehler('Zustellung an erika.mustermann@example.org (+49 170 1234567) gescheitert')!
    expect(t).not.toContain('erika.mustermann@example.org')
    expect(t).not.toContain('1234567')
    expect(t).toContain('[email entfernt]')
  })

  it('entfernt IBANs', () => {
    const t = sanitisiereFehler('Konto DE87100101234463569020 unbekannt')!
    expect(t).not.toContain('DE87100101234463569020')
  })

  it('schneidet Query-Strings von URLs ab', () => {
    const t = sanitisiereFehler('POST https://api.example.org/send?access_token=geheim123 failed')!
    expect(t).not.toContain('geheim123')
  })

  it('nimmt den Stack NICHT mit', () => {
    const err = new Error('Boom')
    const t = sanitisiereFehler(err)!
    expect(t).toBe('Boom')
    expect(t).not.toContain('at ')
  })

  it('kuerzt auf 500 Zeichen', () => {
    const t = sanitisiereFehler('x'.repeat(2000))!
    expect(t.length).toBeLessThanOrEqual(500)
  })

  it('liefert null fuer null/undefined', () => {
    expect(sanitisiereFehler(null)).toBeNull()
    expect(sanitisiereFehler(undefined)).toBeNull()
  })

  it('faellt bei nicht darstellbaren Werten auf einen Platzhalter zurueck', () => {
    const zirkulaer: Record<string, unknown> = {}
    zirkulaer.selbst = zirkulaer
    expect(sanitisiereFehler(zirkulaer)).toBe('Fehler nicht darstellbar')
  })
})

describe('vorgangsId', () => {
  it('ist reproduzierbar', () => {
    expect(vorgangsId('booking-neu', 'b1', 'u1')).toBe(vorgangsId('booking-neu', 'b1', 'u1'))
  })

  it('trennt Ereignisse derselben Buchung', () => {
    expect(vorgangsId('booking-neu', 'b1', 'u1')).not.toBe(vorgangsId('booking-zusage', 'b1', 'u1'))
  })

  it('erzeugt eine gueltige UUID v5', () => {
    expect(vorgangsId('a', 'b')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })
})

describe('protokolliereZustellung', () => {
  it('schreibt eine Zeile mit sanitisiertem Fehler', async () => {
    const { client, protokoll } = makeStub()
    const r = await protokolliereZustellung(
      {
        organizationId: ORG,
        correlationId: VORGANG,
        channel: 'email',
        recipient: 'kunde@example.org',
        status: 'failed',
        provider: 'resend',
        fehler: 'Bearer geheimtoken123456 abgelehnt',
      },
      client
    )
    expect(r.ok).toBe(true)
    expect(protokoll.inserts).toHaveLength(1)
    const zeile = protokoll.inserts[0]
    expect(zeile.channel).toBe('email')
    expect(zeile.status).toBe('failed')
    expect(zeile.failed_at).toBeTruthy()
    expect(zeile.delivered_at).toBeNull()
    expect(String(zeile.sanitized_error)).not.toContain('geheimtoken123456')
  })

  it('setzt delivered_at bei Erfolg', async () => {
    const { client, protokoll } = makeStub()
    await protokolliereZustellung(
      { organizationId: ORG, channel: 'in_app', recipient: 'u1', status: 'delivered' },
      client
    )
    expect(protokoll.inserts[0].delivered_at).toBeTruthy()
    expect(protokoll.inserts[0].failed_at).toBeNull()
  })

  it('zaehlt den Versuch anhand der bisherigen Zeilen hoch', async () => {
    const { client, protokoll } = makeStub({ count: 2 })
    await protokolliereZustellung(
      { organizationId: ORG, correlationId: VORGANG, channel: 'email', recipient: 'a@b.de', status: 'failed' },
      client
    )
    expect(protokoll.inserts[0].attempt_count).toBe(3)
  })

  it('schreibt ohne gueltige Organisation nichts', async () => {
    const { client, protokoll } = makeStub()
    const r = await protokolliereZustellung(
      { organizationId: 'keine-uuid', channel: 'email', recipient: 'a@b.de', status: 'sent' },
      client
    )
    expect(r.ok).toBe(false)
    expect(protokoll.inserts).toHaveLength(0)
  })

  it('meldet 23505 als Dublette, nicht als Fehler', async () => {
    const { client } = makeStub({ insertError: { code: '23505', message: 'duplicate key' } })
    const r = await protokolliereZustellung(
      { organizationId: ORG, correlationId: VORGANG, channel: 'email', recipient: 'a@b.de', status: 'sent' },
      client
    )
    expect(r.doppelt).toBe(true)
    expect(r.ok).toBe(false)
  })

  it('bleibt folgenlos, wenn die Tabelle fehlt', async () => {
    const { client } = makeStub({ insertError: { code: '42P01', message: 'relation does not exist' } })
    const r = await protokolliereZustellung(
      { organizationId: ORG, channel: 'email', recipient: 'a@b.de', status: 'sent' },
      client
    )
    expect(r.ok).toBe(false)
    expect(r.doppelt).toBe(false)
  })

  it('verwirft eine correlation_id, die keine UUID ist', async () => {
    const { client, protokoll } = makeStub()
    await protokolliereZustellung(
      { organizationId: ORG, correlationId: 'RE-2026-00042', channel: 'email', recipient: 'a@b.de', status: 'sent' },
      client
    )
    expect(protokoll.inserts[0].correlation_id).toBeNull()
  })
})

describe('bereitsZugestellt — fail-closed', () => {
  it('meldet true, wenn eine Erfolgszeile existiert', async () => {
    const { client } = makeStub({ count: 1 })
    expect(await bereitsZugestellt({ correlationId: VORGANG, channel: 'email' }, client)).toBe(true)
  })

  it('meldet false, wenn keine Erfolgszeile existiert', async () => {
    const { client } = makeStub({ count: 0 })
    expect(await bereitsZugestellt({ correlationId: VORGANG, channel: 'email' }, client)).toBe(false)
  })

  it('meldet true bei Lesefehler — lieber keine Nachricht als eine doppelte', async () => {
    const { client } = makeStub({ selectError: { message: 'relation does not exist' } })
    expect(await bereitsZugestellt({ correlationId: VORGANG, channel: 'email' }, client)).toBe(true)
  })

  it('meldet true ohne gueltige correlation_id', async () => {
    const { client } = makeStub({ count: 0 })
    expect(await bereitsZugestellt({ correlationId: 'kaputt', channel: 'email' }, client)).toBe(true)
  })
})
