/**
 * Mahnlauf (runDunningRun) — automatische Mahnstufen-Eskalation
 *
 * Abgedeckt:
 *   1. Nicht mahnfaehige Status (Entwurf, geprueft, storniert, bezahlt …)
 *   2. Bezahlte/ausgeglichene Rechnungen werden uebersprungen
 *   3. Fristen: 14 Erinnerung, 28 1. Mahnung, 42 2. Mahnung
 *   4. Frist noch nicht erreicht → unveraendert
 *   5. Nur EINE Stufe pro Lauf, auch bei 200 Tagen Verzug
 *   6. Karenz ueber next_dunning_at
 *   7. Manuell blockierte Eintraege
 *   8. Fachliche Blocker (offene Beanstandung) blockieren die Eskalation
 *   9. Hoechststufe kann nicht weiter eskaliert werden
 *  10. dryRun schreibt nichts
 *
 * Testdaten: Synthetisch, keine echten Kunden-/Gesundheitsdaten.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockLogBillingAction } = vi.hoisted(() => ({
  mockLogBillingAction: vi.fn(),
}))

vi.mock('@/lib/billing/core/audit', () => ({
  logBillingAction: mockLogBillingAction,
  computeChecksum: vi.fn(),
  computeContentHash: vi.fn(),
  computeSnapshotChecksum: vi.fn(),
}))

// heuteBerlin fixieren — der Lauf rechnet Verzugstage gegen "heute".
vi.mock('@/lib/utils/timezone', () => ({
  heuteBerlin: () => '2026-08-13',
  datumBerlin: (d: Date) => d.toISOString().slice(0, 10),
  monatBerlin: () => '2026-08',
  berlinParts: () => ({ year: '2026', month: '08', day: '13' }),
}))

import { runDunningRun, DUNNING_DAYS } from '@/lib/billing/core/dunning'

const ORG = '00000000-0000-4000-8000-000460629986'
const ACTOR = '11111111-1111-4111-8111-111111111111'

// ═══════════════════════════════════════════════════════════════
// Minimaler In-Memory-Supabase-Stub
// ═══════════════════════════════════════════════════════════════

type Row = Record<string, any>
type Store = Record<string, Row[]>

class QB {
  private rows: Row[]
  private pending: Row | null = null
  private mode: 'select' | 'insert' | 'update' = 'select'
  private filters: Array<(r: Row) => boolean> = []

  constructor(private table: string, private store: Store) {
    this.rows = store[table] || (store[table] = [])
  }

  select() { return this }
  order() { return this }

  eq(col: string, val: any) { this.filters.push(r => r[col] === val); return this }
  neq(col: string, val: any) { this.filters.push(r => r[col] !== val); return this }
  is(col: string, val: any) { this.filters.push(r => (r[col] ?? null) === val); return this }
  lt(col: string, val: any) { this.filters.push(r => r[col] < val); return this }
  gte(col: string, val: any) { this.filters.push(r => r[col] >= val); return this }
  in(col: string, arr: any[]) { this.filters.push(r => arr.includes(r[col])); return this }
  not(col: string, _op: string, _val: any) { this.filters.push(r => (r[col] ?? null) !== null); return this }

  insert(payload: Row) {
    this.mode = 'insert'
    this.pending = { id: `${this.table}-${this.rows.length + 1}`, ...payload }
    this.rows.push(this.pending)
    return this
  }

  update(payload: Row) {
    this.mode = 'update'
    this.pending = payload
    return this
  }

  private matched(): Row[] {
    return this.rows.filter(r => this.filters.every(f => f(r)))
  }

  private resolve() {
    if (this.mode === 'insert') return { data: this.pending, error: null }
    if (this.mode === 'update') {
      for (const r of this.matched()) Object.assign(r, this.pending)
      return { data: null, error: null }
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
    const m = this.matched()
    return Promise.resolve({ data: m[0] ?? null, error: null })
  }

  then(res: any, rej?: any) { return Promise.resolve(this.resolve()).then(res, rej) }
}

function makeDb(store: Store) {
  return { from: (table: string) => new QB(table, store) } as any
}

function invoice(over: Partial<Row> = {}): Row {
  return {
    id: 'inv-1',
    organization_id: ORG,
    invoice_number: 'RE-2026-0001',
    invoice_number_formatted: 'RE-2026-0001',
    status: 'uebermittelt',
    total_amount: 100,
    paid_amount: 0,
    due_date: '2026-07-01', // 43 Tage vor dem fixierten "heute"
    deleted_at: null,
    dunning_level: 'offen',
    ...over,
  }
}

function emptyStore(invoices: Row[], dunning: Row[] = []): Store {
  return {
    invoices,
    dunning_entries: dunning,
    invoice_disputes: [],
    payment_differences: [],
    invoice_corrections: [],
  }
}

beforeEach(() => { mockLogBillingAction.mockReset() })

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe('runDunningRun — Vorfilter', () => {
  it('mahnt keine Entwuerfe und keine nur geprueften Rechnungen', async () => {
    const store = emptyStore([
      invoice({ id: 'a', status: 'entwurf' }),
      invoice({ id: 'b', status: 'geprueft' }),
    ])
    const r = await runDunningRun(makeDb(store), ORG, ACTOR)
    expect(r.geprueft).toBe(0)
    expect(r.eskaliert).toHaveLength(0)
    expect(store.dunning_entries).toHaveLength(0)
  })

  it('mahnt keine stornierten, bezahlten, strittigen oder abgeschriebenen Rechnungen', async () => {
    const store = emptyStore(
      ['storniert', 'bezahlt', 'akzeptiert', 'abgeschrieben', 'strittig', 'abgelehnt', 'korrektur_erforderlich']
        .map((status, i) => invoice({ id: `s${i}`, status }))
    )
    const r = await runDunningRun(makeDb(store), ORG, ACTOR)
    expect(r.geprueft).toBe(0)
  })

  it('mahnt Alt-Status wie "sent" weiterhin', async () => {
    const store = emptyStore([invoice({ status: 'sent' })])
    const r = await runDunningRun(makeDb(store), ORG, ACTOR)
    expect(r.geprueft).toBe(1)
    expect(r.eskaliert).toHaveLength(1)
  })

  it('ueberspringt vollstaendig ausgeglichene Rechnungen', async () => {
    const store = emptyStore([invoice({ total_amount: 100, paid_amount: 100 })])
    const r = await runDunningRun(makeDb(store), ORG, ACTOR)
    expect(r.geprueft).toBe(0)
  })

  it('mahnt Teilzahlungen mit Restbetrag', async () => {
    const store = emptyStore([invoice({ total_amount: 100, paid_amount: 40 })])
    const r = await runDunningRun(makeDb(store), ORG, ACTOR)
    expect(r.geprueft).toBe(1)
    expect(r.eskaliert).toHaveLength(1)
  })
})

describe('runDunningRun — Fristen', () => {
  it('eskaliert bei 43 Tagen Verzug von "offen" auf "Zahlungserinnerung"', async () => {
    const store = emptyStore([invoice()])
    const r = await runDunningRun(makeDb(store), ORG, ACTOR)
    expect(r.eskaliert).toHaveLength(1)
    expect(r.eskaliert[0].fromLevel).toBe('offen')
    expect(r.eskaliert[0].toLevel).toBe('erinnerung')
    expect(r.eskaliert[0].daysOverdue).toBe(43)
    expect(store.invoices[0].dunning_level).toBe('erinnerung')
  })

  it('laesst eine Rechnung mit 13 Tagen Verzug unveraendert (Frist 14 nicht erreicht)', async () => {
    // 2026-07-31 → 13 Tage vor 2026-08-13
    const store = emptyStore([invoice({ due_date: '2026-07-31' })])
    const r = await runDunningRun(makeDb(store), ORG, ACTOR)
    expect(r.geprueft).toBe(1)
    expect(r.eskaliert).toHaveLength(0)
    expect(r.unveraendert).toBe(1)
  })

  it('haelt die Frist-Konstanten 14 / 28 / 42 ein', () => {
    expect(DUNNING_DAYS.erinnerung).toBe(14)
    expect(DUNNING_DAYS.mahnung_1).toBe(28)
    expect(DUNNING_DAYS.mahnung_2).toBe(42)
  })

  it('eskaliert von "erinnerung" auf "1. Mahnung", sobald 28 Tage erreicht sind', async () => {
    const store = emptyStore(
      [invoice()],
      [{ id: 'd1', invoice_id: 'inv-1', organization_id: ORG, dunning_level: 'erinnerung', due_date: '2026-07-01', next_dunning_at: null, dunning_fee_cents: 0 }]
    )
    const r = await runDunningRun(makeDb(store), ORG, ACTOR)
    expect(r.eskaliert[0].toLevel).toBe('mahnung_1')
    expect(r.eskaliert[0].feeCents).toBe(250)
  })
})

describe('runDunningRun — eine Stufe pro Lauf', () => {
  it('springt bei 200 Tagen Verzug nicht direkt auf Inkasso', async () => {
    const store = emptyStore([invoice({ due_date: '2026-01-01' })])
    const r = await runDunningRun(makeDb(store), ORG, ACTOR)
    expect(r.eskaliert).toHaveLength(1)
    expect(r.eskaliert[0].toLevel).toBe('erinnerung')
    expect(store.dunning_entries[0].dunning_level).toBe('erinnerung')
  })

  it('respektiert die Wiedervorlage next_dunning_at', async () => {
    const store = emptyStore(
      [invoice({ due_date: '2026-01-01' })],
      [{ id: 'd1', invoice_id: 'inv-1', organization_id: ORG, dunning_level: 'erinnerung', due_date: '2026-01-01', next_dunning_at: '2026-09-01', dunning_fee_cents: 0 }]
    )
    const r = await runDunningRun(makeDb(store), ORG, ACTOR)
    expect(r.eskaliert).toHaveLength(0)
    expect(r.unveraendert).toBe(1)
    expect(store.dunning_entries[0].dunning_level).toBe('erinnerung')
  })

  it('eskaliert nicht ueber die Inkasso-Vorbereitung hinaus', async () => {
    const store = emptyStore(
      [invoice({ due_date: '2026-01-01' })],
      [{ id: 'd1', invoice_id: 'inv-1', organization_id: ORG, dunning_level: 'inkasso_vorbereitung', due_date: '2026-01-01', next_dunning_at: null, dunning_fee_cents: 0 }]
    )
    const r = await runDunningRun(makeDb(store), ORG, ACTOR)
    expect(r.eskaliert).toHaveLength(0)
    expect(r.unveraendert).toBe(1)
  })
})

describe('runDunningRun — Blocker', () => {
  it('meldet manuell blockierte Eintraege als blockiert', async () => {
    const store = emptyStore(
      [invoice()],
      [{ id: 'd1', invoice_id: 'inv-1', organization_id: ORG, dunning_level: 'offen', due_date: '2026-07-01', block_dunning: true, block_reason: 'Ratenzahlung vereinbart', dunning_fee_cents: 0 }]
    )
    const r = await runDunningRun(makeDb(store), ORG, ACTOR)
    expect(r.eskaliert).toHaveLength(0)
    expect(r.blockiert).toHaveLength(1)
    expect(r.blockiert[0].reason).toContain('Ratenzahlung vereinbart')
  })

  it('blockiert bei offener Beanstandung', async () => {
    const store = emptyStore([invoice()])
    store.invoice_disputes.push({ id: 'x', invoice_id: 'inv-1', status: 'open' })
    const r = await runDunningRun(makeDb(store), ORG, ACTOR)
    expect(r.eskaliert).toHaveLength(0)
    expect(r.blockiert[0].reason).toContain('Beanstandung')
    expect(store.invoices[0].dunning_level).toBe('offen')
  })

  it('blockiert bei offener Gutschrift/Korrektur', async () => {
    const store = emptyStore([invoice()])
    store.invoice_corrections.push({ id: 'k', original_invoice_id: 'inv-1', status: 'entwurf' })
    const r = await runDunningRun(makeDb(store), ORG, ACTOR)
    expect(r.blockiert[0].reason).toContain('Gutschrift')
  })
})

describe('runDunningRun — dryRun', () => {
  it('meldet die Eskalation, schreibt aber nichts', async () => {
    const store = emptyStore([invoice()])
    const r = await runDunningRun(makeDb(store), ORG, ACTOR, { dryRun: true })
    expect(r.dryRun).toBe(true)
    expect(r.eskaliert).toHaveLength(1)
    expect(r.eskaliert[0].toLevel).toBe('erinnerung')
    expect(store.dunning_entries).toHaveLength(0)
    expect(store.invoices[0].dunning_level).toBe('offen')
    expect(mockLogBillingAction).not.toHaveBeenCalled()
  })
})

// ═══════════════════════════════════════════════════════════════
// Agent 2 / E2E-Nutzerworkflow — Schritt 14 „Mahnwesen, 5 Stufen"
// ═══════════════════════════════════════════════════════════════

describe('Mahnleiter — die geforderten 5 Stufen', () => {
  it('hält die Fristen 14 / 28 / 42 / 56 / 70 ein', () => {
    expect(DUNNING_DAYS.erinnerung).toBe(14)
    expect(DUNNING_DAYS.mahnung_1).toBe(28)
    expect(DUNNING_DAYS.mahnung_2).toBe(42)
    expect(DUNNING_DAYS.letzte_mahnung).toBe(56)
    expect(DUNNING_DAYS.inkasso_vorbereitung).toBe(70)
  })

  it('läuft die Leiter Stufe für Stufe durch — ein Schritt je Lauf', async () => {
    // 200 Tage Verzug: die Frist JEDER Stufe ist erreicht. Trotzdem darf pro
    // Lauf nur eine Stufe fallen — eine Mahnung muss beim Kunden gewesen sein,
    // bevor die nächste rausgeht.
    const store = emptyStore([invoice({ due_date: '2026-01-25' })])
    const db = makeDb(store)
    const erreicht: string[] = []

    for (let lauf = 0; lauf < 6; lauf++) {
      // Karenz für den nächsten Lauf zurücksetzen: in echt liegen zwischen
      // den Läufen Tage, hier laufen sie am selben fixierten "heute".
      for (const d of store.dunning_entries) d.next_dunning_at = null
      const r = await runDunningRun(db, ORG, ACTOR)
      if (r.eskaliert.length > 0) erreicht.push(r.eskaliert[0].toLevel)
    }

    expect(erreicht).toEqual([
      'erinnerung', 'mahnung_1', 'mahnung_2', 'letzte_mahnung', 'inkasso_vorbereitung',
    ])
    // Der sechste Lauf findet die Höchststufe und lässt sie stehen.
    expect(store.invoices[0].dunning_level).toBe('inkasso_vorbereitung')
  })

  it('setzt die Wiedervorlage nie in die Vergangenheit', async () => {
    // Befund: der Blick "zwei Stufen weiter" traf bei letzte_mahnung auf
    // 'bezahlt' (DUNNING_DAYS 0) und ergab 0 − 56 = −56 Tage.
    const store = emptyStore(
      [invoice({ due_date: '2026-01-25' })],
      [{
        id: 'd1', invoice_id: 'inv-1', organization_id: ORG,
        dunning_level: 'letzte_mahnung', due_date: '2026-01-25',
        next_dunning_at: null, dunning_fee_cents: 0,
      }],
    )
    const r = await runDunningRun(makeDb(store), ORG, ACTOR)

    expect(r.eskaliert[0].toLevel).toBe('inkasso_vorbereitung')
    expect(store.dunning_entries[0].next_dunning_at >= '2026-08-13').toBe(true)
  })

  it('staffelt die Mahngebühren aufsteigend', async () => {
    const store = emptyStore([invoice({ due_date: '2026-01-25' })])
    const db = makeDb(store)
    const gebuehren: number[] = []

    for (let lauf = 0; lauf < 5; lauf++) {
      for (const d of store.dunning_entries) d.next_dunning_at = null
      const r = await runDunningRun(db, ORG, ACTOR)
      if (r.eskaliert.length > 0) gebuehren.push(r.eskaliert[0].feeCents)
    }

    // Zahlungserinnerung bleibt gebührenfrei, danach steigt es.
    expect(gebuehren).toEqual([0, 250, 500, 750, 1000])
    expect(store.dunning_entries[0].dunning_fee_cents).toBe(2500)
  })
})
