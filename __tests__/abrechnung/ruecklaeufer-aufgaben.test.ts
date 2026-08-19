// ═══════════════════════════════════════════════════════════════
// Automatische Aufgabe bei Kassenrückläufer
// ═══════════════════════════════════════════════════════════════
// Unit / Integration / Security fuer lib/abrechnung/ruecklaeufer-aufgaben.ts
// und dessen Verdrahtung in importiereRuecklaeufer().
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { heuteBerlin } from '@/lib/utils/timezone'
import {
  erstelleRuecklaeuferAufgabe,
  stufeRuecklaeuferEin,
  AUFGABEN_AUSLOESENDE_STATUS,
} from '@/lib/abrechnung/ruecklaeufer-aufgaben'
import type { RuecklaeuferStatus } from '@/lib/abrechnung/ruecklaeufer'

const ORG = '00000000-0000-4000-8000-000460629986'
const FREMDE_ORG = '11111111-1111-4111-8111-111111111111'
const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const RL_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

// ── Mock, der jede Query mitschreibt ────────────────────────────
// Der Punkt der Security-Tests ist nicht "kommt ein Ergebnis zurueck",
// sondern "wurde ueberhaupt nach organization_id gefiltert". Dafuer muss
// der Mock die .eq()-Aufrufe protokollieren.

interface Query {
  table: string
  op: string
  eq: Record<string, unknown>
  payload?: Record<string, unknown>
}

function createMock(opts: {
  vorhandeneAufgabe?: { id: string } | null
  dublettenFehler?: string
  insertFehler?: string
  admins?: { id: string }[]
} = {}) {
  const queries: Query[] = []

  function chain(table: string, op: string): any {
    const q: Query = { table, op, eq: {} }
    queries.push(q)

    const self: any = {
      select: vi.fn(() => self),
      eq: vi.fn((spalte: string, wert: unknown) => { q.eq[spalte] = wert; return self }),
      in: vi.fn((spalte: string, wert: unknown) => { q.eq[spalte] = wert; return self }),
      is: vi.fn((spalte: string, wert: unknown) => { q.eq[`${spalte}:is`] = wert; return self }),
      order: vi.fn(() => self),
      limit: vi.fn(() => self),
      maybeSingle: vi.fn(() => {
        if (table === 'ops_aufgaben' && op === 'select') {
          return Promise.resolve(
            opts.dublettenFehler
              ? { data: null, error: { message: opts.dublettenFehler } }
              : { data: opts.vorhandeneAufgabe ?? null, error: null },
          )
        }
        return Promise.resolve({ data: null, error: null })
      }),
      single: vi.fn(() => {
        if (table === 'ops_aufgaben' && op === 'insert') {
          return Promise.resolve(
            opts.insertFehler
              ? { data: null, error: { message: opts.insertFehler } }
              : { data: { id: 'neue-aufgabe-id' }, error: null },
          )
        }
        return Promise.resolve({ data: null, error: null })
      }),
      then: (resolve: any) => {
        if (table === 'organization_members') return resolve({ data: [{ user_id: ACTOR }], error: null })
        if (table === 'profiles') return resolve({ data: opts.admins ?? [{ id: ACTOR }], error: null })
        if (table === 'ops_ereignis_regeln') return resolve({ data: [], error: null })
        return resolve({ data: [], error: null })
      },
    }
    self.insert = vi.fn((payload: Record<string, unknown>) => {
      const iq: Query = { table, op: 'insert', eq: {}, payload }
      queries.push(iq)
      return chainMitPayload(table)
    })
    return self
  }

  function chainMitPayload(table: string): any {
    const self: any = {
      select: vi.fn(() => self),
      single: vi.fn(() => {
        if (table === 'ops_aufgaben') {
          return Promise.resolve(
            opts.insertFehler
              ? { data: null, error: { message: opts.insertFehler } }
              : { data: { id: 'neue-aufgabe-id' }, error: null },
          )
        }
        return Promise.resolve({ data: { id: 'x' }, error: null })
      }),
      then: (resolve: any) => resolve({ data: null, error: null }),
    }
    return self
  }

  const client = { from: vi.fn((table: string) => chain(table, 'select')) }
  return { client: client as any, queries }
}

beforeEach(() => vi.clearAllMocks())

// ── Unit: Einstufung ────────────────────────────────────────────

describe('stufeRuecklaeuferEin', () => {
  it('stuft Ablehnung als kritisch mit 3 Tagen Frist ein', () => {
    const e = stufeRuecklaeuferEin('abgelehnt')
    expect(e.prioritaet).toBe('kritisch')
    expect(e.fristTage).toBe(3)
  })

  it('gibt dem technischen Fehler die kuerzeste Frist — er blockiert den ganzen Lauf', () => {
    const technisch = stufeRuecklaeuferEin('technischer_fehler')
    const fachlich = stufeRuecklaeuferEin('fachlicher_fehler')
    expect(technisch.fristTage).toBeLessThan(fachlich.fristTage)
    expect(technisch.prioritaet).toBe('kritisch')
  })

  it('faellt fuer unbekannte Status auf mittel/7 Tage zurueck', () => {
    const e = stufeRuecklaeuferEin('eingegangen')
    expect(e.prioritaet).toBe('mittel')
    expect(e.fristTage).toBe(7)
  })

  it('deckt jeden ausloesenden Status mit hoher oder kritischer Prioritaet ab', () => {
    for (const status of AUFGABEN_AUSLOESENDE_STATUS) {
      expect(['hoch', 'kritisch']).toContain(stufeRuecklaeuferEin(status).prioritaet)
    }
  })
})

// ── Unit: Ausloese-Logik ────────────────────────────────────────

describe('erstelleRuecklaeuferAufgabe — Ausloesung', () => {
  it.each([
    'angenommen', 'angenommen_mit_hinweis', 'eingegangen', 'zugeordnet', 'duplikat', 'erledigt',
  ] as RuecklaeuferStatus[])('erzeugt KEINE Aufgabe bei Status %s', async (status) => {
    const { client, queries } = createMock()
    const r = await erstelleRuecklaeuferAufgabe(client, {
      organizationId: ORG, ruecklaeuferId: RL_ID, status, actorId: ACTOR,
    })
    expect(r.erstellt).toBe(false)
    expect(r.aufgabeId).toBeNull()
    // Kein Status-Erfolgsfall darf die Datenbank ueberhaupt anfassen.
    expect(queries).toHaveLength(0)
  })

  it.each(AUFGABEN_AUSLOESENDE_STATUS)('erzeugt eine Aufgabe bei Status %s', async (status) => {
    const { client } = createMock()
    const r = await erstelleRuecklaeuferAufgabe(client, {
      organizationId: ORG, ruecklaeuferId: RL_ID, status, actorId: ACTOR,
    })
    expect(r.erstellt).toBe(true)
    expect(r.aufgabeId).toBe('neue-aufgabe-id')
  })
})

// ── Dublettenschutz ─────────────────────────────────────────────

describe('erstelleRuecklaeuferAufgabe — Dubletten', () => {
  it('erzeugt keine zweite Aufgabe, wenn zum Rueckläufer schon eine existiert', async () => {
    const { client, queries } = createMock({ vorhandeneAufgabe: { id: 'bestehende-id' } })
    const r = await erstelleRuecklaeuferAufgabe(client, {
      organizationId: ORG, ruecklaeuferId: RL_ID, status: 'abgelehnt', actorId: ACTOR,
    })
    expect(r.dublette).toBe(true)
    expect(r.erstellt).toBe(false)
    expect(r.aufgabeId).toBe('bestehende-id')
    expect(queries.filter(q => q.op === 'insert')).toHaveLength(0)
  })

  it('sucht die Dublette ueber metadata->>ruecklaeufer_id UND organization_id', async () => {
    const { client, queries } = createMock({ vorhandeneAufgabe: { id: 'x' } })
    await erstelleRuecklaeuferAufgabe(client, {
      organizationId: ORG, ruecklaeuferId: RL_ID, status: 'abgelehnt', actorId: ACTOR,
    })
    const dupQuery = queries.find(q => q.table === 'ops_aufgaben' && q.op === 'select')
    expect(dupQuery?.eq['metadata->>ruecklaeufer_id']).toBe(RL_ID)
    expect(dupQuery?.eq['organization_id']).toBe(ORG)
  })

  it('legt bei fehlgeschlagener Dublettenpruefung KEINE Aufgabe an', async () => {
    // Lieber eine fehlende Aufgabe (wird beim naechsten Import nachgezogen)
    // als eine doppelte, die jemand manuell aufraeumen muss.
    const { client, queries } = createMock({ dublettenFehler: 'connection reset' })
    const r = await erstelleRuecklaeuferAufgabe(client, {
      organizationId: ORG, ruecklaeuferId: RL_ID, status: 'abgelehnt', actorId: ACTOR,
    })
    expect(r.erstellt).toBe(false)
    expect(r.grund).toContain('Dublettenprüfung fehlgeschlagen')
    expect(queries.filter(q => q.op === 'insert')).toHaveLength(0)
  })
})

// ── Inhalt der Aufgabe ──────────────────────────────────────────

describe('erstelleRuecklaeuferAufgabe — Inhalt', () => {
  async function aufgabePayload(extra: Record<string, unknown> = {}) {
    const { client, queries } = createMock()
    await erstelleRuecklaeuferAufgabe(client, {
      organizationId: ORG,
      ruecklaeuferId: RL_ID,
      status: 'abgelehnt',
      actorId: ACTOR,
      laufId: 'lauf-1',
      kostentraegerIk: '105313145',
      fehlerCode: 'T4711',
      fehlerText: 'Segment UNB fehlerhaft',
      fehlerprotokollId: 'fehler-1',
      ...extra,
    })
    return queries.find(q => q.table === 'ops_aufgaben' && q.op === 'insert')?.payload as any
  }

  it('setzt organization_id, Kategorie, Prioritaet und Status', async () => {
    const p = await aufgabePayload()
    expect(p.organization_id).toBe(ORG)
    expect(p.kategorie).toBe('abrechnung')
    expect(p.prioritaet).toBe('kritisch')
    expect(p.status).toBe('offen')
  })

  it('verknuepft Rechnung, Lauf, Rueckläufer und Fehlerprotokoll', async () => {
    const p = await aufgabePayload({ invoiceId: 'rg-1', clientId: 'kunde-1' })
    expect(p.abrechnungslauf_id).toBe('lauf-1')
    expect(p.client_id).toBe('kunde-1')
    expect(p.metadata.ruecklaeufer_id).toBe(RL_ID)
    expect(p.metadata.fehlerprotokoll_id).toBe('fehler-1')
    expect(p.metadata.invoice_id).toBe('rg-1')
    expect(p.metadata.fehler_code).toBe('T4711')
  })

  it('traegt Fehlercode, Fehlertext und Admin-Verlinkung in die Beschreibung', async () => {
    const p = await aufgabePayload()
    expect(p.beschreibung).toContain('T4711')
    expect(p.beschreibung).toContain('Segment UNB fehlerhaft')
    expect(p.beschreibung).toContain('/admin/ruecklaeufer?id=' + RL_ID)
    expect(p.beschreibung).toContain('/admin/dta/laeufe/lauf-1')
  })

  it('setzt Verantwortlichen, Ersteller und ein Faelligkeitsdatum in der Zukunft', async () => {
    const p = await aufgabePayload()
    expect(p.verantwortlich_id).toBe(ACTOR)
    expect(p.erstellt_von).toBe(ACTOR)
    expect(p.faellig_am).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(p.faellig_am >= heuteBerlin()).toBe(true)
  })

  it('bevorzugt einen explizit uebergebenen Verantwortlichen', async () => {
    const p = await aufgabePayload({ verantwortlichId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })
    expect(p.verantwortlich_id).toBe('cccccccc-cccc-4ccc-8ccc-cccccccccccc')
  })

  it('kommt ohne Admin in der Organisation aus, statt zu scheitern', async () => {
    const { client } = createMock({ admins: [] })
    const r = await erstelleRuecklaeuferAufgabe(client, {
      organizationId: ORG, ruecklaeuferId: RL_ID, status: 'abgelehnt', actorId: ACTOR,
    })
    expect(r.erstellt).toBe(true)
  })
})

// ── Security / Mandantentrennung ────────────────────────────────

describe('erstelleRuecklaeuferAufgabe — Security', () => {
  it('schreibt die Aufgabe niemals in eine andere Organisation', async () => {
    const { client, queries } = createMock()
    await erstelleRuecklaeuferAufgabe(client, {
      organizationId: FREMDE_ORG, ruecklaeuferId: RL_ID, status: 'abgelehnt', actorId: ACTOR,
    })
    const insert = queries.find(q => q.table === 'ops_aufgaben' && q.op === 'insert')?.payload as any
    expect(insert.organization_id).toBe(FREMDE_ORG)

    // Und jede tatsaechlich filternde Lese-Query ist ebenfalls org-gebunden.
    // (Der blosse `from()`-Aufruf vor einem insert zaehlt nicht — er filtert nicht.)
    const orgLesend = queries.filter(
      q => q.table === 'ops_aufgaben' && q.op === 'select' && Object.keys(q.eq).length > 0,
    )
    expect(orgLesend.length).toBeGreaterThan(0)
    for (const q of orgLesend) expect(q.eq['organization_id']).toBe(FREMDE_ORG)
  })

  it('sucht Admins nur innerhalb der eigenen Organisation', async () => {
    const { client, queries } = createMock()
    await erstelleRuecklaeuferAufgabe(client, {
      organizationId: ORG, ruecklaeuferId: RL_ID, status: 'abgelehnt', actorId: ACTOR,
    })
    const mitglieder = queries.find(q => q.table === 'organization_members')
    expect(mitglieder?.eq['organization_id']).toBe(ORG)
  })

  it('wirft nicht, wenn das Anlegen scheitert — der Rueckläufer bleibt bestehen', async () => {
    const { client } = createMock({ insertFehler: 'permission denied' })
    const r = await erstelleRuecklaeuferAufgabe(client, {
      organizationId: ORG, ruecklaeuferId: RL_ID, status: 'abgelehnt', actorId: ACTOR,
    })
    expect(r.erstellt).toBe(false)
    expect(r.grund).toContain('permission denied')
  })
})
