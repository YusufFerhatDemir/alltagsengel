/**
 * Block 32 — eskaliert, aber nie benachrichtigt
 *
 * BEFUND (14.09.2026)
 *
 * `runDunningRun` erhöht die Mahnstufe UND bucht die Mahngebühr, bevor es
 * das Schreiben erzeugt. `sendDunningEmail` kehrte bei fehlender
 * Klienten-E-Mail wortlos zurück — und der Zähler stand außerhalb dieses
 * Pfads:
 *
 *     await sendDunningEmail(...)   // kehrt wortlos zurück
 *     emailCount++                  // zählt trotzdem als versendet
 *
 * Ein Klient ohne E-Mail-Adresse konnte so Stufe für Stufe bis zur
 * Inkasso-Vorbereitung hochlaufen, Gebühren tragen und nie ein Schreiben
 * bekommen — während der Lauf meldete, es seien Mahnungen versendet
 * worden.
 *
 * Live betrifft das 1 von 4 Klienten (Erika Testfall, ohne E-Mail).
 *
 * Testdaten: synthetisch, keine echten Kunden-/Gesundheitsdaten.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockLogBillingAction, mockCreateDoc, mockGenerateEmail } = vi.hoisted(() => ({
  mockLogBillingAction: vi.fn(),
  mockCreateDoc: vi.fn(async () => ({ documentId: 'doc-1', mahnungData: {} })),
  mockGenerateEmail: vi.fn(() => ({ subject: 'Zahlungserinnerung', body: 'Text' })),
}))

vi.mock('@/lib/billing/core/audit', () => ({
  logBillingAction: mockLogBillingAction,
  computeChecksum: vi.fn(),
  computeContentHash: vi.fn(),
  computeSnapshotChecksum: vi.fn(),
}))

vi.mock('@/lib/billing/dunning/mahnung-pdf', () => ({
  createMahnungDocument: mockCreateDoc,
  generateMahnungEmail: mockGenerateEmail,
}))

vi.mock('@/lib/utils/timezone', () => ({
  heuteBerlin: () => '2026-08-13',
  datumBerlin: (d: Date) => d.toISOString().slice(0, 10),
  monatBerlin: () => '2026-08',
  berlinParts: () => ({ year: '2026', month: '08', day: '13' }),
}))

import { runDunningRun } from '@/lib/billing/core/dunning'

const ORG = '00000000-0000-4000-8000-000460629986'
const ACTOR = '11111111-1111-4111-8111-111111111111'

type Row = Record<string, any>
type Store = Record<string, Row[]>

class QB {
  private rows: Row[]
  private pending: Row | null = null
  private mode: 'select' | 'insert' | 'update' = 'select'
  private filters: Array<(r: Row) => boolean> = []
  constructor(private table: string, store: Store) { this.rows = store[table] || (store[table] = []) }
  select() { return this }
  order() { return this }
  eq(c: string, v: any) { this.filters.push(r => r[c] === v); return this }
  neq(c: string, v: any) { this.filters.push(r => r[c] !== v); return this }
  is(c: string, v: any) { this.filters.push(r => (r[c] ?? null) === v); return this }
  lt(c: string, v: any) { this.filters.push(r => r[c] < v); return this }
  gte(c: string, v: any) { this.filters.push(r => r[c] >= v); return this }
  in(c: string, a: any[]) { this.filters.push(r => a.includes(r[c])); return this }
  not(c: string) { this.filters.push(r => (r[c] ?? null) !== null); return this }
  insert(p: Row) { this.mode = 'insert'; this.pending = { id: `${this.table}-${this.rows.length + 1}`, ...p }; this.rows.push(this.pending); return this }
  update(p: Row) { this.mode = 'update'; this.pending = p; return this }
  private matched(): Row[] { return this.rows.filter(r => this.filters.every(f => f(r))) }
  private resolve() {
    if (this.mode === 'insert') return { data: this.pending, error: null }
    if (this.mode === 'update') {
      const betroffen = this.matched()
      for (const r of betroffen) Object.assign(r, this.pending)
      return { data: betroffen, error: null }
    }
    return { data: this.matched(), error: null }
  }
  limit() { return Promise.resolve(this.resolve()) }
  single() {
    if (this.mode === 'insert') return Promise.resolve({ data: this.pending, error: null })
    const m = this.matched()
    return Promise.resolve(m.length === 1 ? { data: m[0], error: null } : { data: null, error: { message: 'not found' } })
  }
  maybeSingle() {
    if (this.mode === 'insert') return Promise.resolve({ data: this.pending, error: null })
    return Promise.resolve({ data: this.matched()[0] ?? null, error: null })
  }
  then(res: any, rej?: any) { return Promise.resolve(this.resolve()).then(res, rej) }
}

const makeDb = (store: Store) => ({ from: (t: string) => new QB(t, store) }) as any

/** `client` ist der eingebettete Join, den sendDunningEmail mitliest. */
function invoice(over: Partial<Row> = {}): Row {
  return {
    id: 'inv-1', organization_id: ORG,
    invoice_number: 'RE-2026-0001', invoice_number_formatted: 'RE-2026-0001',
    status: 'uebermittelt', total_amount: 100, paid_amount: 0,
    due_date: '2026-07-01', deleted_at: null,
    frozen_at: '2026-06-01T00:00:00Z', dunning_level: 'offen',
    client: { email: 'kundin@example.test', first_name: 'Erika', last_name: 'Muster' },
    ...over,
  }
}

const store = (invoices: Row[]): Store => ({
  invoices, dunning_entries: [], invoice_disputes: [],
  payment_differences: [], invoice_corrections: [],
})

beforeEach(() => {
  mockLogBillingAction.mockReset()
  mockCreateDoc.mockClear()
  mockGenerateEmail.mockClear()
})

describe('Mahnlauf — Eskalation ohne Zustellung', () => {
  it('reiht die Mahnung ein, wenn der Klient eine E-Mail-Adresse hat', async () => {
    const s = store([invoice()])
    const r = await runDunningRun(makeDb(s), ORG, ACTOR, { sendEmails: true })

    expect(r.eskaliert).toHaveLength(1)
    expect(r.emailsVersendet).toBe(1)
    expect(r.nichtBenachrichtigt).toHaveLength(0)
    expect(s.dunning_email_queue).toHaveLength(1)
  })

  it('zählt eine Rechnung OHNE Empfängeradresse nicht als versendet', async () => {
    // DER Befund: vorher stand hier emailsVersendet = 1.
    const s = store([invoice({ client: { email: null, first_name: 'Erika', last_name: 'Testfall' } })])
    const r = await runDunningRun(makeDb(s), ORG, ACTOR, { sendEmails: true })

    expect(r.eskaliert).toHaveLength(1)
    expect(r.emailsVersendet).toBe(0)
  })

  it('nennt die nicht benachrichtigte Rechnung mit Grund im Klartext', async () => {
    const s = store([invoice({ client: { email: null, first_name: 'Erika', last_name: 'Testfall' } })])
    const r = await runDunningRun(makeDb(s), ORG, ACTOR, { sendEmails: true })

    expect(r.nichtBenachrichtigt).toHaveLength(1)
    expect(r.nichtBenachrichtigt![0].invoiceNumber).toBe('RE-2026-0001')
    expect(r.nichtBenachrichtigt![0].reason).toMatch(/keine E-Mail-Adresse/)
    // Der Grund muss sagen, was zu tun ist — nicht nur, was fehlt.
    expect(r.nichtBenachrichtigt![0].reason).toMatch(/Postweg/)
  })

  it('erzeugt ohne Empfänger auch kein Mahndokument', async () => {
    // Sonst läge ein PDF herum, das nie jemand bekommen hat.
    const s = store([invoice({ client: { email: null } })])
    await runDunningRun(makeDb(s), ORG, ACTOR, { sendEmails: true })
    expect(mockCreateDoc).not.toHaveBeenCalled()
  })

  it('eskaliert trotzdem — die Forderung bleibt bestehen', async () => {
    // Bewusst KEIN Rollback der Mahnstufe: die Rechnung ist überfällig,
    // daran ändert eine fehlende Adresse nichts. Der Lauf sagt nur
    // deutlich, dass die Zustellung aussteht.
    const s = store([invoice({ client: { email: null } })])
    const r = await runDunningRun(makeDb(s), ORG, ACTOR, { sendEmails: true })

    expect(r.eskaliert[0].toLevel).toBeDefined()
    expect(s.dunning_entries[0].dunning_level).not.toBe('offen')
  })

  it('trennt zugestellt und nicht zugestellt im selben Lauf', async () => {
    const s = store([
      invoice({ id: 'inv-1', invoice_number_formatted: 'RE-0001' }),
      invoice({ id: 'inv-2', invoice_number_formatted: 'RE-0002', client: { email: null } }),
    ])
    const r = await runDunningRun(makeDb(s), ORG, ACTOR, { sendEmails: true })

    expect(r.eskaliert).toHaveLength(2)
    expect(r.emailsVersendet).toBe(1)
    expect(r.nichtBenachrichtigt).toHaveLength(1)
    expect(r.nichtBenachrichtigt![0].invoiceNumber).toBe('RE-0002')
  })

  it('meldet eine leere Adresse wie eine fehlende', async () => {
    const s = store([invoice({ client: { email: '   ' } })])
    const r = await runDunningRun(makeDb(s), ORG, ACTOR, { sendEmails: true })
    expect(r.emailsVersendet).toBe(0)
    expect(r.nichtBenachrichtigt).toHaveLength(1)
  })

  it('lässt die Felder weg, wenn gar nicht versendet werden soll', async () => {
    // Ohne sendEmails ist „nicht benachrichtigt" keine Aussage — der Lauf
    // sollte dann auch nicht so tun, als habe er es versucht.
    const s = store([invoice()])
    const r = await runDunningRun(makeDb(s), ORG, ACTOR)
    expect(r.emailsVersendet).toBeUndefined()
    expect(r.nichtBenachrichtigt).toBeUndefined()
  })
})
