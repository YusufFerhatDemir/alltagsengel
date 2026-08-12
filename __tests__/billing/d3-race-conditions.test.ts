import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8')

// ---------------------------------------------------------------------------
// Quellcode-Inspektion: CAS-Guards vorhanden
// ---------------------------------------------------------------------------

describe('D3: CAS-Guards in Quellcode', () => {
  const engineSrc = read('lib/billing/core/invoice-engine.ts')

  describe('correctInvoice CAS', () => {
    it('prüft Original-Status nach Korrektur-Insert (CAS)', () => {
      expect(engineSrc).toContain(".eq('status', currentStatus)")
      expect(engineSrc).toContain('Rechnung wurde zwischenzeitlich geaendert (paralleler Zugriff)')
    })

    it('rollt Korrektur bei CAS-Failure zurück', () => {
      const casSection = engineSrc.slice(engineSrc.indexOf('CAS-Guard: Original darf'))
      expect(casSection).toContain("from('invoice_corrections').delete()")
      expect(casSection).toContain("from('invoice_items').delete()")
      expect(casSection).toContain("from('invoices').delete()")
    })

    it('lehnt korrigierten Gesamtbetrag <= 0 ab (W-OFFEN-3)', () => {
      expect(engineSrc).toContain('Korrigierter Gesamtbetrag muss positiv sein')
    })

    it('lehnt negative Einzelbeträge ab', () => {
      expect(engineSrc).toContain('Negativer Betrag fuer')
    })

    it('blockiert Korrektur auf abgeschriebene Rechnungen', () => {
      expect(engineSrc).toContain('Rechnung ist abgeschrieben — Korrektur nicht moeglich')
    })
  })

  describe('createCreditNote CAS', () => {
    it('prüft Gesamtgutschriften nach Insert (CAS)', () => {
      expect(engineSrc).toContain('CAS-Guard: nach Insert pruefen')
      expect(engineSrc).toContain('totalCreditedAfter > originalAmountCents')
    })

    it('rollt Gutschrift bei CAS-Failure zurück', () => {
      const casSection = engineSrc.slice(engineSrc.indexOf('CAS-Guard: nach Insert'))
      expect(casSection).toContain("from('invoice_corrections').delete()")
      expect(casSection).toContain("from('invoices').delete()")
    })

    it('gibt spezifische Fehlermeldung bei Race Condition', () => {
      expect(engineSrc).toContain('Paralleler Zugriff hat den verfuegbaren Betrag ueberschritten')
    })

    it('blockiert Gutschrift auf abgeschriebene Rechnungen', () => {
      expect(engineSrc).toContain('Rechnung ist abgeschrieben — Gutschrift nicht moeglich')
    })
  })

  describe('Migration: atomare RPCs', () => {
    const migrationSrc = read('supabase/migrations/20260831010000_abgeschrieben_credit_cas.sql')

    it('erstellt create_credit_note_atomic mit FOR UPDATE', () => {
      expect(migrationSrc).toContain('create_credit_note_atomic')
      expect(migrationSrc).toContain('FOR UPDATE')
    })

    it('erstellt validate_correction_atomic mit FOR UPDATE', () => {
      expect(migrationSrc).toContain('validate_correction_atomic')
    })

    it('sperrt RPCs gegen anon/authenticated', () => {
      expect(migrationSrc).toContain('REVOKE ALL ON FUNCTION public.create_credit_note_atomic')
      expect(migrationSrc).toContain('FROM anon')
      expect(migrationSrc).toContain('FROM authenticated')
    })
  })
})

// ---------------------------------------------------------------------------
// Unit-Tests: createCreditNote Race Condition simulieren
// ---------------------------------------------------------------------------

const { mockLogBillingAction } = vi.hoisted(() => ({
  mockLogBillingAction: vi.fn(),
}))

vi.mock('@/lib/billing/core/audit', () => ({
  logBillingAction: mockLogBillingAction,
  computeSnapshotChecksum: vi.fn().mockResolvedValue('test-hash'),
  computeContentHash: vi.fn().mockResolvedValue('test-hash'),
}))

vi.mock('@/lib/billing/core/status-machine', () => ({
  isTerminalStatus: vi.fn((s: string) => ['bezahlt', 'storniert', 'akzeptiert', 'abgeschrieben'].includes(s)),
  isValidInvoiceStatus: vi.fn(() => true),
  validateTransition: vi.fn(),
  INVOICE_NUMBER_PREFIX: { storno: 'ST', korrektur: 'KR', gutschrift: 'GS' },
}))

describe('createCreditNote — CAS-Schutz gegen Doppel-Gutschrift', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rollt zurück wenn parallele Gutschrift den Betrag übersteigt', async () => {
    const { createCreditNote } = await import('@/lib/billing/core/invoice-engine')

    let correctionsSelectCount = 0

    const chainable = () => {
      const obj: Record<string, any> = {}
      obj.select = vi.fn().mockReturnValue(obj)
      obj.eq = vi.fn().mockReturnValue(obj)
      obj.is = vi.fn().mockImplementation(() => {
        correctionsSelectCount++
        if (correctionsSelectCount <= 1) {
          return Promise.resolve({ data: [], error: null })
        }
        // Nach dem Insert: zwei Gutschriften, die zusammen 12000 Cent = mehr als 10000
        return Promise.resolve({
          data: [{ corrected_amount_cents: 4000 }, { corrected_amount_cents: 4000 }],
          error: null,
        })
      })
      obj.insert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'corr-1' }, error: null }),
        }),
      })
      obj.delete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
      obj.single = vi.fn().mockResolvedValue({ data: { id: 'corr-1' }, error: null })
      obj.maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'seq-1', last_number: 5 }, error: null })
      obj.upsert = vi.fn().mockResolvedValue({ error: null })
      obj.update = vi.fn().mockReturnValue(obj)
      obj.order = vi.fn().mockReturnValue(obj)
      obj.limit = vi.fn().mockReturnValue(obj)
      return obj
    }

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'invoices') {
          const obj = chainable()
          obj.single = vi.fn().mockResolvedValue({
            data: {
              id: 'inv-1', total_amount: 100, paid_amount: 0,
              status: 'freigegeben', organization_id: 'org-1',
              client_id: 'cl-1', insurance_name: 'AOK',
              insurance_number: '12345', period_start: '2026-01-01',
              period_end: '2026-01-31',
            },
            error: null,
          })
          obj.insert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'credit-inv-1' }, error: null }),
            }),
          })
          return obj
        }
        return chainable()
      }),
      rpc: vi.fn().mockResolvedValue({ data: 'GS-2026-00006', error: null }),
    }

    await expect(
      createCreditNote(mockSupabase as any, 'inv-1', 6000, 'Test-Gutschrift', 'user-1', 'org-1')
    ).rejects.toThrow('Paralleler Zugriff hat den verfuegbaren Betrag ueberschritten')
  })

  it('lehnt Gutschrift auf stornierte Rechnungen ab', async () => {
    const { createCreditNote } = await import('@/lib/billing/core/invoice-engine')

    const mockSupabase = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'inv-1', total_amount: 100, status: 'storniert',
            organization_id: 'org-1',
          },
          error: null,
        }),
      })),
    }

    await expect(
      createCreditNote(mockSupabase as any, 'inv-1', 5000, 'Test', 'user-1', 'org-1')
    ).rejects.toThrow('storniert')
  })

  it('lehnt Gutschrift auf abgeschriebene Rechnungen ab', async () => {
    const { createCreditNote } = await import('@/lib/billing/core/invoice-engine')

    const mockSupabase = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'inv-1', total_amount: 100, status: 'abgeschrieben',
            organization_id: 'org-1',
          },
          error: null,
        }),
      })),
    }

    await expect(
      createCreditNote(mockSupabase as any, 'inv-1', 5000, 'Test', 'user-1', 'org-1')
    ).rejects.toThrow('abgeschrieben')
  })
})

describe('correctInvoice — Validierung', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lehnt korrigierten Gesamtbetrag 0 ab', async () => {
    const { correctInvoice } = await import('@/lib/billing/core/invoice-engine')

    const mockSupabase = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'inv-1', total_amount: 100, status: 'freigegeben',
            organization_id: 'org-1', client_id: 'cl-1',
          },
          error: null,
        }),
      })),
    }

    await expect(
      correctInvoice(
        mockSupabase as any,
        'inv-1',
        [{ leistungsart: 'test', leistungsdatum: '2026-01-01', menge: 1, einheit: 'stunde', einzelpreisCent: 0, gesamtpreisCent: 0 }],
        'Test',
        'user-1',
        'org-1'
      )
    ).rejects.toThrow('Korrigierter Gesamtbetrag muss positiv sein')
  })

  it('lehnt negative Einzelbeträge ab', async () => {
    const { correctInvoice } = await import('@/lib/billing/core/invoice-engine')

    const mockSupabase = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'inv-1', total_amount: 100, status: 'freigegeben',
            organization_id: 'org-1', client_id: 'cl-1',
          },
          error: null,
        }),
      })),
    }

    await expect(
      correctInvoice(
        mockSupabase as any,
        'inv-1',
        [
          { leistungsart: 'ok', leistungsdatum: '2026-01-01', menge: 1, einheit: 'stunde', einzelpreisCent: 5000, gesamtpreisCent: 5000 },
          { leistungsart: 'negativ', leistungsdatum: '2026-01-01', menge: 1, einheit: 'stunde', einzelpreisCent: -100, gesamtpreisCent: -100 },
        ],
        'Test',
        'user-1',
        'org-1'
      )
    ).rejects.toThrow('Negativer Betrag')
  })

  it('lehnt leere Korrekturen ab', async () => {
    const { correctInvoice } = await import('@/lib/billing/core/invoice-engine')

    const mockSupabase = {
      from: vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'inv-1', total_amount: 100, status: 'freigegeben',
            organization_id: 'org-1', client_id: 'cl-1',
          },
          error: null,
        }),
      })),
    }

    await expect(
      correctInvoice(mockSupabase as any, 'inv-1', [], 'Test', 'user-1', 'org-1')
    ).rejects.toThrow('Mindestens eine Korrekturposition erforderlich')
  })
})
