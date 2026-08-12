import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), 'utf-8')

// ---------------------------------------------------------------------------
// Quellcode-Inspektion: Status-Machine + OPOS + API-Route
// ---------------------------------------------------------------------------

describe('D6: Status-Machine — abgeschrieben', () => {
  const smSrc = read('lib/billing/core/status-machine.ts')

  it('definiert abgeschrieben als InvoiceStatus', () => {
    expect(smSrc).toContain("| 'abgeschrieben'")
  })

  it('hat abgeschrieben als Terminal-Status', () => {
    const terminalSection = smSrc.slice(smSrc.indexOf('TERMINAL_STATUSES'))
    expect(terminalSection).toContain("'abgeschrieben'")
  })

  it('erlaubt Übergang von freigegeben → abgeschrieben', () => {
    expect(smSrc).toMatch(/freigegeben.*'abgeschrieben'/)
  })

  it('erlaubt Übergang von uebermittelt → abgeschrieben', () => {
    expect(smSrc).toMatch(/uebermittelt.*'abgeschrieben'/)
  })

  it('erlaubt Übergang von quittiert → abgeschrieben', () => {
    expect(smSrc).toMatch(/quittiert.*'abgeschrieben'/)
  })

  it('erlaubt Übergang von teilweise_bezahlt → abgeschrieben', () => {
    expect(smSrc).toMatch(/teilweise_bezahlt.*'abgeschrieben'/)
  })

  it('erlaubt Übergang von gekuerzt → abgeschrieben', () => {
    expect(smSrc).toMatch(/gekuerzt.*'abgeschrieben'/)
  })

  it('erlaubt Übergang von strittig → abgeschrieben', () => {
    expect(smSrc).toMatch(/strittig.*'abgeschrieben'/)
  })

  it('erlaubt KEINEN Übergang von bezahlt → abgeschrieben', () => {
    const bezahltLine = smSrc.match(/^\s+bezahlt:\s*\[([^\]]*)\]/m)?.[1] ?? ''
    expect(bezahltLine).not.toContain('abgeschrieben')
  })

  it('erlaubt KEINEN Übergang von storniert → abgeschrieben', () => {
    const storniertLine = smSrc.match(/storniert:\s*\[([^\]]*)\]/)?.[1] ?? ''
    expect(storniertLine).not.toContain('abgeschrieben')
  })

  it('erlaubt KEINEN Übergang von entwurf → abgeschrieben', () => {
    const entwurfLine = smSrc.match(/entwurf:\s*\[([^\]]*)\]/)?.[1] ?? ''
    expect(entwurfLine).not.toContain('abgeschrieben')
  })

  it('erlaubt KEINEN Übergang von abgeschrieben → irgendwo', () => {
    const abgeschriebenLine = smSrc.match(/abgeschrieben:\s*\[([^\]]*)\]/)?.[1] ?? ''
    expect(abgeschriebenLine.trim()).toBe('')
  })

  it('hat deutsches Label', () => {
    expect(smSrc).toContain("abgeschrieben:          'Abgeschrieben'")
  })
})

describe('D6: OPOS-Ausschluss', () => {
  const oposSrc = read('lib/billing/opos/opos-manager.ts')

  it('schließt abgeschriebene Rechnungen aus OPOS aus', () => {
    expect(oposSrc).toContain('"abgeschrieben"')
    expect(oposSrc).toContain('.not(\'status\', \'in\'')
  })
})

describe('D6: API-Route /api/billing/invoices/[id]/abschreiben', () => {
  const routeSrc = read('app/api/billing/invoices/[id]/abschreiben/route.ts')

  it('prüft Admin/Superadmin-Berechtigung', () => {
    expect(routeSrc).toContain("['admin', 'superadmin'].includes(profile.role)")
  })

  it('verlangt Begründung (reason)', () => {
    expect(routeSrc).toContain('reason')
    expect(routeSrc).toContain('mind. 5 Zeichen')
  })

  it('prüft Org-Fence', () => {
    expect(routeSrc).toContain('organization_id')
    expect(routeSrc).toContain('organizationId')
  })

  it('nutzt writeOffInvoice', () => {
    expect(routeSrc).toContain('writeOffInvoice')
  })

  it('gibt 401 bei unangemeldetem User', () => {
    expect(routeSrc).toContain('Nicht autorisiert')
    expect(routeSrc).toContain('401')
  })

  it('gibt 403 bei Nicht-Admin', () => {
    expect(routeSrc).toContain('Nur fuer Administratoren')
    expect(routeSrc).toContain('403')
  })
})

describe('D6: Migration — DB-Constraint', () => {
  const migrationSrc = read('supabase/migrations/20260831010000_abgeschrieben_credit_cas.sql')

  it('erweitert invoices_status_check um abgeschrieben', () => {
    expect(migrationSrc).toContain("'abgeschrieben'")
    expect(migrationSrc).toContain('invoices_status_check')
  })

  it('erweitert Terminal-Status im Trigger um abgeschrieben', () => {
    expect(migrationSrc).toContain("'bezahlt', 'storniert', 'akzeptiert', 'abgeschrieben'")
  })
})

// ---------------------------------------------------------------------------
// Unit-Tests: writeOffInvoice
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

function makeSupabase(invoice: Record<string, unknown>, updateReturns?: Record<string, unknown> | null) {
  return {
    from: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: invoice, error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: updateReturns !== undefined ? updateReturns : { id: invoice.id },
                error: null,
              }),
            }),
          }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  }
}

describe('writeOffInvoice — Kernlogik', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('schreibt freigegebene Rechnung erfolgreich ab', async () => {
    const { writeOffInvoice } = await import('@/lib/billing/core/invoice-engine')
    const sb = makeSupabase({
      id: 'inv-1', total_amount: 100, paid_amount: 0,
      status: 'freigegeben', organization_id: 'org-1',
    })

    const result = await writeOffInvoice(sb as any, 'inv-1', 'Uneinbringlich (Insolvenz)', 'user-1', 'org-1')
    expect(result.writtenOffAmountCents).toBe(10000)
    expect(result.previousStatus).toBe('freigegeben')
    expect(mockLogBillingAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'abgeschrieben',
        reason: 'Uneinbringlich (Insolvenz)',
      })
    )
  })

  it('berechnet Restbetrag bei Teilzahlung', async () => {
    const { writeOffInvoice } = await import('@/lib/billing/core/invoice-engine')
    const sb = makeSupabase({
      id: 'inv-2', total_amount: 200, paid_amount: 75,
      status: 'teilweise_bezahlt', organization_id: 'org-1',
    })

    const result = await writeOffInvoice(sb as any, 'inv-2', 'Nicht eintreibbar', 'user-1', 'org-1')
    expect(result.writtenOffAmountCents).toBe(12500) // 200€ - 75€ = 125€ = 12500 Cent
    expect(result.paidAmountCents).toBe(7500)
    expect(result.totalAmountCents).toBe(20000)
  })

  it('lehnt Abschreibung von bezahlter Rechnung ab', async () => {
    const { writeOffInvoice } = await import('@/lib/billing/core/invoice-engine')
    const sb = makeSupabase({
      id: 'inv-3', total_amount: 100, paid_amount: 100,
      status: 'bezahlt', organization_id: 'org-1',
    })

    await expect(
      writeOffInvoice(sb as any, 'inv-3', 'Sollte nicht gehen', 'user-1', 'org-1')
    ).rejects.toThrow('kann nicht abgeschrieben werden')
  })

  it('lehnt Abschreibung von stornierter Rechnung ab', async () => {
    const { writeOffInvoice } = await import('@/lib/billing/core/invoice-engine')
    const sb = makeSupabase({
      id: 'inv-4', total_amount: 100, paid_amount: 0,
      status: 'storniert', organization_id: 'org-1',
    })

    await expect(
      writeOffInvoice(sb as any, 'inv-4', 'Sollte nicht gehen', 'user-1', 'org-1')
    ).rejects.toThrow('kann nicht abgeschrieben werden')
  })

  it('lehnt Abschreibung von Entwurf ab', async () => {
    const { writeOffInvoice } = await import('@/lib/billing/core/invoice-engine')
    const sb = makeSupabase({
      id: 'inv-5', total_amount: 100, paid_amount: 0,
      status: 'entwurf', organization_id: 'org-1',
    })

    await expect(
      writeOffInvoice(sb as any, 'inv-5', 'Sollte nicht gehen', 'user-1', 'org-1')
    ).rejects.toThrow('kann nicht abgeschrieben werden')
  })

  it('lehnt Abschreibung ohne Begründung ab', async () => {
    const { writeOffInvoice } = await import('@/lib/billing/core/invoice-engine')
    const sb = makeSupabase({
      id: 'inv-6', total_amount: 100, paid_amount: 0,
      status: 'freigegeben', organization_id: 'org-1',
    })

    await expect(
      writeOffInvoice(sb as any, 'inv-6', '', 'user-1', 'org-1')
    ).rejects.toThrow('Begruendung')
  })

  it('lehnt Abschreibung mit zu kurzer Begründung ab', async () => {
    const { writeOffInvoice } = await import('@/lib/billing/core/invoice-engine')
    const sb = makeSupabase({
      id: 'inv-7', total_amount: 100, paid_amount: 0,
      status: 'freigegeben', organization_id: 'org-1',
    })

    await expect(
      writeOffInvoice(sb as any, 'inv-7', 'ab', 'user-1', 'org-1')
    ).rejects.toThrow('mind. 5 Zeichen')
  })

  it('prüft Org-Fence', async () => {
    const { writeOffInvoice } = await import('@/lib/billing/core/invoice-engine')
    const sb = makeSupabase({
      id: 'inv-8', total_amount: 100, paid_amount: 0,
      status: 'freigegeben', organization_id: 'org-ANDERE',
    })

    await expect(
      writeOffInvoice(sb as any, 'inv-8', 'Test Abschreibung', 'user-1', 'org-1')
    ).rejects.toThrow('gehoert nicht zur angegebenen Organisation')
  })

  it('erkennt Race Condition bei CAS-Failure', async () => {
    const { writeOffInvoice } = await import('@/lib/billing/core/invoice-engine')
    const sb = makeSupabase(
      {
        id: 'inv-9', total_amount: 100, paid_amount: 0,
        status: 'freigegeben', organization_id: 'org-1',
      },
      null // CAS-Update liefert null → Conflict
    )

    await expect(
      writeOffInvoice(sb as any, 'inv-9', 'Concurrent test', 'user-1', 'org-1')
    ).rejects.toThrow('paralleler Zugriff')
  })

  it('lehnt Abschreibung bei keinem offenen Betrag ab', async () => {
    const { writeOffInvoice } = await import('@/lib/billing/core/invoice-engine')
    const sb = makeSupabase({
      id: 'inv-10', total_amount: 100, paid_amount: 100,
      status: 'teilweise_bezahlt', organization_id: 'org-1',
    })

    await expect(
      writeOffInvoice(sb as any, 'inv-10', 'Voll bezahlt', 'user-1', 'org-1')
    ).rejects.toThrow('Keine offene Forderung')
  })

  it('protokolliert im Audit-Trail mit Beträgen', async () => {
    const { writeOffInvoice } = await import('@/lib/billing/core/invoice-engine')
    const sb = makeSupabase({
      id: 'inv-11', total_amount: 500, paid_amount: 200,
      status: 'quittiert', organization_id: 'org-1',
    })

    await writeOffInvoice(sb as any, 'inv-11', 'Forderung uneinbringlich', 'user-1', 'org-1')

    expect(mockLogBillingAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: 'invoice',
        entityId: 'inv-11',
        action: 'abgeschrieben',
        newState: expect.objectContaining({
          status: 'abgeschrieben',
          written_off_amount_cents: 30000,
        }),
        previousState: expect.objectContaining({
          status: 'quittiert',
        }),
      })
    )
  })
})
