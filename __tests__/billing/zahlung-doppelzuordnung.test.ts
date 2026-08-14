// ═══════════════════════════════════════════════════════════════════
// Agent 2 / E2E-Nutzerworkflow — Schritt 12 „Zahlung erfassen"
// ═══════════════════════════════════════════════════════════════════
// BEFUND 14.08.2026 (Code-Analyse, live nicht reproduzierbar weil
// payments live 0 Zeilen hat):
//
//   POST /api/billing/invoices/[id]/zahlung rief
//     1. createPayment(...)      → darin autoMatchPayment()
//     2. allocatePayment(...)    → explizit auf diese Rechnung
//
//   Das Auto-Matching vergibt Punkte: Rechnungsnummer im Verwendungszweck
//   = 50, Betrag gleich dem offenen Betrag = 30. Die Route setzt den
//   Verwendungszweck selbst auf „Rechnung <Nummer>" und rechnet standardmäßig
//   den vollen offenen Betrag ab → 80 Punkte, Schwelle 70 → createPayment
//   ordnete die Zahlung SCHON ZU.
//
//   Der anschließende explizite allocatePayment lief dann gegen
//   allocated_cents = amountCents und scheiterte an der Prüfung
//   „Zuordnung übersteigt Zahlungsbetrag" → HTTP 500, obwohl die Zahlung
//   korrekt verbucht war. Beim zweiten Versuch: HTTP 409 „bereits
//   vollständig bezahlt". Für den Admin sah der Normalfall Vollzahlung
//   damit immer nach einem Fehler aus.
//
// FIX: createPayment akzeptiert autoMatch:false. Wer selbst zuordnet,
// schaltet das Matching ab.
// ═══════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { createPayment, allocatePayment } from '@/lib/billing/core'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const ACTOR = '00000000-0000-4000-8000-0000000000bb'

/**
 * Minimal-Stub: payments-INSERT gelingt, alles andere wird gezählt.
 * `invoiceSelects` verrät, ob das Auto-Matching gelaufen ist — es ist der
 * einzige Pfad in createPayment, der offene Rechnungen liest.
 */
function makeStub() {
  const zaehler = { invoiceSelects: 0, allocationInserts: 0, paymentUpdates: 0 }
  // Zustandsbehaftet: allocated_cents muss mitwandern, sonst lässt sich die
  // Doppelzuordnung gar nicht nachstellen.
  const payment = { id: 'pay-1', amount_cents: 7000, allocated_cents: 0, organization_id: ORG }

  const stub = {
    from(tabelle: string) {
      if (tabelle === 'payments') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: payment.id }, error: null }),
            }),
          }),
          update: (werte: Record<string, unknown>) => {
            zaehler.paymentUpdates++
            if (typeof werte.allocated_cents === 'number') {
              payment.allocated_cents = werte.allocated_cents
            }
            return { eq: () => ({ eq: () => ({ select: async () => ({ data: [{ id: payment.id }] }) }) }) }
          },
          select: () => ({
            eq: () => ({ single: async () => ({ data: { ...payment } }) }),
          }),
        } as never
      }

      if (tabelle === 'invoices') {
        zaehler.invoiceSelects++
        // Eine offene Rechnung, deren Nummer im Verwendungszweck steht und
        // deren offener Betrag exakt dem Zahlungsbetrag entspricht: 80 Punkte.
        const offene = [{
          id: 'inv-1',
          invoice_number: 'RE-2026-00001',
          invoice_number_formatted: 'RE-2026-00001',
          total_amount: 70,
          paid_amount: 0,
          client_id: 'cl-1',
          insurance_name: null,
          client: { first_name: 'Test', last_name: 'Person' },
        }]
        const liste = { data: offene, error: null }
        const einzeln = { data: { ...offene[0], status: 'uebermittelt' }, error: null }
        const kette: Record<string, unknown> = {
          select: () => kette,
          eq: () => kette,
          not: () => kette,
          is: async () => liste,
          // Auto-Matching liest die Liste offener Rechnungen; allocatePayment
          // liest danach die eine Rechnung, die es verbuchen will.
          single: async () => einzeln,
          maybeSingle: async () => einzeln,
          update: () => ({ eq: () => ({ eq: () => ({ select: async () => ({ data: [{ id: 'inv-1' }], error: null }) }) }) }),
          then: (r: (v: unknown) => unknown) => Promise.resolve(liste).then(r),
        }
        return kette as never
      }

      if (tabelle === 'payment_allocations') {
        return { insert: async () => { zaehler.allocationInserts++; return { error: null } } } as never
      }

      if (tabelle === 'billing_audit_trail') {
        return { insert: async () => ({ error: null }) } as never
      }

      return { insert: async () => ({ error: null }), update: () => ({ eq: async () => ({}) }) } as never
    },
    rpc: vi.fn(async () => ({ data: null, error: null })),
  }

  return { stub: stub as never, zaehler }
}

const BASIS = {
  organizationId: ORG,
  paymentDate: '2026-08-14',
  amountCents: 7000,
  paymentMethod: 'ueberweisung' as const,
  payerType: 'kunde' as const,
  payerName: 'Test Person',
  verwendungszweck: 'Rechnung RE-2026-00001',
  actorId: ACTOR,
}

describe('createPayment — autoMatch steuerbar', () => {
  it('ordnet mit autoMatch:false NICHTS zu', async () => {
    const { stub, zaehler } = makeStub()

    const ergebnis = await createPayment(stub, { ...BASIS, autoMatch: false })

    expect(ergebnis.paymentId).toBe('pay-1')
    expect(ergebnis.matchingStatus).toBe('nicht_zugeordnet')
    expect(ergebnis.matchedInvoices).toEqual([])
    // Kein Blick in die offenen Rechnungen = kein Auto-Matching gelaufen.
    expect(zaehler.invoiceSelects).toBe(0)
    expect(zaehler.allocationInserts).toBe(0)
  })

  it('matcht ohne die Option weiterhin automatisch (Verhalten unverändert)', async () => {
    const { stub, zaehler } = makeStub()

    await createPayment(stub, BASIS)

    // Der Kassen-/Sammelzahlungsweg über POST /api/billing/payments lebt von
    // diesem Auto-Matching — es darf nicht versehentlich mit abgeschaltet werden.
    expect(zaehler.invoiceSelects).toBeGreaterThan(0)
  })

  it('lehnt Betrag <= 0 auch ohne Auto-Matching ab', async () => {
    const { stub } = makeStub()
    await expect(
      createPayment(stub, { ...BASIS, amountCents: 0, autoMatch: false }),
    ).rejects.toThrow(/positiv/)
  })
})

describe('Ablauf der Zahlungs-Route — createPayment + eigene Zuordnung', () => {
  it('scheitert MIT Auto-Matching an der Doppelzuordnung (der Befund)', async () => {
    const { stub } = makeStub()

    // So lief die Route vor dem Fix: Auto-Matching an, danach explizit zuordnen.
    const p = await createPayment(stub, BASIS)

    await expect(
      allocatePayment(stub, {
        paymentId: p.paymentId,
        allocations: [{ invoiceId: 'inv-1', amountCents: 7000 }],
        actorId: ACTOR,
      }),
    ).rejects.toThrow(/übersteigt Zahlungsbetrag/)
  })

  it('funktioniert OHNE Auto-Matching (nach dem Fix)', async () => {
    const { stub, zaehler } = makeStub()

    const p = await createPayment(stub, { ...BASIS, autoMatch: false })

    await expect(
      allocatePayment(stub, {
        paymentId: p.paymentId,
        allocations: [{ invoiceId: 'inv-1', amountCents: 7000 }],
        actorId: ACTOR,
      }),
    ).resolves.toBeUndefined()

    // Genau eine Zuordnung, nicht zwei.
    expect(zaehler.allocationInserts).toBe(1)
  })
})

describe('Zahlungs-Route ordnet genau einmal zu', () => {
  const route = readFileSync(
    join(process.cwd(), 'app/api/billing/invoices/[id]/zahlung/route.ts'),
    'utf8',
  )

  it('schaltet das Auto-Matching ab, weil sie selbst zuordnet', () => {
    expect(route).toContain('autoMatch: false')
    // Die explizite Zuordnung muss bleiben — sonst bliebe die Zahlung
    // unzugeordnet und die Rechnung offen.
    expect(route).toContain('allocatePayment(')
  })
})
