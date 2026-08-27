/**
 * Angehörigenportal — die fünf Portal-Routen
 *
 * Geprüft werden vier Befunde vom 27.08.2026, jeder mit Positiv- UND
 * Gegenprobe:
 *
 *  1. DASHBOARD OHNE FREIGABEPRÜFUNG. GET /api/angehoerige/portal
 *     sammelte die Klienten-IDs aus ALLEN Zugängen und lieferte darauf
 *     Pflegegrad, Terminzahl und die letzten fünf Leistungen — auch dem
 *     Angehörigen, dem nur „Dokumente" freigegeben war.
 *
 *  2. TERMINE AUS DER FALSCHEN TABELLE. Die Route las `bookings` und
 *     filterte `.in('customer_id', <clients.id>)`. `bookings.customer_id`
 *     zeigt per Fremdschlüssel auf `profiles`, `care_recipient_id` auf
 *     `care_recipients` — ein clients.id-Filter konnte nie treffen, die
 *     Seite war dauerhaft leer. Quelle sind jetzt die Einsätze.
 *
 *  3. PFLEGEBERICHT-FREITEXT OHNE ZWEITE FREIGABE. Der Kopfkommentar
 *     verlangte „sowohl leistungen als auch pflegeberichte", der Code
 *     bildete die Vereinigung. Wer nur „Leistungen" hatte, bekam `notes`
 *     — und `notes` ist der Bericht.
 *
 *  4. ZUGRIFFSPROTOKOLL SCHRIEB NIE. `angehoerigen_audit_log` hat nur
 *     eine Policy für `is_admin()`; der Eintrag lief mit dem RLS-Client
 *     und der Fehler wurde als „non-blocking" verschluckt. Live: 0
 *     Zeilen. Jetzt schreibt der Dienstschlüssel — und zwar fail-closed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const ORG = 'org-1'
const FREMD_ORG = 'org-2'
const USER = 'user-angeh-1'
const K1 = 'client-1'
const K2 = 'client-2'

const { mockCreateClient, mockCreateAdminClient, mockResolveUserOrgId } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockResolveUserOrgId: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mockCreateAdminClient }))
vi.mock('@/lib/organizations/server', () => ({
  resolveUserOrgId: mockResolveUserOrgId,
  getActiveOrgId: mockResolveUserOrgId,
}))

import { GET as DASHBOARD } from '@/app/api/angehoerige/portal/route'
import { GET as TERMINE } from '@/app/api/angehoerige/portal/termine/route'
import { GET as BERICHTE } from '@/app/api/angehoerige/portal/pflegebericht/route'
import { GET as DOKUMENTE } from '@/app/api/angehoerige/portal/dokumente/route'
import { GET as NACHRICHTEN, POST as SENDEN } from '@/app/api/angehoerige/portal/kommunikation/route'

// ── Zugänge ────────────────────────────────────────────────────────
type Bereich = 'termine' | 'leistungen' | 'pflegeberichte' | 'dokumente' | 'nachrichten'

function zugang(
  clientId: string,
  bereiche: Bereich[] | unknown,
  extra: Record<string, unknown> = {},
) {
  return {
    id: `zugang-${clientId}`,
    organization_id: ORG,
    user_id: USER,
    client_id: clientId,
    rolle: 'angehoeriger',
    status: 'aktiv',
    freigegebene_bereiche: bereiche,
    pflegeberichte_freigegeben: false,
    erteilt_von: null,
    erteilt_am: '2026-01-01T00:00:00Z',
    widerrufen_von: null,
    widerrufen_am: null,
    widerruf_grund: null,
    gueltig_bis: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...extra,
  }
}

// ── Doppelgänger: RLS-Client (Sitzung) ─────────────────────────────
function rlsClient(zugaenge: unknown[], rolle = 'angehoerige', user: string | null = USER) {
  return {
    auth: {
      getUser: async () => (user
        ? { data: { user: { id: user } }, error: null }
        : { data: { user: null }, error: { message: 'kein Login' } }),
    },
    from(tabelle: string) {
      const kette: Record<string, unknown> = {}
      const gib = () => kette
      for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit', 'gte']) {
        ;(kette as Record<string, unknown>)[m] = gib
      }
      ;(kette as Record<string, unknown>).single = async () =>
        tabelle === 'profiles' ? { data: { role: rolle }, error: null } : { data: null, error: null }
      ;(kette as Record<string, unknown>).maybeSingle = async () => ({ data: null, error: null })
      ;(kette as Record<string, unknown>).then = (aufloesen: (w: unknown) => unknown) =>
        Promise.resolve(
          tabelle === 'angehoerigen_zugaenge'
            ? { data: zugaenge, error: null }
            : { data: [], error: null },
        ).then(aufloesen)
      return kette
    },
  }
}

// ── Doppelgänger: Dienstschlüssel-Client (Daten) ───────────────────
type Zeile = Record<string, unknown>
interface Aufruf {
  tabelle: string
  op: 'select' | 'insert'
  filter: Array<[string, string, unknown]>
  werte?: Zeile
  head: boolean
}

interface FakeOptionen {
  /** Liefert einen Fehler für (Tabelle, Operation) — für die Fehlerpfade. */
  fehler?: (a: Aufruf) => { message: string; code?: string } | null
}

function adminFake(bestand: Record<string, Zeile[]>, optionen: FakeOptionen = {}) {
  const aufrufe: Aufruf[] = []

  function passt(row: Zeile, [art, feld, wert]: [string, string, unknown]): boolean {
    if (art === 'eq') return row[feld] === wert
    if (art === 'in') return (wert as unknown[]).includes(row[feld])
    if (art === 'is') return wert === null ? row[feld] == null : row[feld] === wert
    if (art === 'gte') return String(row[feld] ?? '') >= String(wert)
    return true
  }

  const client = {
    aufrufe,
    from(tabelle: string) {
      const a: Aufruf = { tabelle, op: 'select', filter: [], head: false }
      aufrufe.push(a)
      let grenze: number | null = null

      function ergebnis() {
        const fehler = optionen.fehler?.(a) ?? null
        if (fehler) return { data: null, error: fehler, count: null }
        if (a.op === 'insert') {
          const zeile = { id: `neu-${aufrufe.length}`, ...(a.werte ?? {}) }
          ;(bestand[tabelle] ??= []).push(zeile)
          return { data: zeile, error: null, count: null }
        }
        let zeilen = (bestand[tabelle] ?? []).filter(r => a.filter.every(f => passt(r, f)))
        if (grenze !== null) zeilen = zeilen.slice(0, grenze)
        return {
          data: a.head ? null : zeilen,
          error: null,
          count: zeilen.length,
        }
      }

      const kette: Record<string, unknown> = {
        select(_s?: string, opt?: { head?: boolean }) {
          if (opt?.head) a.head = true
          return kette
        },
        insert(werte: Zeile) { a.op = 'insert'; a.werte = werte; return kette },
        eq(f: string, w: unknown) { a.filter.push(['eq', f, w]); return kette },
        in(f: string, w: unknown[]) { a.filter.push(['in', f, w]); return kette },
        is(f: string, w: unknown) { a.filter.push(['is', f, w]); return kette },
        gte(f: string, w: unknown) { a.filter.push(['gte', f, w]); return kette },
        order() { return kette },
        limit(n: number) { grenze = n; return kette },
        single: async () => ergebnis(),
        maybeSingle: async () => ergebnis(),
        then: (aufloesen: (w: unknown) => unknown) => Promise.resolve(ergebnis()).then(aufloesen),
      }
      return kette
    },
  }
  return client
}

function aufrufeAuf(fake: ReturnType<typeof adminFake>, tabelle: string) {
  return fake.aufrufe.filter(a => a.tabelle === tabelle)
}

function hatFilter(a: Aufruf | undefined, art: string, feld: string, wert?: unknown) {
  if (!a) return false
  return a.filter.some(([x, f, w]) =>
    x === art && f === feld && (wert === undefined || JSON.stringify(w) === JSON.stringify(wert)))
}

// ── Bestand ────────────────────────────────────────────────────────
function standardBestand(): Record<string, Zeile[]> {
  return {
    clients: [
      { id: K1, organization_id: ORG, first_name: 'Anna', last_name: 'Meier', care_level: 3, pflegegrad: 3, status: 'active' },
      { id: K2, organization_id: ORG, first_name: 'Bernd', last_name: 'Schulz', care_level: 2, pflegegrad: 2, status: 'active' },
    ],
    assignments: [
      { id: 'a1', organization_id: ORG, client_id: K1, assignment_date: '2099-01-01', start_time: '09:00', end_time: '10:30', service_type: 'Alltagsbegleitung', status: 'GEPLANT', notes: 'INTERNER DISPOHINWEIS' },
      { id: 'a2', organization_id: ORG, client_id: K1, assignment_date: '2099-01-02', start_time: '09:00', end_time: '10:00', service_type: 'Haushaltshilfe', status: 'STORNIERT', notes: null },
      { id: 'a3', organization_id: FREMD_ORG, client_id: K1, assignment_date: '2099-01-03', start_time: '08:00', end_time: '09:00', service_type: 'Fremd', status: 'GEPLANT', notes: null },
    ],
    service_records: [
      { id: 'sr1', organization_id: ORG, client_id: K1, date: '2026-08-01', start_time: '09:00', end_time: '10:00', duration_minutes: 60, service_type: 'Alltagsbegleitung', budget_type: 'entlastung', notes: 'FREITEXT PFLEGEBERICHT', status: 'signed', proof_status: 'UNTERSCHRIEBEN', billing_status: 'OFFEN', created_at: '2026-08-01T10:00:00Z' },
      { id: 'sr2', organization_id: ORG, client_id: K1, date: '2026-08-02', start_time: '09:00', end_time: '10:00', duration_minutes: 60, service_type: 'Haushaltshilfe', budget_type: 'entlastung', notes: 'STORNIERTER FREITEXT', status: 'signed', proof_status: 'STORNIERT', billing_status: 'STORNIERT', created_at: '2026-08-02T10:00:00Z' },
      { id: 'sr3', organization_id: ORG, client_id: K1, date: '2026-08-03', start_time: '09:00', end_time: '10:00', duration_minutes: 60, service_type: 'Alltagsbegleitung', budget_type: 'entlastung', notes: 'ENTWURFS-FREITEXT', status: 'draft', proof_status: 'ENTWURF', billing_status: 'OFFEN', created_at: '2026-08-03T10:00:00Z' },
    ],
    akten_dokumente: [
      { id: 'd1', organization_id: ORG, client_id: K1, titel: 'Pflegevertrag', dokument_typ: 'vertrag', kategorie: null, dateiname: 'v.pdf', mime_type: 'application/pdf', dokument_datum: '2026-01-01', status: 'aktiv', sichtbarkeit: 'kunde', gesperrt: false, deleted_at: null, created_at: '2026-01-01T00:00:00Z' },
      { id: 'd2', organization_id: ORG, client_id: K1, titel: 'Gesperrtes Gutachten', dokument_typ: 'gutachten', kategorie: null, dateiname: 'g.pdf', mime_type: 'application/pdf', dokument_datum: '2026-01-01', status: 'aktiv', sichtbarkeit: 'kunde', gesperrt: true, deleted_at: null, created_at: '2026-01-02T00:00:00Z' },
      { id: 'd3', organization_id: ORG, client_id: K1, titel: 'Intern', dokument_typ: 'notiz', kategorie: null, dateiname: 'i.pdf', mime_type: 'application/pdf', dokument_datum: '2026-01-01', status: 'aktiv', sichtbarkeit: 'intern', gesperrt: false, deleted_at: null, created_at: '2026-01-03T00:00:00Z' },
    ],
    angehoerigen_nachrichten: [
      { id: 'n1', organization_id: ORG, zugang_id: `zugang-${K1}`, client_id: K1, absender_typ: 'pflegedienst', status: 'gesendet', betreff: 'Hallo', inhalt: 'Text', created_at: '2026-08-01T00:00:00Z' },
    ],
    angehoerigen_audit_log: [],
  }
}

function rueste(zugaenge: unknown[], bestand = standardBestand(), optionen: FakeOptionen = {}) {
  const fake = adminFake(bestand, optionen)
  mockCreateClient.mockResolvedValue(rlsClient(zugaenge))
  mockCreateAdminClient.mockReturnValue(fake)
  mockResolveUserOrgId.mockResolvedValue(ORG)
  return { fake, bestand }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ═══════════════════════════════════════════════════════════════════
describe('Zugang und Rolle', () => {
  it('ohne Login: 401', async () => {
    mockCreateClient.mockResolvedValue(rlsClient([], 'angehoerige', null))
    mockCreateAdminClient.mockReturnValue(adminFake(standardBestand()))
    mockResolveUserOrgId.mockResolvedValue(ORG)
    expect((await DASHBOARD()).status).toBe(401)
  })

  it('falsche Rolle: 403', async () => {
    mockCreateClient.mockResolvedValue(rlsClient([zugang(K1, ['termine'])], 'engel'))
    mockCreateAdminClient.mockReturnValue(adminFake(standardBestand()))
    mockResolveUserOrgId.mockResolvedValue(ORG)
    expect((await DASHBOARD()).status).toBe(403)
  })

  it('abgelaufener Zugang zählt nicht', async () => {
    rueste([zugang(K1, ['termine'], { gueltig_bis: '2020-01-01T00:00:00Z' })])
    expect((await DASHBOARD()).status).toBe(403)
  })

  it('Zugang mit unbrauchbarer Bereichsliste gibt nichts frei', async () => {
    // freigegebene_bereiche ist ein text[] ohne Werteprüfung in der DB.
    // Weder null noch ein unbekannter Wert dürfen Zugriff erzeugen —
    // und `.includes()` auf null darf die Route nicht mit 500 killen.
    for (const kaputt of [null, 'termine', [], ['unbekannt']]) {
      rueste([zugang(K1, kaputt)])
      const res = await DASHBOARD()
      expect(res.status, `Bereiche ${JSON.stringify(kaputt)}`).toBe(403)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Dashboard achtet auf die Bereichsfreigaben', () => {
  it('nur „Dokumente" freigegeben: keine Leistungen, kein Pflegegrad, keine Termine', async () => {
    const { fake } = rueste([zugang(K1, ['dokumente'])])
    const res = await DASHBOARD()
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.zusammenfassung.letzte_leistungen).toEqual([])
    expect(body.zusammenfassung.termine_kommend).toBe(0)
    expect(body.zusammenfassung.nachrichten_ungelesen).toBe(0)
    expect(body.zugaenge[0].client_pflegegrad).toBeNull()
    // Der Name bleibt — ohne ihn ist die Startseite nicht bedienbar.
    expect(body.zugaenge[0].client_name).toBe('Anna Meier')
    // Und es wurde gar nicht erst nach Leistungen gefragt.
    expect(aufrufeAuf(fake, 'service_records')).toHaveLength(0)
    expect(aufrufeAuf(fake, 'assignments')).toHaveLength(0)
  })

  it('mit „Leistungen": Leistungen und Pflegegrad kommen', async () => {
    rueste([zugang(K1, ['leistungen'])])
    const body = await (await DASHBOARD()).json()
    expect(body.zugaenge[0].client_pflegegrad).toBe(3)
    expect(body.zusammenfassung.letzte_leistungen.length).toBeGreaterThan(0)
  })

  it('stornierter Nachweis erscheint nicht als erbrachte Leistung', async () => {
    rueste([zugang(K1, ['leistungen'])])
    const body = await (await DASHBOARD()).json()
    const ids = body.zusammenfassung.letzte_leistungen.map((l: { id: string }) => l.id)
    expect(ids).toContain('sr1')
    expect(ids).not.toContain('sr2')
  })

  it('zwei Klienten, Freigabe nur für einen: der andere bleibt ohne Pflegegrad', async () => {
    rueste([zugang(K1, ['leistungen']), zugang(K2, ['dokumente'])])
    const body = await (await DASHBOARD()).json()
    const nach = (id: string) => body.zugaenge.find((z: { client_id: string }) => z.client_id === id)
    expect(nach(K1).client_pflegegrad).toBe(3)
    expect(nach(K2).client_pflegegrad).toBeNull()
  })

  it('Terminzahl kommt aus den Einsätzen, nicht aus bookings', async () => {
    const { fake } = rueste([zugang(K1, ['termine'])])
    const body = await (await DASHBOARD()).json()
    expect(aufrufeAuf(fake, 'bookings')).toHaveLength(0)
    // a1 zählt (GEPLANT, eigene Org), a2 nicht (STORNIERT), a3 nicht (fremde Org).
    expect(body.zusammenfassung.termine_kommend).toBe(1)
  })

  it('jede Abfrage trägt den Mandanten-Fence', async () => {
    const { fake } = rueste([zugang(K1, ['leistungen', 'termine', 'nachrichten'])])
    await DASHBOARD()
    for (const tabelle of ['clients', 'assignments', 'service_records', 'angehoerigen_nachrichten']) {
      for (const a of aufrufeAuf(fake, tabelle)) {
        expect(hatFilter(a, 'eq', 'organization_id', ORG), `${tabelle} ohne org-Fence`).toBe(true)
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Termine', () => {
  it('ohne Bereich „Termine": 403', async () => {
    rueste([zugang(K1, ['dokumente'])])
    expect((await TERMINE()).status).toBe(403)
  })

  it('liest assignments statt bookings und filtert auf die freigegebenen Klienten', async () => {
    const { fake } = rueste([zugang(K1, ['termine'])])
    const res = await TERMINE()
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(aufrufeAuf(fake, 'bookings')).toHaveLength(0)
    const a = aufrufeAuf(fake, 'assignments')[0]
    expect(hatFilter(a, 'in', 'client_id', [K1])).toBe(true)
    expect(hatFilter(a, 'eq', 'organization_id', ORG)).toBe(true)

    expect(body.termine.map((t: { id: string }) => t.id)).toEqual(['a1', 'a2'])
    expect(body.termine[0].leistungsart).toBe('Alltagsbegleitung')
    expect(body.termine[0].von).toBe('09:00')
    expect(body.termine[0].client_name).toBe('Anna Meier')
  })

  it('gibt die internen Dispositionshinweise des Einsatzes nicht heraus', async () => {
    rueste([zugang(K1, ['termine'])])
    const body = await (await TERMINE()).json()
    expect(JSON.stringify(body)).not.toContain('INTERNER DISPOHINWEIS')
  })

  it('Einsätze fremder Klienten bleiben draußen', async () => {
    rueste([zugang(K2, ['termine'])])
    const body = await (await TERMINE()).json()
    expect(body.termine).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Pflegebericht — der Freitext hängt an der zweiten Freigabe', () => {
  it('nur „Leistungen": Einsatzliste ja, Freitext nein', async () => {
    rueste([zugang(K1, ['leistungen'])])
    const body = await (await BERICHTE()).json()
    const sr1 = body.berichte.find((b: { id: string }) => b.id === 'sr1')
    expect(sr1).toBeTruthy()
    expect(sr1.notes).toBeNull()
    expect(sr1.bericht_freigegeben).toBe(false)
    expect(JSON.stringify(body)).not.toContain('FREITEXT PFLEGEBERICHT')
  })

  it('Bereich „pflegeberichte" allein reicht nicht — das Kennzeichen muss gesetzt sein', async () => {
    rueste([zugang(K1, ['leistungen', 'pflegeberichte'], { pflegeberichte_freigegeben: false })])
    const body = await (await BERICHTE()).json()
    expect(body.berichte.find((b: { id: string }) => b.id === 'sr1').notes).toBeNull()
  })

  it('mit beiden Freigaben kommt der Freitext', async () => {
    rueste([zugang(K1, ['leistungen', 'pflegeberichte'], { pflegeberichte_freigegeben: true })])
    const body = await (await BERICHTE()).json()
    const sr1 = body.berichte.find((b: { id: string }) => b.id === 'sr1')
    expect(sr1.notes).toBe('FREITEXT PFLEGEBERICHT')
    expect(sr1.bericht_freigegeben).toBe(true)
  })

  it('Entwürfe geben ihren Freitext auch mit Freigabe nicht heraus', async () => {
    rueste([zugang(K1, ['leistungen', 'pflegeberichte'], { pflegeberichte_freigegeben: true })])
    const body = await (await BERICHTE()).json()
    const sr3 = body.berichte.find((b: { id: string }) => b.id === 'sr3')
    expect(sr3.notes).toBeNull()
    expect(JSON.stringify(body)).not.toContain('ENTWURFS-FREITEXT')
  })

  it('stornierte Nachweise fehlen ganz', async () => {
    rueste([zugang(K1, ['leistungen', 'pflegeberichte'], { pflegeberichte_freigegeben: true })])
    const body = await (await BERICHTE()).json()
    expect(body.berichte.map((b: { id: string }) => b.id)).not.toContain('sr2')
    expect(JSON.stringify(body)).not.toContain('STORNIERTER FREITEXT')
  })

  it('ohne beide Bereiche: 403', async () => {
    rueste([zugang(K1, ['termine'])])
    expect((await BERICHTE()).status).toBe(403)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Dokumente', () => {
  it('gesperrte und interne Dokumente gehen nicht hinaus', async () => {
    rueste([zugang(K1, ['dokumente'])])
    const body = await (await DOKUMENTE()).json()
    const ids = body.dokumente.map((d: { id: string }) => d.id)
    expect(ids).toEqual(['d1'])
    expect(ids).not.toContain('d2')
    expect(ids).not.toContain('d3')
  })

  it('der Sperr-Filter steht wirklich in der Abfrage', async () => {
    const { fake } = rueste([zugang(K1, ['dokumente'])])
    await DOKUMENTE()
    const a = aufrufeAuf(fake, 'akten_dokumente')[0]
    expect(hatFilter(a, 'eq', 'gesperrt', false)).toBe(true)
    expect(hatFilter(a, 'is', 'deleted_at', null)).toBe(true)
    expect(hatFilter(a, 'eq', 'organization_id', ORG)).toBe(true)
  })

  it('ohne Bereich „Dokumente": 403', async () => {
    rueste([zugang(K1, ['termine'])])
    expect((await DOKUMENTE()).status).toBe(403)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Nachrichten', () => {
  it('ohne Bereich „Nachrichten": 403 bei Lesen und Senden', async () => {
    rueste([zugang(K1, ['termine'])])
    expect((await NACHRICHTEN()).status).toBe(403)
    rueste([zugang(K1, ['termine'])])
    const req = new Request('http://x/api', {
      method: 'POST',
      body: JSON.stringify({ zugang_id: `zugang-${K1}`, betreff: 'B', inhalt: 'I' }),
    })
    expect((await SENDEN(req as never)).status).toBe(403)
  })

  it('senden über einen Zugang ohne Nachrichten-Freigabe wird abgewiesen', async () => {
    // K1 trägt die Freigabe, K2 nicht — der Versand über K2 muss scheitern,
    // obwohl der Nutzer „irgendeinen" Zugang mit Freigabe hat.
    rueste([zugang(K1, ['nachrichten']), zugang(K2, ['dokumente'])])
    const req = new Request('http://x/api', {
      method: 'POST',
      body: JSON.stringify({ zugang_id: `zugang-${K2}`, betreff: 'B', inhalt: 'I' }),
    })
    expect((await SENDEN(req as never)).status).toBe(403)
  })

  it('mit Freigabe wird die Nachricht am richtigen Klienten abgelegt', async () => {
    const { bestand } = rueste([zugang(K1, ['nachrichten'])])
    const req = new Request('http://x/api', {
      method: 'POST',
      body: JSON.stringify({ zugang_id: `zugang-${K1}`, betreff: ' Frage ', inhalt: ' Inhalt ' }),
    })
    const res = await SENDEN(req as never)
    expect(res.status).toBe(200)
    const abgelegt = bestand.angehoerigen_nachrichten.at(-1) as Zeile
    expect(abgelegt.client_id).toBe(K1)
    expect(abgelegt.organization_id).toBe(ORG)
    expect(abgelegt.absender_typ).toBe('angehoeriger')
    expect(abgelegt.betreff).toBe('Frage')
  })

  it('überlange Eingaben werden abgewiesen', async () => {
    rueste([zugang(K1, ['nachrichten'])])
    const req = new Request('http://x/api', {
      method: 'POST',
      body: JSON.stringify({ zugang_id: `zugang-${K1}`, betreff: 'B', inhalt: 'x'.repeat(5001) }),
    })
    expect((await SENDEN(req as never)).status).toBe(400)
  })

  it('leerer Betreff wird abgewiesen', async () => {
    rueste([zugang(K1, ['nachrichten'])])
    const req = new Request('http://x/api', {
      method: 'POST',
      body: JSON.stringify({ zugang_id: `zugang-${K1}`, betreff: '   ', inhalt: 'I' }),
    })
    expect((await SENDEN(req as never)).status).toBe(400)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('Zugriffsprotokoll — fail-closed', () => {
  it('jede Einsichtnahme schreibt einen Eintrag', async () => {
    const { bestand } = rueste([zugang(K1, ['termine', 'dokumente', 'leistungen'])])
    await TERMINE()
    await DOKUMENTE()
    await BERICHTE()
    const aktionen = (bestand.angehoerigen_audit_log as Zeile[]).map(z => z.aktion)
    expect(aktionen).toContain('termine_eingesehen')
    expect(aktionen).toContain('dokument_eingesehen')
    expect(aktionen).toContain('leistungen_eingesehen')
    const eintrag = (bestand.angehoerigen_audit_log as Zeile[])[0]
    expect(eintrag.user_id).toBe(USER)
    expect(eintrag.client_id).toBe(K1)
    expect(eintrag.organization_id).toBe(ORG)
  })

  it('lässt sich das Protokoll nicht schreiben, kommen KEINE Daten heraus', async () => {
    const fehlerAufLog = (a: Aufruf) =>
      a.tabelle === 'angehoerigen_audit_log' ? { message: 'RLS', code: '42501' } : null

    for (const [name, route] of [
      ['Termine', TERMINE],
      ['Dokumente', DOKUMENTE],
      ['Berichte', BERICHTE],
      ['Dashboard', DASHBOARD],
    ] as const) {
      rueste(
        [zugang(K1, ['termine', 'dokumente', 'leistungen'])],
        standardBestand(),
        { fehler: fehlerAufLog },
      )
      const res = await route()
      expect(res.status, name).toBe(503)
      const body = await res.json()
      expect(JSON.stringify(body), name).not.toContain('Anna')
    }
  })

  it('ohne freigegebene Leistungen protokolliert das Dashboard nichts und liefert trotzdem', async () => {
    // Gegenprobe zum fail-closed: wo nichts Schutzwürdiges herausgeht,
    // darf ein leerer Protokollauftrag die Seite nicht blockieren.
    const { bestand } = rueste(
      [zugang(K1, ['dokumente'])],
      standardBestand(),
      { fehler: (a) => (a.tabelle === 'angehoerigen_audit_log' ? { message: 'RLS' } : null) },
    )
    const res = await DASHBOARD()
    expect(res.status).toBe(200)
    expect(bestand.angehoerigen_audit_log).toHaveLength(0)
  })
})
