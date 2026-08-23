/**
 * Sammelrechnungslauf — Betriebsfestigkeit (TypeScript-Seite)
 *
 * Die SQL-Seite (Sperre, Zaehler, Wiederaufnahme in der Datenbank) prueft
 * sammelrechnungslauf-batch-pglite.test.ts auf einer echten Postgres-
 * Instanz. Hier geht es um die Seite darueber:
 *
 *   1. WIEDERAUFNAHME   — was ein Vorlauf erledigt hat, wird nicht erneut
 *                         angefasst; die uebrigen Gruppen laufen normal
 *   2. TEILFEHLER       — Gruppe 3 von 10 scheitert, die anderen sieben
 *                         (bzw. neun) bekommen trotzdem ihre Rechnung
 *   3. IDEMPOTENZ       — ein zweiter vollstaendiger Lauf erzeugt keine
 *                         zweite Rechnung und keinen zweiten Umsatz
 *   4. GROSSE MENGEN    — 120 Gruppen, Herzschlag, Obergrenze
 *   5. PROTOKOLL        — jede Gruppe bekommt genau einen Eintrag mit dem
 *                         richtigen Status; ein Ausfall der Mitschrift
 *                         kippt den Lauf NICHT
 *   6. BATCH-ID         — steht an jedem Audit-Eintrag des Laufs
 *   7. DOPPELSTART      — die Absage der Datenbank wird zu einem eigenen
 *                         Fehlertyp, nicht zu einem leeren Ergebnis
 *
 * Testdaten: synthetisch. Keine echten Kunden-, Gesundheits- oder
 * Preisdaten; die Tarife hier sind Attrappen und praejudizieren nichts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateInvoiceDraft, mockFreezeInvoice, mockLogBillingAction } = vi.hoisted(() => ({
  mockCreateInvoiceDraft: vi.fn(),
  mockFreezeInvoice: vi.fn(),
  mockLogBillingAction: vi.fn(),
}))

vi.mock('@/lib/billing/core/invoice-engine', async (importOriginal) => {
  const echt = await importOriginal<typeof import('@/lib/billing/core/invoice-engine')>()
  return { ...echt, createInvoiceDraft: mockCreateInvoiceDraft, freezeInvoice: mockFreezeInvoice }
})

vi.mock('@/lib/billing/core/audit', async (importOriginal) => {
  const echt = await importOriginal<typeof import('@/lib/billing/core/audit')>()
  return { ...echt, logBillingAction: mockLogBillingAction }
})

import {
  fuehreSammelrechnungslaufAus,
  gruppenSchluessel,
  type GruppenErgebnis,
  type LaufProtokoll,
  type SammelrechnungGruppe,
} from '@/lib/billing/core/sammelrechnung'
import {
  starteSammelrechnungslauf,
  SammelrechnungLaeuftBereitsError,
} from '@/lib/billing/core/sammelrechnung-lauf'

const ORG = '00000000-0000-4000-8000-000460629986'
const ACTOR = '11111111-1111-4111-8111-111111111111'
const LAUF = 'bbbbbbbb-1111-4111-8111-111111111111'
const MONAT = '2026-07'

// ═══════════════════════════════════════════════════════════════
// In-Memory-Supabase (Lesen echt gefiltert, rpc steuerbar)
// ═══════════════════════════════════════════════════════════════

type Row = Record<string, any>
type Store = Record<string, Row[]>

class QB {
  private rows: Row[]
  private pending: Row | Row[] | null = null
  private mode: 'select' | 'update' | 'insert' | 'upsert' = 'select'
  private filters: Array<(r: Row) => boolean> = []

  constructor(table: string, store: Store) {
    this.rows = store[table] || (store[table] = [])
  }

  select() { return this }
  order() { return this }
  limit() { return this }
  returns() { return this }

  eq(col: string, val: any) { this.filters.push(r => r[col] === val); return this }
  neq(col: string, val: any) { this.filters.push(r => r[col] !== val); return this }
  is(col: string, val: any) { this.filters.push(r => (r[col] ?? null) === val); return this }
  gte(col: string, val: any) { this.filters.push(r => r[col] >= val); return this }
  lte(col: string, val: any) { this.filters.push(r => r[col] <= val); return this }
  in(col: string, arr: any[]) { this.filters.push(r => arr.includes(r[col])); return this }

  update(payload: Row) { this.mode = 'update'; this.pending = payload; return this }
  insert(payload: Row) { this.mode = 'insert'; this.pending = payload; this.rows.push(payload); return this }
  upsert(payload: Row[]) {
    this.mode = 'upsert'
    this.pending = payload
    for (const neu of payload) {
      const schon = this.rows.find(
        r => r.lauf_id === neu.lauf_id && r.client_id === neu.client_id && r.budget_type === neu.budget_type,
      )
      // ignoreDuplicates: eine bestehende Zeile wird NICHT ueberschrieben.
      // Genau daran haengt die Wiederaufnahme.
      if (!schon) this.rows.push({ ...neu })
    }
    return this
  }

  private matched(): Row[] { return this.rows.filter(r => this.filters.every(f => f(r))) }

  private resolve() {
    if (this.mode === 'update') {
      const treffer = this.matched()
      for (const r of treffer) Object.assign(r, this.pending)
      return { data: null, error: null, count: treffer.length }
    }
    if (this.mode === 'insert' || this.mode === 'upsert') return { data: this.pending, error: null }
    return { data: this.matched(), error: null }
  }

  maybeSingle() { return Promise.resolve({ data: this.matched()[0] ?? null, error: null }) }
  single() {
    const m = this.matched()
    return Promise.resolve(m.length === 1 ? { data: m[0], error: null } : { data: null, error: { message: 'not found' } })
  }
  then(auf: (v: any) => any, ab?: (e: any) => any) { return Promise.resolve(this.resolve()).then(auf, ab) }
}

interface StubOptionen {
  /** Antworten je RPC-Name. Fehlt einer, kommt { data: null, error: null }. */
  rpc?: Record<string, { data?: unknown; error?: { message: string; code?: string } }>
}

function stub(store: Store, optionen: StubOptionen = {}) {
  const rpcAufrufe: Array<{ name: string; args: unknown }> = []
  const client = {
    from: (table: string) => new QB(table, store),
    rpc: async (name: string, args: unknown) => {
      rpcAufrufe.push({ name, args })
      return optionen.rpc?.[name] ?? { data: null, error: null }
    },
  } as any
  return { client, rpcAufrufe }
}

// ── Testdaten ──────────────────────────────────────────────────

let laufendeId = 0
function nachweis(over: Partial<Row> = {}): Row {
  laufendeId++
  return {
    id: `sr-${laufendeId}`,
    organization_id: ORG,
    client_id: `klient-${laufendeId}`,
    budget_type: 'entlastung',
    service_type: 'Alltagsbegleitung',
    date: `${MONAT}-15`,
    status: 'signed',
    amount: 45,
    proof_status: 'UNTERSCHRIEBEN',
    signature_hash: null,
    ...over,
  }
}

function tarif(over: Partial<Row> = {}): Row {
  return {
    id: `bt-${Math.random().toString(36).slice(2, 8)}`,
    organization_id: ORG,
    leistungsart: 'alltagsbegleitung',
    rechtsgrundlage: '§45b SGB XI',
    gueltig_ab: '2026-01-01',
    gueltig_bis: null,
    tarif_status: 'verified',
    ist_aktiv: true,
    deleted_at: null,
    ...over,
  }
}

let entwurfsZaehler = 0
function entwurf(over: Record<string, unknown> = {}) {
  entwurfsZaehler++
  return {
    invoiceId: `inv-${entwurfsZaehler}`,
    invoiceNumber: `RE-2026-${String(entwurfsZaehler).padStart(4, '0')}`,
    totalAmountCents: 4500,
    lineCount: 1,
    alreadyExists: false,
    priceSource: 'billing_tariffs',
    budgetDeckel: null,
    ...over,
  }
}

/** Mitschrift als Spion — ohne Datenbank. */
function protokollSpion(erledigt: string[] = []): LaufProtokoll & {
  eintraege: GruppenErgebnis[]
  vorgemerkt: SammelrechnungGruppe[]
} {
  const eintraege: GruppenErgebnis[] = []
  const vorgemerkt: SammelrechnungGruppe[] = []
  return {
    laufId: LAUF,
    erledigt: new Set(erledigt),
    eintraege,
    vorgemerkt,
    async vorbereiten(gruppen) { vorgemerkt.push(...gruppen) },
    async notiere(e) { eintraege.push(e) },
  }
}

beforeEach(() => {
  laufendeId = 0
  entwurfsZaehler = 0
  mockCreateInvoiceDraft.mockReset().mockImplementation(async () => entwurf())
  mockFreezeInvoice.mockReset().mockResolvedValue({
    snapshotId: 'snap-1', invoiceNumber: 'RE-2026-0001', checksum: 'x', version: 1,
  })
  mockLogBillingAction.mockReset().mockResolvedValue(undefined)
})

/** N Gruppen mit je einem abrechenbaren Nachweis. */
function bestandMit(n: number): Store {
  const nachweise = Array.from({ length: n }, (_, i) =>
    nachweis({ client_id: `klient-${String(i + 1).padStart(3, '0')}` }))
  return { service_records: nachweise, billing_tariffs: [tarif()] }
}

const engine = (store: Store, over: Record<string, unknown> = {}) =>
  fuehreSammelrechnungslaufAus(stub(store).client, {
    organizationId: ORG, periodMonth: MONAT, actorId: ACTOR, ...over,
  })

// ═══════════════════════════════════════════════════════════════
// 1. Wiederaufnahme
// ═══════════════════════════════════════════════════════════════

describe('Wiederaufnahme', () => {
  it('merkt ALLE Gruppen vor, bevor die erste bearbeitet wird', async () => {
    const p = protokollSpion()
    await engine(bestandMit(5), { protokoll: p })
    expect(p.vorgemerkt).toHaveLength(5)
    // Ohne diese Vormerkung wuesste ein spaeterer Versuch nicht, dass es
    // die Gruppe ueberhaupt gab — der Monat saehe fertig aus.
    expect(p.vorgemerkt.map(g => g.clientId)).toContain('klient-005')
  })

  it('ueberspringt Gruppen, die ein frueherer Versuch erledigt hat', async () => {
    const erledigt = ['klient-001', 'klient-002'].map(k => gruppenSchluessel(k, 'entlastung'))
    const p = protokollSpion(erledigt)

    const ergebnis = await engine(bestandMit(5), { protokoll: p })

    expect(ergebnis.gruppen).toBe(5)
    expect(ergebnis.uebernommen).toBe(2)
    expect(ergebnis.erstellt).toHaveLength(3)
    expect(mockCreateInvoiceDraft).toHaveBeenCalledTimes(3)
    for (const aufruf of mockCreateInvoiceDraft.mock.calls) {
      expect(['klient-001', 'klient-002']).not.toContain(aufruf[1].clientId)
    }
  })

  it('schreibt fuer uebernommene Gruppen KEINEN zweiten Protokolleintrag', async () => {
    const p = protokollSpion([gruppenSchluessel('klient-001', 'entlastung')])
    await engine(bestandMit(3), { protokoll: p })
    expect(p.eintraege.map(e => e.clientId)).toEqual(['klient-002', 'klient-003'])
  })

  it('schreibt fuer uebernommene Gruppen auch keinen zweiten Audit-Eintrag', async () => {
    // Zwei Audit-Eintraege fuer dieselbe uebersprungene Gruppe waeren
    // keine Spur mehr, sondern Rauschen — und im Zweifel die falsche
    // Antwort auf „wie oft wurde das nicht abgerechnet?".
    const store = bestandMit(2)
    store.service_records[0].budget_type = null   // wird uebersprungen
    const p1 = protokollSpion()
    await engine(store, { protokoll: p1 })
    const nachErstem = mockLogBillingAction.mock.calls.length

    mockLogBillingAction.mockClear()
    const p2 = protokollSpion(p1.eintraege.map(e => gruppenSchluessel(e.clientId, e.budgetType)))
    await engine(store, { protokoll: p2 })

    expect(nachErstem).toBeGreaterThan(0)
    expect(mockLogBillingAction).not.toHaveBeenCalled()
  })

  it('meldet nichts uebernommen, wenn es keinen Vorlauf gab', async () => {
    const ergebnis = await engine(bestandMit(3), { protokoll: protokollSpion() })
    expect(ergebnis.uebernommen).toBe(0)
  })

  it('laeuft ohne Protokoll unveraendert weiter — die Engine bleibt eigenstaendig', async () => {
    const ergebnis = await engine(bestandMit(3))
    expect(ergebnis.erstellt).toHaveLength(3)
    expect(ergebnis.uebernommen).toBe(0)
  })

  it('rechnet nichts, wenn der Vorlauf schon alles erledigt hatte', async () => {
    const alle = ['klient-001', 'klient-002', 'klient-003'].map(k => gruppenSchluessel(k, 'entlastung'))
    const ergebnis = await engine(bestandMit(3), { protokoll: protokollSpion(alle) })
    expect(ergebnis.uebernommen).toBe(3)
    expect(ergebnis.erstellt).toHaveLength(0)
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════
// 2. Teilfehler
// ═══════════════════════════════════════════════════════════════

describe('Teilfehler', () => {
  it('laesst die uebrigen neun Gruppen durchlaufen, wenn die dritte scheitert', async () => {
    let n = 0
    mockCreateInvoiceDraft.mockImplementation(async () => {
      n++
      if (n === 3) throw new Error('Datenbankverbindung verloren')
      return entwurf()
    })

    const p = protokollSpion()
    const ergebnis = await engine(bestandMit(10), { protokoll: p })

    expect(ergebnis.erstellt).toHaveLength(9)
    expect(ergebnis.uebersprungen).toHaveLength(1)
    expect(ergebnis.uebersprungen[0].code).toBe('FEHLER')
    expect(ergebnis.uebersprungen[0].clientId).toBe('klient-003')
    // Der Protokolleintrag unterscheidet technisches Scheitern von einer
    // bewussten Sperre — sonst sieht ein Ausfall wie eine Fachregel aus.
    expect(p.eintraege.find(e => e.clientId === 'klient-003')?.status).toBe('fehlgeschlagen')
    expect(p.eintraege.filter(e => e.status === 'erstellt')).toHaveLength(9)
  })

  it('unterscheidet Sperre und Ausfall im Protokoll', async () => {
    mockCreateInvoiceDraft.mockImplementation(async () => {
      throw new Error('MISSING_VALID_TARIFF: kein Tarif')
    })
    const p = protokollSpion()
    await engine(bestandMit(2), { protokoll: p })
    // TARIF_FEHLT ist eine bewusste Sperre — 'uebersprungen', nicht
    // 'fehlgeschlagen'. Niemand soll deswegen nachts geweckt werden.
    expect(p.eintraege.every(e => e.status === 'uebersprungen')).toBe(true)
    expect(p.eintraege.every(e => e.code === 'TARIF_FEHLT')).toBe(true)
  })

  it('faengt auch einen Fehler AUSSERHALB der Rechnungserstellung ab', async () => {
    // Ohne die aeussere Klammer im Lauf wuerde ein Fehler beim
    // Protokollschreiben die restlichen Gruppen mitreissen.
    const p = protokollSpion()
    let aufruf = 0
    const kaputt: LaufProtokoll = {
      ...p,
      async notiere(e) {
        aufruf++
        if (aufruf === 2) throw new Error('Mitschrift nicht erreichbar')
        return p.notiere(e)
      },
    }
    const ergebnis = await engine(bestandMit(5), { protokoll: kaputt })
    expect(ergebnis.erstellt).toHaveLength(5)
  })

  it('bricht den ganzen Lauf ab, wenn schon die Nachweise nicht ladbar sind', async () => {
    // Gegenprobe zur Teilfehler-Toleranz: was VOR den Gruppen scheitert,
    // ist kein Teilfehler. Ein Lauf, der ohne Daten „0 Gruppen" meldete,
    // saehe aus wie ein leerer Monat.
    const kaputt = {
      from: () => ({
        select: () => ({
          eq: () => ({ in: () => ({ gte: () => ({ lte: () => ({ order: () => ({ limit: () => ({
            returns: async () => ({ data: null, error: { message: 'Verbindung verloren' } }),
          }) }) }) }) }) }),
        }),
      }),
    } as any
    await expect(
      fuehreSammelrechnungslaufAus(kaputt, { organizationId: ORG, periodMonth: MONAT, actorId: ACTOR }),
    ).rejects.toThrow(/Leistungsnachweise nicht ladbar/)
  })
})

// ═══════════════════════════════════════════════════════════════
// 3. Idempotenz
// ═══════════════════════════════════════════════════════════════

describe('Idempotenz', () => {
  it('erzeugt beim zweiten vollstaendigen Lauf keinen zweiten Umsatz', async () => {
    const store = bestandMit(4)
    const erster = await engine(store, { protokoll: protokollSpion() })
    expect(erster.summeCent).toBe(4 * 4500)

    // Zweiter Lauf, ohne Protokoll-Gedaechtnis: die RPC meldet jede
    // Rechnung als bestehend. Sie darf NICHT erneut in die Summe.
    mockCreateInvoiceDraft.mockImplementation(async () => entwurf({ alreadyExists: true }))
    const zweiter = await engine(store, { protokoll: protokollSpion() })

    expect(zweiter.erstellt).toHaveLength(4)
    expect(zweiter.erstellt.every(e => e.alreadyExists)).toBe(true)
    expect(zweiter.summeCent).toBe(0)
  })

  it('markiert Bestandsrechnungen im Protokoll als solche', async () => {
    mockCreateInvoiceDraft.mockImplementation(async () => entwurf({ alreadyExists: true }))
    const p = protokollSpion()
    await engine(bestandMit(2), { protokoll: p })
    expect(p.eintraege.every(e => e.bestand === true)).toBe(true)
  })

  it('schreibt je Gruppe genau EINEN Protokolleintrag', async () => {
    const p = protokollSpion()
    await engine(bestandMit(8), { protokoll: p })
    const schluessel = p.eintraege.map(e => gruppenSchluessel(e.clientId, e.budgetType))
    expect(new Set(schluessel).size).toBe(schluessel.length)
    expect(schluessel).toHaveLength(8)
  })
})

// ═══════════════════════════════════════════════════════════════
// 4. Grosse Mengen
// ═══════════════════════════════════════════════════════════════

describe('Grosse Mengen', () => {
  it('verarbeitet 120 Gruppen vollstaendig', async () => {
    const p = protokollSpion()
    const ergebnis = await engine(bestandMit(120), { protokoll: p })

    expect(ergebnis.gruppen).toBe(120)
    expect(ergebnis.erstellt).toHaveLength(120)
    expect(ergebnis.summeCent).toBe(120 * 4500)
    expect(p.eintraege).toHaveLength(120)
    expect(ergebnis.nichtBetrachtet).toBe(0)
  })

  it('bearbeitet 120 Gruppen in stabiler Reihenfolge — Grundlage jeder Wiederaufnahme', async () => {
    const p = protokollSpion()
    await engine(bestandMit(120), { protokoll: p })
    const ids = p.eintraege.map(e => e.clientId)
    expect(ids).toEqual([...ids].sort())
  })

  it('haelt die Obergrenze ein und laesst den Rest offen', async () => {
    const p = protokollSpion()
    const ergebnis = await engine(bestandMit(120), { protokoll: p, maxGruppen: 50 })

    expect(ergebnis.erstellt).toHaveLength(50)
    expect(ergebnis.nichtBetrachtet).toBe(70)
    // Vorgemerkt sind trotzdem alle 120 — die 70 stehen als 'offen' in
    // der Gruppentabelle und werden beim naechsten Lauf fortgesetzt.
    expect(p.vorgemerkt).toHaveLength(120)
    expect(p.eintraege).toHaveLength(50)
  })

  it('setzt einen gekappten Lauf beim naechsten Mal fort', async () => {
    const store = bestandMit(120)
    const p1 = protokollSpion()
    await engine(store, { protokoll: p1, maxGruppen: 50 })

    const p2 = protokollSpion(p1.eintraege.map(e => gruppenSchluessel(e.clientId, e.budgetType)))
    const zweiter = await engine(store, { protokoll: p2, maxGruppen: 50 })

    expect(zweiter.uebernommen).toBe(50)
    expect(zweiter.erstellt).toHaveLength(50)
    expect(zweiter.nichtBetrachtet).toBe(20)
    // Keine Gruppe zweimal — das ist der Kern der Wiederaufnahme.
    const alle = [...p1.eintraege, ...p2.eintraege].map(e => e.clientId)
    expect(new Set(alle).size).toBe(alle.length)
  })

  it('schlaegt waehrend eines langen Laufs regelmaessig Herz', async () => {
    // Ohne Herzschlag gilt ein langer, gesunder Lauf nach `staleMinuten`
    // als verwaist und wird von einem zweiten uebernommen — mitten in
    // der Arbeit. Geprueft wird hier der ECHTE Pfad ueber die
    // Betriebsschicht, nicht eine nachgebaute Taktung.
    const store = bestandMit(45)
    let herzschlaege = 0
    const client = {
      from: (t: string) => new QB(t, store),
      rpc: async (name: string) => {
        if (name === 'sammelrechnung_lauf_heartbeat') { herzschlaege++; return { data: true, error: null } }
        if (name === 'sammelrechnung_lauf_beanspruchen') {
          return { data: [{ lauf_id: LAUF, wiederaufnahme: false, offene_gruppen: 0 }], error: null }
        }
        return { data: null, error: null }
      },
    } as any

    const ergebnis = await starteSammelrechnungslauf(client, {
      organizationId: ORG, periodMonth: MONAT, actorId: ACTOR, heartbeatAlle: 10,
    })

    expect(ergebnis.erstellt).toHaveLength(45)
    expect(herzschlaege).toBe(4)   // nach Gruppe 10, 20, 30, 40
  })
})

// ═══════════════════════════════════════════════════════════════
// 5. Batch-ID im Audit-Trail
// ═══════════════════════════════════════════════════════════════

describe('Batch-ID', () => {
  it('haengt an jedem Audit-Eintrag des Laufs', async () => {
    const store = bestandMit(2)
    store.service_records[0].budget_type = null   // eine uebersprungene Gruppe
    await engine(store, { protokoll: protokollSpion() })

    const eintraege = mockLogBillingAction.mock.calls.map(c => c[1])
    expect(eintraege.length).toBeGreaterThan(0)
    expect(eintraege.every((e: Record<string, unknown>) => e.batchId === LAUF)).toBe(true)
  })

  it('fehlt ohne Lauf — ein Einzelvorgang gehoert zu keinem Stapel', async () => {
    const store = bestandMit(1)
    store.service_records[0].budget_type = null
    await engine(store)
    const eintraege = mockLogBillingAction.mock.calls.map(c => c[1])
    expect(eintraege.every((e: Record<string, unknown>) => e.batchId === undefined)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// 6. Doppelstart an der Betriebsschicht
// ═══════════════════════════════════════════════════════════════

describe('starteSammelrechnungslauf', () => {
  it('macht aus der Absage der Datenbank einen eigenen Fehlertyp', async () => {
    const { client } = stub(bestandMit(1), {
      rpc: {
        sammelrechnung_lauf_beanspruchen: {
          error: { message: 'SAMMELRECHNUNG_LAEUFT: Für 2026-07 läuft bereits ein Lauf (abc).' },
        },
      },
    })

    await expect(
      starteSammelrechnungslauf(client, { organizationId: ORG, periodMonth: MONAT, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(SammelrechnungLaeuftBereitsError)

    // Und nichts wurde gerechnet: die Sperre greift VOR der ersten Gruppe.
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
  })

  it('behandelt den UNIQUE-Verstoss (23505) genauso', async () => {
    const { client } = stub(bestandMit(1), {
      rpc: {
        sammelrechnung_lauf_beanspruchen: {
          error: { message: 'duplicate key value violates unique constraint', code: '23505' },
        },
      },
    })
    await expect(
      starteSammelrechnungslauf(client, { organizationId: ORG, periodMonth: MONAT, actorId: ACTOR }),
    ).rejects.toBeInstanceOf(SammelrechnungLaeuftBereitsError)
  })

  it('liefert Batch-ID und Kopfsatz zurueck', async () => {
    const store = bestandMit(3)
    const { client, rpcAufrufe } = stub(store, {
      rpc: {
        sammelrechnung_lauf_beanspruchen: {
          data: [{ lauf_id: LAUF, wiederaufnahme: false, offene_gruppen: 0 }],
        },
        sammelrechnung_lauf_abschliessen: {
          data: {
            id: LAUF, organization_id: ORG, period_month: MONAT, status: 'abgeschlossen',
            versuch: 1, gestartet_am: '2026-08-01T10:00:00Z', beendet_am: '2026-08-01T10:00:05Z',
            laufzeit_ms: 5000, gruppen_gesamt: 3, gruppen_erstellt: 3, gruppen_uebersprungen: 0,
            gruppen_fehlgeschlagen: 0, gruppen_offen: 0, summe_cent: 13500, abbruchgrund: null,
            festschreiben: false, auto_versand: false, actor_id: ACTOR,
          },
        },
      },
    })

    const ergebnis = await starteSammelrechnungslauf(client, {
      organizationId: ORG, periodMonth: MONAT, actorId: ACTOR,
    })

    expect(ergebnis.batchId).toBe(LAUF)
    expect(ergebnis.wiederaufnahme).toBe(false)
    expect(ergebnis.kopf.laufzeitMs).toBe(5000)
    expect(ergebnis.kopf.gruppenErstellt).toBe(3)
    expect(rpcAufrufe.map(r => r.name)).toContain('sammelrechnung_lauf_abschliessen')
  })

  it('setzt einen Lauf mit offenen Gruppen auf abgebrochen, nicht auf abgeschlossen', async () => {
    // Ein Lauf, der noch Gruppen offen hat, ist nicht fertig. Ihn als
    // abgeschlossen zu melden waere die gefaehrlichere Unwahrheit: der
    // Monat saehe abgerechnet aus.
    const abschluesse: string[] = []
    const store = bestandMit(3)
    const client = {
      from: (t: string) => new QB(t, store),
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === 'sammelrechnung_lauf_beanspruchen') {
          return { data: [{ lauf_id: LAUF, wiederaufnahme: false, offene_gruppen: 0 }], error: null }
        }
        if (name === 'sammelrechnung_lauf_abschliessen') {
          abschluesse.push(String(args.p_status))
          return {
            data: {
              id: LAUF, organization_id: ORG, period_month: MONAT,
              status: args.p_status, versuch: 1, gestartet_am: '2026-08-01T10:00:00Z',
              beendet_am: null, laufzeit_ms: 1, gruppen_gesamt: 3, gruppen_erstellt: 1,
              gruppen_uebersprungen: 0, gruppen_fehlgeschlagen: 0,
              gruppen_offen: args.p_status === 'abgeschlossen' ? 2 : 0,
              summe_cent: 0, abbruchgrund: null, festschreiben: false,
              auto_versand: false, actor_id: ACTOR,
            },
            error: null,
          }
        }
        return { data: null, error: null }
      },
    } as any

    await starteSammelrechnungslauf(client, { organizationId: ORG, periodMonth: MONAT, actorId: ACTOR })
    expect(abschluesse).toEqual(['abgeschlossen', 'abgebrochen'])
  })

  it('setzt den Lauf bei einem Absturz auf fehlgeschlagen, statt ihn haengen zu lassen', async () => {
    const abschluesse: Array<Record<string, unknown>> = []
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({ in: () => ({ gte: () => ({ lte: () => ({ order: () => ({ limit: () => ({
            returns: async () => ({ data: null, error: { message: 'Verbindung verloren' } }),
          }) }) }) }) }) }),
        }),
      }),
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === 'sammelrechnung_lauf_beanspruchen') {
          return { data: [{ lauf_id: LAUF, wiederaufnahme: false, offene_gruppen: 0 }], error: null }
        }
        if (name === 'sammelrechnung_lauf_abschliessen') { abschluesse.push(args); return { data: null, error: null } }
        return { data: null, error: null }
      },
    } as any

    await expect(
      starteSammelrechnungslauf(client, { organizationId: ORG, periodMonth: MONAT, actorId: ACTOR }),
    ).rejects.toThrow(/Leistungsnachweise nicht ladbar/)

    // Sonst haelt ein einziger Absturz den Monat bis zum Ablauf der
    // Stale-Frist besetzt.
    expect(abschluesse).toHaveLength(1)
    expect(abschluesse[0].p_status).toBe('fehlgeschlagen')
  })
})
