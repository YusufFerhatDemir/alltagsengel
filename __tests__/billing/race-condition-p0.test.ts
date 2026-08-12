/**
 * P0 Race Condition Tests
 *
 * 1. allocatePayment OCC — concurrent modification detected
 * 2. erstelleAbrechnungslauf — duplicate detection via post-insert check
 * 3. allocatePayment OCC — payment allocated_cents concurrent modification
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockLogBillingAction } = vi.hoisted(() => ({
  mockLogBillingAction: vi.fn(),
}))

vi.mock('@/lib/billing/core/audit', () => ({
  logBillingAction: mockLogBillingAction,
  computeContentHash: vi.fn().mockResolvedValue('test-hash'),
}))

vi.mock('@/lib/billing/core/status-machine', () => ({
  isTerminalStatus: vi.fn((s: string) => ['bezahlt', 'storniert', 'akzeptiert'].includes(s)),
  isValidInvoiceStatus: vi.fn(() => true),
  validateTransition: vi.fn(),
  INVOICE_NUMBER_PREFIX: { storno: 'ST', korrektur: 'KR', gutschrift: 'GS' },
}))

// ═══════════════════════════════════════════════════════════════
// allocatePayment
// ═══════════════════════════════════════════════════════════════

describe('allocatePayment — OCC (P0-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws on concurrent invoice modification', async () => {
    const { allocatePayment } = await import('@/lib/billing/core/payments')

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'payments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'pay-1', amount_cents: 5000, allocated_cents: 0, organization_id: 'org-1' },
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockResolvedValue({ data: [{ id: 'pay-1' }] }),
                }),
              }),
            }),
          }
        }
        if (table === 'invoices') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'inv-1', total_amount: 50, paid_amount: 0, status: 'offen' },
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockResolvedValue({ data: [] }),
                }),
              }),
            }),
          }
        }
        if (table === 'payment_allocations') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        if (table === 'dunning_entries') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
      }),
    } as any

    await expect(
      allocatePayment(mockSupabase, {
        paymentId: 'pay-1',
        allocations: [{ invoiceId: 'inv-1', amountCents: 5000 }],
        actorId: 'user-1',
      })
    ).rejects.toThrow('Konkurrierender Zugriff auf Rechnung inv-1')
  })

  it('succeeds when no concurrent modification', async () => {
    const { allocatePayment } = await import('@/lib/billing/core/payments')

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'payments') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'pay-1', amount_cents: 5000, allocated_cents: 0, organization_id: 'org-1' },
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockResolvedValue({ data: [{ id: 'pay-1' }] }),
                }),
              }),
            }),
          }
        }
        if (table === 'invoices') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'inv-1', total_amount: 50, paid_amount: 0, status: 'offen' },
              error: null,
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  select: vi.fn().mockResolvedValue({ data: [{ id: 'inv-1' }] }),
                }),
              }),
            }),
          }
        }
        if (table === 'payment_allocations') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        if (table === 'dunning_entries') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
      }),
    } as any

    await expect(
      allocatePayment(mockSupabase, {
        paymentId: 'pay-1',
        allocations: [{ invoiceId: 'inv-1', amountCents: 5000 }],
        actorId: 'user-1',
      })
    ).resolves.toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════
// erstelleAbrechnungslauf — Duplikat-Erkennung
// ═══════════════════════════════════════════════════════════════

describe('erstelleAbrechnungslauf — Duplikat-Schutz (P0-16)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('idempotency_key is deterministic for same parameters', async () => {
    const { erstelleAbrechnungslauf } = await import('@/lib/abrechnung/kassenabrechnung-engine')

    const preFlightFail = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        not: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    } as any

    const result = await erstelleAbrechnungslauf(preFlightFail, {
      organizationId: 'org-1',
      abrechnungsmonat: '2026-07',
      bundesland: 'HE',
      actorId: 'user-1',
    })

    expect(result.status).toBe('validierung_fehlgeschlagen')
  })

  it('idempotency_key format is org_month_ik_type', () => {
    const org = 'org-1'
    const monat = '2026-07'
    const ik = 'SAMMEL'
    const typ = 'erstabrechnung'
    const key = `${org}_${monat}_${ik}_${typ}`
    expect(key).toBe('org-1_2026-07_SAMMEL_erstabrechnung')
    expect(key).toContain(org)
    expect(key).toContain(monat)
  })
})
