/**
 * Der Brute-Force-Schutz konnte vollständig fehlen — ohne ein Wort
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 66)
 *
 * Jeder Zugriff dieser Route auf `login_rate_limits` verwarf sein Ergebnis:
 *
 *   1. `getEntry` las mit `const { data } = … .single()`. `null` heißt beim
 *      Aufrufer „kein Eintrag" — also „nicht gesperrt". Ein
 *      Verbindungsabbruch, eine Schemadrift oder eine entzogene
 *      Berechtigung sahen damit exakt so aus wie ein unbescholtener
 *      Anmeldeversuch: `check` antwortete `allowed: true`, und nirgends
 *      fiel ein Wort darüber.
 *   2. `upsertEntry` wartete sein Versprechen nur ab. Schlug es fehl, blieb
 *      der Zähler stehen — und mit ihm die Sperre, die sich aus ihm
 *      aufbaut.
 *   3. Die beiden Löschungen nach erfolgreicher Anmeldung ebenso: der
 *      Nutzer hatte sich ausgewiesen, sein Zähler stand weiter, und beim
 *      nächsten Vertipper sperrte ihn die Route aus seinem eigenen Konto.
 *
 * Live gemessen: 32 Zeilen, bis zu 6 Fehlversuche — die Tabelle ist in
 * Gebrauch, der Schutz also keine Theorie.
 *
 * FAIL-OPEN BLEIBT. Die Route blockiert Anmeldungen nicht, wenn ihr
 * Zählwerk streikt (Begründung im Catch am Ende der Datei). Geändert wurde
 * nur, dass es hörbar geschieht — und dass im Protokoll weder die
 * E-Mail-Adresse noch die IP landet.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync } from 'node:fs'

type Antwort = { data: unknown; error: { message: string; code?: string } | null }

const zustand: {
  leseAntwort: Antwort
  upsertAntwort: Antwort
  loeschAntwort: Antwort
  geloescht: string[]
} = {
  leseAntwort: { data: null, error: null },
  upsertAntwort: { data: null, error: null },
  loeschAntwort: { data: null, error: null },
  geloescht: [],
}

const { fehlerLog } = vi.hoisted(() => ({ fehlerLog: vi.fn() }))

vi.mock('@/lib/logger', () => ({
  logger: { child: () => ({ error: fehlerLog, warn: vi.fn(), info: vi.fn(), debug: vi.fn(), errorWithException: vi.fn() }) },
}))
vi.mock('@/lib/monitoring/tracker', () => ({ withTracking: (f: unknown) => f }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'kunde@example.de' } }, error: null }) },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => zustand.leseAntwort }) }),
      upsert: async () => zustand.upsertAntwort,
      delete: () => ({
        eq: async (_s: string, key: string) => {
          zustand.geloescht.push(key)
          return zustand.loeschAntwort
        },
      }),
    }),
  }),
}))

import { POST } from '@/app/api/auth/check-rate-limit/route'

function anfrage(body: Record<string, unknown>) {
  return new NextRequest('https://alltagsengel.care/api/auth/check-rate-limit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
    body: JSON.stringify(body),
  })
}

async function ruf(body: Record<string, unknown>) {
  const res = await POST(anfrage(body) as never)
  return { status: res.status, body: await res.json() }
}

/** Alle Protokolltexte und alle mitgegebenen Felder als ein Text. */
function protokollText(): string {
  return fehlerLog.mock.calls.map(c => JSON.stringify(c)).join('\n')
}

beforeEach(() => {
  vi.clearAllMocks()
  zustand.leseAntwort = { data: null, error: null }
  zustand.upsertAntwort = { data: null, error: null }
  zustand.loeschAntwort = { data: null, error: null }
  zustand.geloescht = []
})

describe("action 'check' — ein Lesefehler ist keine Unbescholtenheit", () => {
  it('antwortet weiterhin fail-open', async () => {
    zustand.leseAntwort = { data: null, error: { message: 'connection reset', code: '08006' } }
    const res = await ruf({ email: 'kunde@example.de', action: 'check' })
    expect(res.status).toBe(200)
    expect(res.body.allowed).toBe(true)
  })

  it('sagt es aber', async () => {
    zustand.leseAntwort = { data: null, error: { message: 'connection reset', code: '08006' } }
    await ruf({ email: 'kunde@example.de', action: 'check' })
    expect(fehlerLog).toHaveBeenCalled()
    expect(protokollText()).toMatch(/nicht lesbar/)
  })

  it('schweigt, wenn es schlicht keinen Eintrag gibt', async () => {
    // Der haeufigste Normalfall. Ein Protokolleintrag darauf waere Laerm.
    zustand.leseAntwort = { data: null, error: null }
    await ruf({ email: 'kunde@example.de', action: 'check' })
    expect(fehlerLog).not.toHaveBeenCalled()
  })

  it('erkennt eine bestehende Sperre unverändert', async () => {
    const bis = new Date(Date.now() + 600000).toISOString()
    zustand.leseAntwort = {
      data: { key: 'ip:203.0.113.7', attempts: 5, first_attempt: bis, locked_until: bis },
      error: null,
    }
    const res = await ruf({ email: 'kunde@example.de', action: 'check' })
    expect(res.body.allowed).toBe(false)
    expect(res.body.locked).toBe(true)
  })
})

describe("action 'fail' — ein nicht gezählter Versuch", () => {
  it('wird protokolliert', async () => {
    zustand.upsertAntwort = { data: null, error: { message: 'permission denied', code: '42501' } }
    await ruf({ email: 'kunde@example.de', action: 'fail' })
    expect(protokollText()).toMatch(/NICHT gezaehlt/)
  })

  it('nennt beide betroffenen Zähler', async () => {
    zustand.upsertAntwort = { data: null, error: { message: 'permission denied', code: '42501' } }
    await ruf({ email: 'kunde@example.de', action: 'fail' })
    expect(protokollText()).toContain('ip')
    expect(protokollText()).toContain('email')
  })

  it('schweigt, wenn gezählt wurde', async () => {
    await ruf({ email: 'kunde@example.de', action: 'fail' })
    expect(fehlerLog).not.toHaveBeenCalled()
  })
})

describe("action 'success' — der Zähler, der stehen bleibt", () => {
  it('protokolliert eine fehlgeschlagene Löschung', async () => {
    zustand.loeschAntwort = { data: null, error: { message: 'connection reset', code: '08006' } }
    const res = await ruf({ email: 'kunde@example.de', action: 'success' })
    expect(res.body.ok).toBe(true)
    expect(protokollText()).toMatch(/NICHT geloescht/)
  })

  it('schweigt bei null getroffenen Zeilen — es gab schlicht keinen Zähler', async () => {
    // Hier ist die Zeilenzahl bewusst KEIN Signal: wer sich nie vertippt
    // hat, hat auch keinen Eintrag.
    zustand.loeschAntwort = { data: null, error: null }
    await ruf({ email: 'kunde@example.de', action: 'success' })
    expect(fehlerLog).not.toHaveBeenCalled()
  })

  it('löscht weiterhin den E-Mail-Zähler', async () => {
    await ruf({ email: 'Kunde@Example.de', action: 'success' })
    expect(zustand.geloescht).toContain('email:kunde@example.de')
  })
})

describe('Das Protokoll trägt keine personenbezogenen Daten', () => {
  it('weder Adresse noch IP — nur die Art des Zählers', async () => {
    zustand.leseAntwort = { data: null, error: { message: 'x', code: '08006' } }
    zustand.upsertAntwort = { data: null, error: { message: 'x', code: '08006' } }
    await ruf({ email: 'kunde@example.de', action: 'fail' })
    expect(fehlerLog).toHaveBeenCalled()
    const text = protokollText()
    expect(text).not.toContain('kunde@example.de')
    expect(text).not.toContain('203.0.113.7')
  })
})

describe('Quelltext', () => {
  const QUELLE = readFileSync('app/api/auth/check-rate-limit/route.ts', 'utf8')

  it('liest mit maybeSingle — sonst wäre der Normalfall ein Fehler', () => {
    expect(QUELLE).toContain('.maybeSingle()')
    expect(QUELLE).not.toMatch(/\.eq\('key', key\)\s*\n\s*\.single\(\)/)
  })

  it('kein blindes `await supabase` mehr auf login_rate_limits', () => {
    expect(QUELLE).not.toMatch(/^\s*await supabase\s*\n?\s*\.?from\('login_rate_limits'\)/m)
  })

  it('die Ausnahme von der Zeilenprüfung ist begründet, nicht vergessen', () => {
    const rumpf = QUELLE.slice(
      QUELLE.indexOf('ABSICHTLICH OHNE ZEILENPRUEFUNG'),
      QUELLE.indexOf('export const POST'),
    )
    expect(rumpf).toMatch(/Normalfall/)
    expect(rumpf).toContain('async function deleteEntry')
  })
})
