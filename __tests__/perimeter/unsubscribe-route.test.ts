/**
 * Track 13, Befund B3 — GET/POST /api/newsletter/unsubscribe.
 *
 * Der alte Zustand, hier als GEGENPROBE nachgestellt: ein GET mit nur der
 * Adresse meldete ab. Daraus folgten drei Dinge, die getrennt geprueft
 * werden, weil sie getrennte Ursachen haben:
 *
 *   1) FREMDABMELDUNG — wer eine Adresse kennt, meldet sie ab.
 *   2) DER AUTOMAT MELDET AB — Link-Vorabpruefungen im Mailweg oeffnen
 *      GET-Links beim Zustellen. RFC 8058 verlangt fuer die
 *      Ein-Klick-Abmeldung deshalb POST.
 *   3) KEIN WIRKUNGSNACHWEIS — `.update()` ohne `.select()` meldet keinen
 *      Fehler bei null getroffenen Zeilen; die Seite sagte trotzdem
 *      „erfolgreich abgemeldet".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const SCHLUESSEL = 'n'.repeat(32)

const { mockCreateAdminClient, mockRateLimit } = vi.hoisted(() => ({
  mockCreateAdminClient: vi.fn(),
  mockRateLimit: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockCreateAdminClient }))
vi.mock('@/lib/rate-limit-persistent', () => ({ rateLimitPersistent: mockRateLimit }))

import { GET, POST } from '@/app/api/newsletter/unsubscribe/route'
import { erzeugeAbmeldeToken } from '@/lib/newsletter/abmelde-token'

// ── Doppelgaenger, der jeden Schreibversuch protokolliert ────────────
interface Aufruf { tabelle: string; op: string; werte?: unknown; filter: [string, unknown][]; select?: string }

function fakeDb(treffer: { id: string }[] = [{ id: 'abo-1' }], fehler: { message: string } | null = null) {
  const aufrufe: Aufruf[] = []
  const client = {
    aufrufe,
    from(tabelle: string) {
      const a: Aufruf = { tabelle, op: 'select', filter: [] }
      aufrufe.push(a)
      const kette: Record<string, unknown> = {}
      kette.update = (werte: unknown) => { a.op = 'update'; a.werte = werte; return kette }
      kette.delete = () => { a.op = 'delete'; return kette }
      kette.eq = (spalte: string, wert: unknown) => { a.filter.push([spalte, wert]); return kette }
      kette.select = (spalten: string) => {
        a.select = spalten
        return Promise.resolve({ data: fehler ? null : treffer, error: fehler })
      }
      return kette
    },
  }
  return client
}

const urspruenglich = process.env.NEWSLETTER_ABMELDE_SECRET

beforeEach(() => {
  process.env.NEWSLETTER_ABMELDE_SECRET = SCHLUESSEL
  mockRateLimit.mockResolvedValue(true)
  mockCreateAdminClient.mockReset()
})

afterEach(() => {
  if (urspruenglich === undefined) delete process.env.NEWSLETTER_ABMELDE_SECRET
  else process.env.NEWSLETTER_ABMELDE_SECRET = urspruenglich
})

const ADRESSE = 'max@example.com'
const token = () => erzeugeAbmeldeToken(ADRESSE)

function url(params: Record<string, string>): string {
  const u = new URL('https://alltagsengel.care/api/newsletter/unsubscribe')
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return u.toString()
}

// ═══════════════════════════════════════════════════════════════════════

describe('GET — zeigt nur, meldet nicht ab', () => {
  it('GEGENPROBE zum alten Zustand: ein GET mit gueltigem Token schreibt NICHTS', async () => {
    // Genau das war der Befund. Frueher hat dieser Aufruf abgemeldet.
    const db = fakeDb()
    mockCreateAdminClient.mockReturnValue(db)

    const antwort = await GET(new Request(url({ email: ADRESSE, token: token() })))

    expect(antwort.status).toBe(200)
    expect(db.aufrufe, 'GET hat die Datenbank angefasst').toEqual([])
  })

  it('zeigt ein Formular, das per POST auf denselben Pfad geht', async () => {
    mockCreateAdminClient.mockReturnValue(fakeDb())
    const text = await (await GET(new Request(url({ email: ADRESSE, token: token() })))).text()
    expect(text).toContain('method="post"')
    expect(text).toContain('/api/newsletter/unsubscribe')
    expect(text).toContain(ADRESSE)
  })

  it('weist einen Link ohne Token ab', async () => {
    const antwort = await GET(new Request(url({ email: ADRESSE })))
    expect(antwort.status).toBe(400)
  })

  it('weist das Token einer FREMDEN Adresse ab', async () => {
    const fremd = erzeugeAbmeldeToken('opfer@example.com')
    const antwort = await GET(new Request(url({ email: ADRESSE, token: fremd })))
    expect(antwort.status).toBe(400)
  })

  it('verraet nicht, ob die Adresse im Verteiler steht', async () => {
    // Beide Faelle — Adresse bekannt oder nicht — muessen dieselbe
    // Antwort ergeben, solange das Token nicht stimmt.
    const a = await GET(new Request(url({ email: 'bekannt@example.com', token: 'falsch' })))
    const b = await GET(new Request(url({ email: 'unbekannt@example.com', token: 'falsch' })))
    expect(a.status).toBe(b.status)
    expect(await a.text()).toBe((await b.text()).replace('unbekannt@example.com', 'bekannt@example.com'))
  })
})

describe('POST — meldet ab', () => {
  async function post(felder: Record<string, string>): Promise<Response> {
    const formular = new FormData()
    for (const [k, v] of Object.entries(felder)) formular.set(k, v)
    return POST(new Request('https://alltagsengel.care/api/newsletter/unsubscribe', {
      method: 'POST',
      body: formular,
    }))
  }

  it('GEGENPROBE: mit gueltigem Token wird abgemeldet — der Weg bleibt offen', async () => {
    // Ohne diese Pruefung waere „alles gesperrt" ebenfalls gruen. Ein
    // Newsletter, von dem man sich nicht abmelden kann, ist der schwerere
    // Fehler (Art. 21 DSGVO).
    const db = fakeDb([{ id: 'abo-1' }])
    mockCreateAdminClient.mockReturnValue(db)

    const antwort = await post({ email: ADRESSE, token: token() })

    expect(antwort.status).toBe(200)
    const update = db.aufrufe.find(a => a.op === 'update')
    expect(update).toBeDefined()
    expect(update!.tabelle).toBe('newsletter_subscribers')
    expect(update!.filter).toContainEqual(['email', ADRESSE])
    expect((update!.werte as Record<string, unknown>).active).toBe(false)
  })

  it('weist einen POST ohne Token ab und schreibt nichts', async () => {
    const db = fakeDb()
    mockCreateAdminClient.mockReturnValue(db)
    const antwort = await post({ email: ADRESSE })
    expect(antwort.status).toBe(400)
    expect(db.aufrufe).toEqual([])
  })

  it('weist das Token einer FREMDEN Adresse ab und schreibt nichts', async () => {
    const db = fakeDb()
    mockCreateAdminClient.mockReturnValue(db)
    const antwort = await post({ email: ADRESSE, token: erzeugeAbmeldeToken('wer.anders@example.com') })
    expect(antwort.status).toBe(400)
    expect(db.aufrufe, 'Fremdabmeldung hat geschrieben').toEqual([])
  })

  it('normalisiert die Schreibweise der Adresse vor dem Filter', async () => {
    const db = fakeDb()
    mockCreateAdminClient.mockReturnValue(db)
    await post({ email: '  MAX@Example.COM ', token: token() })
    expect(db.aufrufe.find(a => a.op === 'update')!.filter).toContainEqual(['email', ADRESSE])
  })

  it('verlangt den Wirkungsnachweis .select("id")', async () => {
    // Ohne ihn meldet PostgREST keinen Fehler, wenn NULL Zeilen getroffen
    // wurden — die Seite behauptete dann einen Erfolg, den es nicht gab.
    const db = fakeDb()
    mockCreateAdminClient.mockReturnValue(db)
    await post({ email: ADRESSE, token: token() })
    expect(db.aufrufe.find(a => a.op === 'update')!.select).toBe('id')
  })

  it('antwortet auch dann mit Erfolg, wenn keine Zeile getroffen wurde', async () => {
    // Fuer die Person ist das Ergebnis dasselbe: sie bekommt nichts mehr.
    // Eine abweichende Antwort waere wieder ein Bestands-Orakel.
    const db = fakeDb([])
    mockCreateAdminClient.mockReturnValue(db)
    const antwort = await post({ email: ADRESSE, token: token() })
    expect(antwort.status).toBe(200)
  })

  it('meldet einen Datenbankfehler als Fehler, nicht als Erfolg', async () => {
    const db = fakeDb([], { message: 'kaputt' })
    mockCreateAdminClient.mockReturnValue(db)
    const antwort = await post({ email: ADRESSE, token: token() })
    expect(antwort.status).toBe(500)
    expect(await antwort.text()).not.toContain('erfolgreich abgemeldet')
  })

  it('greift die Ratenbegrenzung ab, bevor irgendetwas geschrieben wird', async () => {
    const db = fakeDb()
    mockCreateAdminClient.mockReturnValue(db)
    mockRateLimit.mockResolvedValue(false)
    const antwort = await post({ email: ADRESSE, token: token() })
    expect(antwort.status).toBe(429)
    expect(db.aufrufe).toEqual([])
  })

  it('nimmt die Angaben auch als JSON entgegen', async () => {
    const db = fakeDb()
    mockCreateAdminClient.mockReturnValue(db)
    const antwort = await POST(new Request('https://alltagsengel.care/api/newsletter/unsubscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: ADRESSE, token: token() }),
    }))
    expect(antwort.status).toBe(200)
    expect(db.aufrufe.find(a => a.op === 'update')).toBeDefined()
  })
})
