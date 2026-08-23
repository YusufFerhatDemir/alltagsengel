/**
 * Sammelrechnungslauf (Batch-Invoicing)
 *
 * Der Lauf buendelt die Rechnungserstellung eines Monats ueber alle Klienten.
 * Getestet wird vor allem, was er NICHT tut: kein blockierter Tarif, kein
 * unverifizierter Kassentarif, kein unsignierter Nachweis und keine
 * unbekannte Leistungsart darf zu einer Rechnung fuehren.
 *
 * Abgedeckt:
 *   Gruppenbildung
 *     1. (Klient, Budget-Typ) ist das Raster — je Kombination eine Gruppe
 *     2. Nur 'complete' ohne 'signed' bildet keine Gruppe (Freigabe offen)
 *     3. Org-Fence: fremde Mandanten bleiben aussen vor
 *     4. clientIds schraenkt ein
 *   Fail-Closed-Sperren (VOR dem Schreiben)
 *     5. Tarif 'blocked'      → TARIF_NICHT_VERIFIZIERT, keine Rechnung
 *     6. Tarif 'unverified' bei Kasse → TARIF_NICHT_VERIFIZIERT
 *     7. Tarif 'unverified' bei Privat → wird abgerechnet (Regel der RPC)
 *     8. Kein Tarif / abgelaufener Tarif → TARIF_FEHLT
 *     9. Leistungsart ohne Tarif-Schluessel → LEISTUNGSART_UNBEKANNT
 *    10. Budget-Typ unbekannt/leer → BUDGETTYP_UNBEKANNT
 *    11. Fehlender Unterschriftsnachweis → UNTERSCHRIFT_FEHLT
 *    12. Eine einzige gesperrte Zeile sperrt die ganze Gruppe
 *   Lauf
 *    13. Happy Path erzeugt Rechnung und summiert
 *    14. alreadyExists zaehlt nicht in die Summe
 *    15. dryRun schreibt nichts
 *    16. Fehler der RPC werden auf Ueberspring-Codes abgebildet
 *    17. Uebersprungene Gruppen landen im Audit-Trail
 *    18. autoVersand ohne festschreiben wird abgelehnt
 *    19. festschreiben: entwurf → geprueft → freeze
 *    20. Ein Fehler beim Festschreiben verwirft die Rechnung nicht
 *    21. maxGruppen kappt sichtbar, nicht still
 *   Hilfsfunktionen
 *    22. monatsZeitraum (inkl. Schaltjahr)
 *    23. Fehlerabbildung
 *
 * Testdaten: synthetisch, keine echten Kunden- oder Gesundheitsdaten.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreateInvoiceDraft, mockFreezeInvoice, mockLogBillingAction } = vi.hoisted(() => ({
  mockCreateInvoiceDraft: vi.fn(),
  mockFreezeInvoice: vi.fn(),
  mockLogBillingAction: vi.fn(),
}))

vi.mock('@/lib/billing/core/invoice-engine', async (importOriginal) => {
  const echt = await importOriginal<typeof import('@/lib/billing/core/invoice-engine')>()
  return {
    ...echt,
    createInvoiceDraft: mockCreateInvoiceDraft,
    freezeInvoice: mockFreezeInvoice,
  }
})

vi.mock('@/lib/billing/core/audit', async (importOriginal) => {
  const echt = await importOriginal<typeof import('@/lib/billing/core/audit')>()
  return { ...echt, logBillingAction: mockLogBillingAction }
})

import {
  fuehreSammelrechnungslaufAus,
  ermittleGruppen,
  monatsZeitraum,
  ueberspringCodeFuerFehler,
} from '@/lib/billing/core/sammelrechnung'
import { TarifNichtVerifiziertError } from '@/lib/billing/core/price-resolver'

const ORG = '00000000-0000-4000-8000-000460629986'
const FREMD_ORG = '00000000-0000-4000-8000-000460629987'
const ACTOR = '11111111-1111-4111-8111-111111111111'
const KLIENT_A = '22222222-2222-4222-8222-222222222222'
const KLIENT_B = '33333333-3333-4333-8333-333333333333'
const MONAT = '2026-07'

// ═══════════════════════════════════════════════════════════════
// Minimaler In-Memory-Supabase-Stub
// ═══════════════════════════════════════════════════════════════

type Row = Record<string, any>
type Store = Record<string, Row[]>

class QB {
  private rows: Row[]
  private pending: Row | null = null
  private mode: 'select' | 'update' | 'insert' = 'select'
  private filters: Array<(r: Row) => boolean> = []

  constructor(table: string, store: Store) {
    this.rows = store[table] || (store[table] = [])
  }

  select() { return this }
  order() { return this }
  limit() { return this }
  returns() { return this }

  eq(col: string, val: any) { this.filters.push(r => r[col] === val); return this }
  is(col: string, val: any) { this.filters.push(r => (r[col] ?? null) === val); return this }
  gte(col: string, val: any) { this.filters.push(r => r[col] >= val); return this }
  lte(col: string, val: any) { this.filters.push(r => r[col] <= val); return this }
  in(col: string, arr: any[]) { this.filters.push(r => arr.includes(r[col])); return this }

  update(payload: Row) { this.mode = 'update'; this.pending = payload; return this }
  insert(payload: Row) { this.mode = 'insert'; this.pending = payload; this.rows.push(payload); return this }

  private matched(): Row[] {
    return this.rows.filter(r => this.filters.every(f => f(r)))
  }

  private resolve() {
    if (this.mode === 'update') {
      const treffer = this.matched()
      for (const r of treffer) Object.assign(r, this.pending)
      return { data: null, error: null, count: treffer.length }
    }
    if (this.mode === 'insert') return { data: this.pending, error: null }
    return { data: this.matched(), error: null }
  }

  maybeSingle() {
    const m = this.matched()
    return Promise.resolve({ data: m[0] ?? null, error: null })
  }

  single() {
    const m = this.matched()
    return Promise.resolve(
      m.length === 1 ? { data: m[0], error: null } : { data: null, error: { message: 'not found' } }
    )
  }

  then(aufloesen: (v: any) => any, ablehnen?: (e: any) => any) {
    return Promise.resolve(this.resolve()).then(aufloesen, ablehnen)
  }
}

function stub(store: Store) {
  return { from: (table: string) => new QB(table, store) } as any
}

// ── Testdaten-Bausteine ────────────────────────────────────────

let laufendeId = 0
function nachweis(over: Partial<Row> = {}): Row {
  laufendeId++
  return {
    id: `sr-${laufendeId}`,
    organization_id: ORG,
    client_id: KLIENT_A,
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

function entwurfsErgebnis(over: Record<string, unknown> = {}) {
  return {
    invoiceId: 'inv-1',
    invoiceNumber: 'RE-2026-0001',
    totalAmountCents: 4500,
    lineCount: 1,
    alreadyExists: false,
    priceSource: 'billing_tariffs',
    budgetDeckel: null,
    ...over,
  }
}

beforeEach(() => {
  laufendeId = 0
  mockCreateInvoiceDraft.mockReset().mockResolvedValue(entwurfsErgebnis())
  mockFreezeInvoice.mockReset().mockResolvedValue({
    snapshotId: 'snap-1', invoiceNumber: 'RE-2026-0001', checksum: 'x', version: 1,
  })
  mockLogBillingAction.mockReset().mockResolvedValue(undefined)
})

const lauf = (store: Store, over: Record<string, unknown> = {}) =>
  fuehreSammelrechnungslaufAus(stub(store), {
    organizationId: ORG, periodMonth: MONAT, actorId: ACTOR, ...over,
  })

// ═══════════════════════════════════════════════════════════════
// Gruppenbildung
// ═══════════════════════════════════════════════════════════════

describe('Gruppenbildung', () => {
  it('bildet je (Klient, Budget-Typ) genau eine Gruppe', async () => {
    const store: Store = {
      service_records: [
        nachweis({ client_id: KLIENT_A, budget_type: 'entlastung' }),
        nachweis({ client_id: KLIENT_A, budget_type: 'entlastung', date: `${MONAT}-16` }),
        nachweis({ client_id: KLIENT_A, budget_type: 'private' }),
        nachweis({ client_id: KLIENT_B, budget_type: 'entlastung' }),
      ],
    }
    const { gruppen } = await ermittleGruppen(stub(store), { organizationId: ORG, periodMonth: MONAT })
    expect(gruppen).toHaveLength(3)
    const a = gruppen.find(g => g.clientId === KLIENT_A && g.budgetType === 'entlastung')!
    expect(a.recordIds).toHaveLength(2)
    expect(a.rechtsgrundlage).toBe('§45b SGB XI')
    expect(a.erfassterBetragEuro).toBe(90)
  })

  it('bildet keine Gruppe, wenn nur "complete" und kein "signed" vorliegt', async () => {
    const store: Store = { service_records: [nachweis({ status: 'complete' })] }
    const { gruppen } = await ermittleGruppen(stub(store), { organizationId: ORG, periodMonth: MONAT })
    expect(gruppen).toHaveLength(0)
  })

  it('nimmt "complete"-Nachweise in eine bestehende Gruppe mit auf — wie die RPC', async () => {
    const store: Store = {
      service_records: [nachweis(), nachweis({ status: 'complete', date: `${MONAT}-17` })],
    }
    const { gruppen } = await ermittleGruppen(stub(store), { organizationId: ORG, periodMonth: MONAT })
    expect(gruppen[0].signiert).toBe(1)
    expect(gruppen[0].abgeschlossen).toBe(1)
    expect(gruppen[0].recordIds).toHaveLength(2)
  })

  it('laesst Nachweise fremder Mandanten aussen vor', async () => {
    const store: Store = {
      service_records: [nachweis(), nachweis({ organization_id: FREMD_ORG, client_id: KLIENT_B })],
    }
    const { gruppen } = await ermittleGruppen(stub(store), { organizationId: ORG, periodMonth: MONAT })
    expect(gruppen).toHaveLength(1)
    expect(gruppen[0].clientId).toBe(KLIENT_A)
  })

  it('ignoriert Nachweise ausserhalb des Monats', async () => {
    const store: Store = {
      service_records: [nachweis(), nachweis({ date: '2026-06-30' }), nachweis({ date: '2026-08-01' })],
    }
    const { gruppen } = await ermittleGruppen(stub(store), { organizationId: ORG, periodMonth: MONAT })
    expect(gruppen[0].recordIds).toHaveLength(1)
  })

  it('schraenkt auf clientIds ein', async () => {
    const store: Store = {
      service_records: [nachweis({ client_id: KLIENT_A }), nachweis({ client_id: KLIENT_B })],
    }
    const { gruppen } = await ermittleGruppen(stub(store), {
      organizationId: ORG, periodMonth: MONAT, clientIds: [KLIENT_B],
    })
    expect(gruppen).toHaveLength(1)
    expect(gruppen[0].clientId).toBe(KLIENT_B)
  })
})

// ═══════════════════════════════════════════════════════════════
// Fail-Closed: Tarifsperren
// ═══════════════════════════════════════════════════════════════

describe('Tarif-Fail-Closed', () => {
  it('rechnet einen blockierten Tarif NICHT ab', async () => {
    const store: Store = {
      service_records: [nachweis()],
      billing_tariffs: [tarif({ tarif_status: 'blocked' })],
    }
    const e = await lauf(store)
    expect(e.erstellt).toHaveLength(0)
    expect(e.uebersprungen[0].code).toBe('TARIF_NICHT_VERIFIZIERT')
    expect(e.uebersprungen[0].grund).toContain('gesperrt')
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
  })

  it('rechnet einen nicht verifizierten Kassentarif NICHT ab (§45b bleibt gesperrt)', async () => {
    const store: Store = {
      service_records: [nachweis()],
      billing_tariffs: [tarif({ tarif_status: 'unverified' })],
    }
    const e = await lauf(store)
    expect(e.erstellt).toHaveLength(0)
    expect(e.uebersprungen[0].code).toBe('TARIF_NICHT_VERIFIZIERT')
    expect(e.uebersprungen[0].details?.tarif_status).toEqual(['unverified'])
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
  })

  it('rechnet einen nicht verifizierten PRIVAT-Tarif ab — dort gilt nur "nicht blocked"', async () => {
    const store: Store = {
      service_records: [nachweis({ budget_type: 'private' })],
      billing_tariffs: [tarif({ rechtsgrundlage: 'privat', tarif_status: 'unverified' })],
    }
    const e = await lauf(store)
    expect(e.uebersprungen).toHaveLength(0)
    expect(e.erstellt).toHaveLength(1)
  })

  it('rechnet einen blockierten PRIVAT-Tarif NICHT ab', async () => {
    const store: Store = {
      service_records: [nachweis({ budget_type: 'private' })],
      billing_tariffs: [tarif({ rechtsgrundlage: 'privat', tarif_status: 'blocked' })],
    }
    const e = await lauf(store)
    expect(e.erstellt).toHaveLength(0)
    expect(e.uebersprungen[0].code).toBe('TARIF_NICHT_VERIFIZIERT')
  })

  it('meldet TARIF_FEHLT, wenn kein Tarif hinterlegt ist', async () => {
    const store: Store = { service_records: [nachweis()], billing_tariffs: [] }
    const e = await lauf(store)
    expect(e.uebersprungen[0].code).toBe('TARIF_FEHLT')
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
  })

  it('meldet TARIF_FEHLT, wenn der Tarif zum Leistungsdatum nicht mehr gilt', async () => {
    const store: Store = {
      service_records: [nachweis()],
      billing_tariffs: [tarif({ gueltig_bis: '2026-06-30' })],
    }
    const e = await lauf(store)
    expect(e.uebersprungen[0].code).toBe('TARIF_FEHLT')
  })

  it('meldet TARIF_FEHLT, wenn der Tarif erst spaeter gilt', async () => {
    const store: Store = {
      service_records: [nachweis()],
      billing_tariffs: [tarif({ gueltig_ab: '2026-08-01' })],
    }
    const e = await lauf(store)
    expect(e.uebersprungen[0].code).toBe('TARIF_FEHLT')
  })

  it('beachtet ist_aktiv und deleted_at', async () => {
    const store: Store = {
      service_records: [nachweis()],
      billing_tariffs: [tarif({ ist_aktiv: false }), tarif({ deleted_at: '2026-05-01' })],
    }
    const e = await lauf(store)
    expect(e.uebersprungen[0].code).toBe('TARIF_FEHLT')
  })

  it('findet Tarife auch bei abweichender Gross-/Kleinschreibung', async () => {
    const store: Store = {
      service_records: [nachweis()],
      billing_tariffs: [tarif({ leistungsart: 'Alltagsbegleitung' })],
    }
    const e = await lauf(store)
    expect(e.uebersprungen).toHaveLength(0)
    expect(e.erstellt).toHaveLength(1)
  })

  it('sperrt die GANZE Gruppe, wenn nur eine Zeile keinen gueltigen Tarif hat', async () => {
    const store: Store = {
      service_records: [
        nachweis({ service_type: 'Alltagsbegleitung' }),
        nachweis({ service_type: 'Haushaltshilfe', date: `${MONAT}-16` }),
      ],
      billing_tariffs: [tarif()], // nur alltagsbegleitung
    }
    const e = await lauf(store)
    expect(e.erstellt).toHaveLength(0)
    expect(e.uebersprungen[0].code).toBe('TARIF_FEHLT')
    expect(e.uebersprungen[0].recordIds).toHaveLength(2)
  })
})

// ═══════════════════════════════════════════════════════════════
// Fail-Closed: Erfassung
// ═══════════════════════════════════════════════════════════════

describe('Erfassungs-Sperren', () => {
  it('meldet LEISTUNGSART_UNBEKANNT bei Leistungen ohne Tarif-Schluessel', async () => {
    const store: Store = {
      service_records: [nachweis({ service_type: 'Körperpflege' })],
      billing_tariffs: [tarif()],
    }
    const e = await lauf(store)
    expect(e.uebersprungen[0].code).toBe('LEISTUNGSART_UNBEKANNT')
    expect(e.uebersprungen[0].grund).toContain('Körperpflege')
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
  })

  it('loest Erfassungs-Aliase auf (Haushaltshilfe → hauswirtschaft)', async () => {
    const store: Store = {
      service_records: [nachweis({ service_type: 'Haushaltshilfe' })],
      billing_tariffs: [tarif({ leistungsart: 'hauswirtschaft' })],
    }
    const e = await lauf(store)
    expect(e.uebersprungen).toHaveLength(0)
    expect(e.erstellt).toHaveLength(1)
  })

  it('meldet BUDGETTYP_UNBEKANNT bei fehlendem Budget-Typ', async () => {
    const store: Store = {
      service_records: [nachweis({ budget_type: null })],
      billing_tariffs: [tarif()],
    }
    const e = await lauf(store)
    expect(e.uebersprungen[0].code).toBe('BUDGETTYP_UNBEKANNT')
  })

  it('meldet BUDGETTYP_UNBEKANNT bei unbekanntem Budget-Typ', async () => {
    const store: Store = {
      service_records: [nachweis({ budget_type: 'phantasie_topf' })],
      billing_tariffs: [tarif()],
    }
    const e = await lauf(store)
    expect(e.uebersprungen[0].code).toBe('BUDGETTYP_UNBEKANNT')
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
  })

  it('meldet UNTERSCHRIFT_FEHLT, wenn ein Nachweis keinen Unterschriftsbeleg traegt', async () => {
    const store: Store = {
      service_records: [
        nachweis(),
        nachweis({ date: `${MONAT}-16`, proof_status: 'OFFEN', signature_hash: null }),
      ],
      billing_tariffs: [tarif()],
    }
    const e = await lauf(store)
    expect(e.erstellt).toHaveLength(0)
    expect(e.uebersprungen[0].code).toBe('UNTERSCHRIFT_FEHLT')
    expect(e.uebersprungen[0].grund).toContain('1 von 2')
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
  })

  it('akzeptiert den signature_hash als Unterschriftsnachweis', async () => {
    const store: Store = {
      service_records: [nachweis({ proof_status: 'OFFEN', signature_hash: 'abc123' })],
      billing_tariffs: [tarif()],
    }
    const e = await lauf(store)
    expect(e.uebersprungen).toHaveLength(0)
    expect(e.erstellt).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════
// Lauf
// ═══════════════════════════════════════════════════════════════

describe('Lauf', () => {
  it('erzeugt eine Rechnung je Gruppe und summiert die Betraege', async () => {
    mockCreateInvoiceDraft
      .mockResolvedValueOnce(entwurfsErgebnis({ invoiceId: 'inv-a', totalAmountCents: 4500 }))
      .mockResolvedValueOnce(entwurfsErgebnis({ invoiceId: 'inv-b', totalAmountCents: 3000 }))

    const store: Store = {
      service_records: [nachweis({ client_id: KLIENT_A }), nachweis({ client_id: KLIENT_B })],
      billing_tariffs: [tarif()],
    }
    const e = await lauf(store)
    expect(e.erstellt).toHaveLength(2)
    expect(e.summeCent).toBe(7500)
    expect(mockCreateInvoiceDraft).toHaveBeenCalledTimes(2)
    expect(mockCreateInvoiceDraft).toHaveBeenCalledWith(expect.anything(), {
      clientId: KLIENT_A, periodMonth: MONAT, budgetType: 'entlastung', actorId: ACTOR,
    })
  })

  it('zaehlt bereits bestehende Rechnungen nicht erneut in die Summe', async () => {
    mockCreateInvoiceDraft.mockResolvedValue(
      entwurfsErgebnis({ alreadyExists: true, totalAmountCents: 4500 })
    )
    const store: Store = { service_records: [nachweis()], billing_tariffs: [tarif()] }
    const e = await lauf(store)
    expect(e.erstellt[0].alreadyExists).toBe(true)
    expect(e.summeCent).toBe(0)
  })

  it('meldet einen wirksamen Budgetdeckel', async () => {
    mockCreateInvoiceDraft.mockResolvedValue(
      entwurfsErgebnis({ budgetDeckel: { gedeckelt: true, grund: '§45b ausgeschöpft' } })
    )
    const store: Store = { service_records: [nachweis()], billing_tariffs: [tarif()] }
    const e = await lauf(store)
    expect(e.erstellt[0].budgetGedeckelt).toBe(true)
  })

  it('schreibt im dryRun nichts und zeigt die Vorschau', async () => {
    const store: Store = {
      service_records: [nachweis({ client_id: KLIENT_A }), nachweis({ client_id: KLIENT_B })],
      billing_tariffs: [tarif()],
    }
    const e = await lauf(store, { dryRun: true })
    expect(e.dryRun).toBe(true)
    expect(e.vorschau).toHaveLength(2)
    expect(e.erstellt).toHaveLength(0)
    expect(mockCreateInvoiceDraft).not.toHaveBeenCalled()
    expect(mockLogBillingAction).not.toHaveBeenCalled()
  })

  it('meldet auch im dryRun, was gesperrt ist', async () => {
    const store: Store = {
      service_records: [nachweis()],
      billing_tariffs: [tarif({ tarif_status: 'blocked' })],
    }
    const e = await lauf(store, { dryRun: true })
    expect(e.vorschau).toHaveLength(0)
    expect(e.uebersprungen[0].code).toBe('TARIF_NICHT_VERIFIZIERT')
    expect(mockLogBillingAction).not.toHaveBeenCalled()
  })

  it('kommt mit einem leeren Monat zurecht', async () => {
    const e = await lauf({ service_records: [], billing_tariffs: [] })
    expect(e.gruppen).toBe(0)
    expect(e.erstellt).toHaveLength(0)
    expect(e.uebersprungen).toHaveLength(0)
  })

  it('bildet einen RPC-Tariffehler auf TARIF_FEHLT ab, statt den Lauf abzubrechen', async () => {
    mockCreateInvoiceDraft
      .mockRejectedValueOnce(new Error('MISSING_VALID_TARIFF: Kein gueltiger Tarif'))
      .mockResolvedValueOnce(entwurfsErgebnis({ invoiceId: 'inv-b' }))

    const store: Store = {
      service_records: [nachweis({ client_id: KLIENT_A }), nachweis({ client_id: KLIENT_B })],
      billing_tariffs: [tarif()],
    }
    const e = await lauf(store)
    expect(e.uebersprungen[0].code).toBe('TARIF_FEHLT')
    expect(e.erstellt).toHaveLength(1) // zweite Gruppe laeuft weiter
  })

  it('bildet MISSING_SIGNATURE der RPC auf UNTERSCHRIFT_FEHLT ab', async () => {
    mockCreateInvoiceDraft.mockRejectedValue(
      new Error('MISSING_SIGNATURE: 2 von 2 Leistungsnachweisen sind nicht unterschrieben')
    )
    const store: Store = { service_records: [nachweis()], billing_tariffs: [tarif()] }
    const e = await lauf(store)
    expect(e.uebersprungen[0].code).toBe('UNTERSCHRIFT_FEHLT')
  })

  it('protokolliert jede uebersprungene Gruppe im Audit-Trail', async () => {
    const store: Store = {
      service_records: [nachweis()],
      billing_tariffs: [tarif({ tarif_status: 'blocked' })],
    }
    await lauf(store)
    expect(mockLogBillingAction).toHaveBeenCalledTimes(1)
    const params = mockLogBillingAction.mock.calls[0][1]
    expect(params.entityType).toBe('invoice_draft')
    expect(params.entityId).toBe(KLIENT_A)
    expect(params.organizationId).toBe(ORG)
    expect(params.action).toBe('sammelrechnung_uebersprungen')
    expect(params.newState.code).toBe('TARIF_NICHT_VERIFIZIERT')
  })

  it('laeuft weiter, wenn der Audit-Eintrag fehlschlaegt', async () => {
    mockLogBillingAction.mockRejectedValue(new Error('23514'))
    const store: Store = {
      service_records: [nachweis()],
      billing_tariffs: [tarif({ tarif_status: 'blocked' })],
    }
    const e = await lauf(store)
    expect(e.uebersprungen).toHaveLength(1)
  })

  it('kappt bei maxGruppen sichtbar statt still', async () => {
    const store: Store = {
      service_records: [nachweis({ client_id: KLIENT_A }), nachweis({ client_id: KLIENT_B })],
      billing_tariffs: [tarif()],
    }
    const e = await lauf(store, { maxGruppen: 1 })
    expect(e.gruppen).toBe(2)
    expect(e.erstellt).toHaveLength(1)
    expect(e.nichtBetrachtet).toBe(1)
  })

  it('verlangt eine organizationId', async () => {
    await expect(lauf({}, { organizationId: '' })).rejects.toThrow(/organizationId/)
  })
})

// ═══════════════════════════════════════════════════════════════
// Festschreiben und Versand
// ═══════════════════════════════════════════════════════════════

describe('Festschreiben', () => {
  it('lehnt autoVersand ohne festschreiben ab', async () => {
    await expect(lauf({}, { autoVersand: true })).rejects.toThrow(/festgeschrieben/)
  })

  it('geht den Weg entwurf → geprueft → festgeschrieben', async () => {
    const invoices = [{ id: 'inv-1', organization_id: ORG, status: 'entwurf', frozen_at: null }]
    const store: Store = { service_records: [nachweis()], billing_tariffs: [tarif()], invoices }

    const e = await lauf(store, { festschreiben: true })

    expect(invoices[0].status).toBe('geprueft')
    expect(mockFreezeInvoice).toHaveBeenCalledWith(
      expect.anything(), 'inv-1', ACTOR, ORG, { autoVersand: false }
    )
    expect(e.erstellt[0].festgeschrieben).toBe(true)
    const statusAudit = mockLogBillingAction.mock.calls.find(c => c[1].action === 'status_geprueft')
    expect(statusAudit).toBeTruthy()
  })

  it('reicht autoVersand an die Festschreibung durch', async () => {
    mockFreezeInvoice.mockResolvedValue({
      snapshotId: 's', invoiceNumber: 'RE-1', checksum: 'x', version: 1, versandStatus: 'versendet',
    })
    const store: Store = {
      service_records: [nachweis()],
      billing_tariffs: [tarif()],
      invoices: [{ id: 'inv-1', organization_id: ORG, status: 'entwurf', frozen_at: null }],
    }
    const e = await lauf(store, { festschreiben: true, autoVersand: true })
    expect(mockFreezeInvoice).toHaveBeenCalledWith(
      expect.anything(), 'inv-1', ACTOR, ORG, { autoVersand: true }
    )
    expect(e.erstellt[0].versandStatus).toBe('versendet')
  })

  it('schreibt eine bereits festgeschriebene Rechnung nicht erneut fest', async () => {
    const store: Store = {
      service_records: [nachweis()],
      billing_tariffs: [tarif()],
      invoices: [{ id: 'inv-1', organization_id: ORG, status: 'freigegeben', frozen_at: '2026-08-01T10:00:00Z' }],
    }
    const e = await lauf(store, { festschreiben: true })
    expect(mockFreezeInvoice).not.toHaveBeenCalled()
    expect(e.erstellt[0].festgeschrieben).toBe(true)
  })

  it('verwirft die Rechnung nicht, wenn das Festschreiben scheitert', async () => {
    mockFreezeInvoice.mockRejectedValue(new Error('Snapshot fehlgeschlagen'))
    const store: Store = {
      service_records: [nachweis()],
      billing_tariffs: [tarif()],
      invoices: [{ id: 'inv-1', organization_id: ORG, status: 'entwurf', frozen_at: null }],
    }
    const e = await lauf(store, { festschreiben: true })
    expect(e.erstellt).toHaveLength(1)
    expect(e.erstellt[0].festgeschrieben).toBe(false)
    expect(e.uebersprungen).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// Hilfsfunktionen
// ═══════════════════════════════════════════════════════════════

describe('monatsZeitraum', () => {
  it('bestimmt den letzten Tag korrekt', () => {
    expect(monatsZeitraum('2026-07')).toEqual({ von: '2026-07-01', bis: '2026-07-31' })
    expect(monatsZeitraum('2026-02')).toEqual({ von: '2026-02-01', bis: '2026-02-28' })
    expect(monatsZeitraum('2028-02')).toEqual({ von: '2028-02-01', bis: '2028-02-29' })
    expect(monatsZeitraum('2026-11')).toEqual({ von: '2026-11-01', bis: '2026-11-30' })
  })

  it('weist ungueltige Eingaben ab', () => {
    expect(() => monatsZeitraum('2026-7')).toThrow(/YYYY-MM/)
    expect(() => monatsZeitraum('Juli 2026')).toThrow(/YYYY-MM/)
    expect(() => monatsZeitraum('2026-13')).toThrow(/gueltigen Monat/)
  })
})

describe('ueberspringCodeFuerFehler', () => {
  it('erkennt den Fail-Closed-Fehlertyp der Preisaufloesung', () => {
    const err = new TarifNichtVerifiziertError('alltagsbegleitung', 'blocked', 'keine Vereinbarung')
    expect(ueberspringCodeFuerFehler(err).code).toBe('TARIF_NICHT_VERIFIZIERT')
  })

  it('erkennt die Tarif-Fehlercodes der RPC', () => {
    expect(ueberspringCodeFuerFehler(new Error('MISSING_VALID_TARIFF: …')).code).toBe('TARIF_FEHLT')
    expect(ueberspringCodeFuerFehler(new Error('AMBIGUOUS_TARIFF: …')).code).toBe('TARIF_MEHRDEUTIG')
  })

  it('erkennt fehlende Unterschrift und unbekannten Budget-Typ', () => {
    expect(ueberspringCodeFuerFehler(new Error('MISSING_SIGNATURE: …')).code).toBe('UNTERSCHRIFT_FEHLT')
    expect(ueberspringCodeFuerFehler(new Error('Unbekannter budget_type: "x"')).code)
      .toBe('BUDGETTYP_UNBEKANNT')
  })

  it('erkennt die nicht ermittelbare Budgetlage', () => {
    const err = new Error('Budgetlage nicht ermittelbar: kein client_budgets-Satz')
    err.name = 'BudgetLageNichtErmittelbarError'
    expect(ueberspringCodeFuerFehler(err).code).toBe('BUDGETLAGE_UNBEKANNT')
  })

  it('faellt auf FEHLER zurueck und behaelt den Originaltext', () => {
    const r = ueberspringCodeFuerFehler(new Error('Netzwerk weg'))
    expect(r.code).toBe('FEHLER')
    expect(r.grund).toBe('Netzwerk weg')
  })
})
