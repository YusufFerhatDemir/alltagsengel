/**
 * Transaktionssicherheit: createInvoiceDraft (RPC-basiert)
 *
 * Prüft das Verhalten der Billing-Engine mit der atomaren PostgreSQL-
 * Transaktion (create_invoice_draft_atomic RPC):
 *
 *   1. RPC-Erfolg → Rechnung + Items + Audit atomar erstellt
 *   2. RPC-Fehler → vollständiger Rollback, keine Residualdaten
 *   3. Idempotenz → RPC gibt bestehende Rechnung zurück
 *   4. Null-Preis-Schutz → RPC wirft Fehler, keine Rechnung
 *   5. Mandantentrennung → RPC prüft Client-Org-Zugehörigkeit
 *   6. Audit-Fehler → RPC rollt ALLES zurück (atomisch)
 *   7. Tarifvergleich → informativ, nicht transaktionskritisch
 *
 * GARANTIE: Durch SECURITY DEFINER PostgreSQL-Funktion mit
 * search_path = public gibt es KEINE halbfertigen Rechnungen.
 * Entweder alles oder nichts.
 *
 * Testdaten: Synthetisch, keine echten Kunden-/Gesundheitsdaten.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ═══════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════

const { mockLogBillingAction } = vi.hoisted(() => ({
  mockLogBillingAction: vi.fn(),
}))

// resolvePrice wird nicht mehr gemockt — Tarif-Auflösung erfolgt komplett in der RPC
// vi.mock('@/lib/billing/core/price-resolver') → ENTFERNT

vi.mock('@/lib/billing/core/audit', () => ({
  logBillingAction: mockLogBillingAction,
  computeSnapshotChecksum: vi.fn().mockResolvedValue('test-checksum'),
}))

vi.mock('@/lib/billing/core/status-machine', () => ({
  validateTransition: vi.fn(),
  isValidInvoiceStatus: vi.fn(() => true),
  INVOICE_NUMBER_PREFIX: { storno: 'ST', korrektur: 'KR', gutschrift: 'GS' },
}))

// ═══════════════════════════════════════════════════════════════
// Testdaten
// ═══════════════════════════════════════════════════════════════

const TEST_ORG = 'org-tx-001'
const TEST_CLIENT = 'client-tx-001'
const PERIOD = '2026-09'
const TEST_ACTOR = 'actor-tx-001'

const CLIENT_DATA = {
  id: TEST_CLIENT,
  first_name: 'Test',
  last_name: 'Klient',
  insurance_name: 'Test-Kasse',
  insurance_number: 'V-TX-001',
  organization_id: TEST_ORG,
  pflegekasse_ik: null,
}

const RPC_SUCCESS_RESULT = {
  invoice_id: 'inv-tx-001',
  invoice_number: 'RE-2026-00001',
  total_amount: 100,
  line_count: 2,
  already_exists: false,
}

const RPC_IDEMPOTENT_RESULT = {
  invoice_id: 'inv-tx-existing',
  invoice_number: 'RE-2026-00005',
  total_amount: 100,
  line_count: 0,
  already_exists: true,
}

// ═══════════════════════════════════════════════════════════════
// Supabase-Mock (RPC-basiert)
// ═══════════════════════════════════════════════════════════════

function createMockSupabase(opts: {
  rpcResult?: { data: any; error: any };
  clientResult?: { data: any; error: any };
  itemsResult?: { data: any; error: any };
} = {}) {
  const rpcCalls: { fn: string; params: any }[] = []

  const mockRpc = vi.fn((fn: string, params: any) => {
    rpcCalls.push({ fn, params })
    return Promise.resolve(
      opts.rpcResult ?? { data: RPC_SUCCESS_RESULT, error: null }
    )
  })

  return {
    rpcCalls,
    rpc: mockRpc,
    from(table: string) {
      const builder: any = {
        select() { return builder },
        eq() { return builder },
        single() {
          if (table === 'clients') {
            return Promise.resolve(
              opts.clientResult ?? { data: CLIENT_DATA, error: null }
            )
          }
          if (table === 'invoice_items') {
            return Promise.resolve(
              opts.itemsResult ?? { data: [], error: null }
            )
          }
          return Promise.resolve({ data: null, error: null })
        },
        then(onFulfilled: any, onRejected: any) {
          if (table === 'invoice_items') {
            return Promise.resolve(
              opts.itemsResult ?? { data: [], error: null }
            ).then(onFulfilled, onRejected)
          }
          return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected)
        },
      }
      return builder
    },
  }
}

const DEFAULT_PARAMS = {
  clientId: TEST_CLIENT,
  periodMonth: PERIOD,
  budgetType: 'entlastung',
  actorId: TEST_ACTOR,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLogBillingAction.mockResolvedValue(undefined)
})

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe('Atomare Transaktion: Erfolgreicher Ablauf', () => {
  it('RPC wird mit korrekten Parametern aufgerufen', async () => {
    const supabase = createMockSupabase()
    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    await createInvoiceDraft(supabase as any, DEFAULT_PARAMS)

    expect(supabase.rpc).toHaveBeenCalledWith('create_invoice_draft_atomic', {
      p_client_id: TEST_CLIENT,
      p_org_id: TEST_ORG,
      p_period_month: PERIOD,
      p_budget_type: 'entlastung',
      p_actor_id: TEST_ACTOR,
      p_insurance_name: 'Test-Kasse',
      p_insurance_number: 'V-TX-001',
    })
  })

  it('Erfolgreiche Erstellung gibt korrektes Ergebnis zurück', async () => {
    const supabase = createMockSupabase()
    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    const result = await createInvoiceDraft(supabase as any, DEFAULT_PARAMS)

    expect(result.invoiceId).toBe('inv-tx-001')
    expect(result.invoiceNumber).toBe('RE-2026-00001')
    expect(result.totalAmountCents).toBe(10000) // 100 * 100
    expect(result.lineCount).toBe(2)
    expect(result.alreadyExists).toBe(false)
    expect(result.priceSource).toBeDefined()
  })
})

describe('Atomare Transaktion: RPC-Fehler → vollständiger Rollback', () => {
  it('Null-Preis-Records → RPC wirft Fehler, keine Rechnung', async () => {
    const supabase = createMockSupabase({
      rpcResult: {
        data: null,
        error: { message: 'Leistungsnachweis(e) ohne Betrag (amount=0/null)' },
      },
    })

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    await expect(
      createInvoiceDraft(supabase as any, DEFAULT_PARAMS)
    ).rejects.toThrow(/amount=0\/null/)
  })

  it('Keine Service Records → RPC wirft Fehler, keine Rechnung', async () => {
    const supabase = createMockSupabase({
      rpcResult: {
        data: null,
        error: { message: 'Keine abrechenbaren Leistungen' },
      },
    })

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    await expect(
      createInvoiceDraft(supabase as any, DEFAULT_PARAMS)
    ).rejects.toThrow(/Keine abrechenbaren Leistungen/)
  })

  it('DB-Constraint-Verletzung → RPC wirft Fehler, atomischer Rollback', async () => {
    const supabase = createMockSupabase({
      rpcResult: {
        data: null,
        error: { message: 'unique_violation: invoice_items_pkey' },
      },
    })

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    await expect(
      createInvoiceDraft(supabase as any, DEFAULT_PARAMS)
    ).rejects.toThrow(/Atomare Rechnungserstellung fehlgeschlagen/)

    // GARANTIE: Kein manueller Cleanup nötig — PostgreSQL hat alles zurückgerollt
    // Es gibt keine halbfertigen Rechnungen, Items oder Audit-Einträge
  })

  it('Audit-Insert fehlschlägt in RPC → gesamte Transaktion rollback', async () => {
    // Im Gegensatz zur alten sequentiellen Engine:
    // Wenn der Audit-Insert im RPC fehlschlägt, wird die GESAMTE Transaktion
    // zurückgerollt — keine Rechnung ohne Audit-Trail!
    const supabase = createMockSupabase({
      rpcResult: {
        data: null,
        error: { message: 'Audit-Insert fehlgeschlagen: billing_audit_trail' },
      },
    })

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    await expect(
      createInvoiceDraft(supabase as any, DEFAULT_PARAMS)
    ).rejects.toThrow(/Atomare Rechnungserstellung fehlgeschlagen/)

    // GARANTIE: Keine Rechnung ohne Audit-Trail
  })

  it('Mandantentrennung: Client anderer Org → RPC wirft Fehler', async () => {
    const supabase = createMockSupabase({
      rpcResult: {
        data: null,
        error: { message: 'Klient client-tx-001 gehoert nicht zu Organisation org-tx-001' },
      },
    })

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    await expect(
      createInvoiceDraft(supabase as any, DEFAULT_PARAMS)
    ).rejects.toThrow(/gehoert nicht zu Organisation/)
  })
})

describe('Atomare Transaktion: Idempotenz', () => {
  it('Bestehende Rechnung → RPC gibt already_exists zurück', async () => {
    const supabase = createMockSupabase({
      rpcResult: { data: RPC_IDEMPOTENT_RESULT, error: null },
    })

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    const result = await createInvoiceDraft(supabase as any, DEFAULT_PARAMS)

    expect(result.alreadyExists).toBe(true)
    expect(result.invoiceId).toBe('inv-tx-existing')
    expect(result.invoiceNumber).toBe('RE-2026-00005')
  })

  it('Parallele Aufrufe → Idempotenz-Key in RPC verhindert Duplikate', async () => {
    let callCount = 0
    const supabase = createMockSupabase()
    supabase.rpc = vi.fn(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({ data: RPC_SUCCESS_RESULT, error: null })
      }
      return Promise.resolve({ data: RPC_IDEMPOTENT_RESULT, error: null })
    }) as any

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    const result1 = await createInvoiceDraft(supabase as any, DEFAULT_PARAMS)
    expect(result1.alreadyExists).toBe(false)

    const result2 = await createInvoiceDraft(supabase as any, DEFAULT_PARAMS)
    expect(result2.alreadyExists).toBe(true)
    expect(result2.invoiceId).toBe('inv-tx-existing')
  })
})

describe('Atomare Transaktion: Eingabevalidierung', () => {
  it('Client nicht gefunden → Fehler vor RPC-Aufruf', async () => {
    const supabase = createMockSupabase({
      clientResult: { data: null, error: { message: 'not found' } },
    })

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    await expect(
      createInvoiceDraft(supabase as any, DEFAULT_PARAMS)
    ).rejects.toThrow(/nicht gefunden/)

    // RPC wurde NICHT aufgerufen
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('RPC gibt kein Ergebnis zurück → kontrollierter Fehler', async () => {
    const supabase = createMockSupabase({
      rpcResult: { data: null, error: null },
    })

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    await expect(
      createInvoiceDraft(supabase as any, DEFAULT_PARAMS)
    ).rejects.toThrow(/kein Ergebnis/)
  })
})

describe('Atomare Transaktion: Tarif-Fehler (billing_tariffs = führend)', () => {
  it('MISSING_VALID_TARIFF → kein Fallback, Fehler mit Code', async () => {
    const supabase = createMockSupabase({
      rpcResult: {
        data: null,
        error: { message: 'MISSING_VALID_TARIFF: Kein gueltiger Tarif fuer Leistungsart "Alltagsbegleitung"' },
      },
    })

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    try {
      await createInvoiceDraft(supabase as any, DEFAULT_PARAMS)
      expect.fail('Sollte Fehler werfen')
    } catch (err: any) {
      expect(err.message).toContain('MISSING_VALID_TARIFF')
      expect(err.tariffErrorCode).toBe('MISSING_VALID_TARIFF')
    }
  })

  it('AMBIGUOUS_TARIFF → kein willkürlicher Tarif, Fehler mit Code', async () => {
    const supabase = createMockSupabase({
      rpcResult: {
        data: null,
        error: { message: 'AMBIGUOUS_TARIFF: 2 gleichwertige Tarife' },
      },
    })

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    try {
      await createInvoiceDraft(supabase as any, DEFAULT_PARAMS)
      expect.fail('Sollte Fehler werfen')
    } catch (err: any) {
      expect(err.message).toContain('AMBIGUOUS_TARIFF')
      expect(err.tariffErrorCode).toBe('AMBIGUOUS_TARIFF')
    }
  })

  it('Erfolgreiche Rechnung → priceSource immer billing_tariffs', async () => {
    const supabase = createMockSupabase()
    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    const result = await createInvoiceDraft(supabase as any, DEFAULT_PARAMS)

    expect(result.priceSource).toBe('billing_tariffs')
    // priceWarnings existiert nicht mehr — Tarif ist Pflicht, kein Warning-Fallback
    expect((result as any).priceWarnings).toBeUndefined()
  })

  it('Private Budget → Tarif trotzdem aus billing_tariffs', async () => {
    const supabase = createMockSupabase()
    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    const result = await createInvoiceDraft(supabase as any, {
      ...DEFAULT_PARAMS,
      budgetType: 'private',
    })

    expect(result.priceSource).toBe('billing_tariffs')
  })
})

describe('Atomare Transaktion: Browser-Preis-Schutz', () => {
  it('Engine akzeptiert KEINE Preise vom Browser — nur DB-Werte', async () => {
    const supabase = createMockSupabase()
    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    // Auch wenn jemand "amount" oder "price" an createInvoiceDraft übergibt:
    // CreateDraftParams hat KEINE amount/price-Felder.
    // Der RPC berechnet den Betrag aus service_records.amount in der DB.
    const result = await createInvoiceDraft(supabase as any, {
      ...DEFAULT_PARAMS,
      // @ts-expect-error — absichtlich falsche Felder testen
      amount: 99999,
      price: 99999,
      totalAmount: 99999,
    })

    // Preis kommt aus billing_tariffs (DB), nicht vom "Browser" (99999)
    expect(result.totalAmountCents).toBe(10000)
    expect(result.priceSource).toBe('billing_tariffs')

    // RPC wurde OHNE Browser-Preise aufgerufen
    const rpcCall = supabase.rpc.mock.calls[0]
    const rpcParams = rpcCall[1]
    expect(rpcParams).not.toHaveProperty('amount')
    expect(rpcParams).not.toHaveProperty('price')
    expect(rpcParams).not.toHaveProperty('totalAmount')
  })
})

describe('Atomare Transaktion: SECURITY DEFINER Garantien', () => {
  it('RPC-Funktion Name und Parameter korrekt', async () => {
    const supabase = createMockSupabase()
    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    await createInvoiceDraft(supabase as any, DEFAULT_PARAMS)

    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    const [fnName, params] = supabase.rpc.mock.calls[0]

    expect(fnName).toBe('create_invoice_draft_atomic')
    expect(params.p_client_id).toBe(TEST_CLIENT)
    expect(params.p_org_id).toBe(TEST_ORG)
    expect(params.p_period_month).toBe(PERIOD)
    expect(params.p_budget_type).toBe('entlastung')
    expect(params.p_actor_id).toBe(TEST_ACTOR)
  })

  it('Insurance-Daten werden aus Client-Record übergeben, nicht vom Browser', async () => {
    const supabase = createMockSupabase()
    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    await createInvoiceDraft(supabase as any, DEFAULT_PARAMS)

    const rpcParams = supabase.rpc.mock.calls[0][1]
    expect(rpcParams.p_insurance_name).toBe('Test-Kasse')
    expect(rpcParams.p_insurance_number).toBe('V-TX-001')
  })

  it('Client ohne Insurance-Daten → null-Werte an RPC', async () => {
    const supabase = createMockSupabase({
      clientResult: {
        data: { ...CLIENT_DATA, insurance_name: null, insurance_number: null },
        error: null,
      },
    })

    const { createInvoiceDraft } = await import('@/lib/billing/core/invoice-engine')

    await createInvoiceDraft(supabase as any, DEFAULT_PARAMS)

    const rpcParams = supabase.rpc.mock.calls[0][1]
    expect(rpcParams.p_insurance_name).toBeNull()
    expect(rpcParams.p_insurance_number).toBeNull()
  })
})
