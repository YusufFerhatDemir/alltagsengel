// ═══════════════════════════════════════════════════════════════
// Track A4 — Manuelle Zahlungserfassung
// ═══════════════════════════════════════════════════════════════
// Bereich 9 der Lueckenanalyse: „Keine manuelle Zahlungserfassung in der
// Oberfläche. POST /api/billing/payments existiert, wird aber von keiner
// .tsx-Datei aufgerufen."
//
// Geprueft wird, was die Oberflaeche an den Kern uebergibt und wie der
// Kern Teil-, Voll- und Ueberzahlung verbucht — inklusive der Regel, dass
// hoechstens der offene Betrag zugeordnet wird.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { parseBetragZuCent } from '@/lib/admin/betrag'
import { createPayment, allocatePayment } from '@/lib/billing/core'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const ACTOR = '00000000-0000-4000-8000-0000000000bb'
const INV = '00000000-0000-4000-8000-0000000000cc'

describe('parseBetragZuCent', () => {
  it('liest deutsche und englische Schreibweise gleich', () => {
    expect(parseBetragZuCent('105,00')).toBe(10500)
    expect(parseBetragZuCent('105.00')).toBe(10500)
    expect(parseBetragZuCent('1.234,56')).toBe(123456)
    expect(parseBetragZuCent('105,00 €')).toBe(10500)
    expect(parseBetragZuCent(' 105 ')).toBe(10500)
  })

  it('rundet auf ganze Cent', () => {
    expect(parseBetragZuCent('0,015')).toBe(2)
    expect(parseBetragZuCent('33,333')).toBe(3333)
  })

  it('meldet Unsinn als NaN statt ihn durchzureichen', () => {
    for (const eingabe of ['', '   ', 'abc', '12,34,56', '1e5', '--3']) {
      expect(Number.isNaN(parseBetragZuCent(eingabe))).toBe(true)
    }
  })
})

/**
 * Zustandsbehafteter Stub fuer payments + payment_allocations + invoices.
 * `rechnung.paid_amount` wandert echt mit, sonst laesst sich Teil- vs.
 * Vollzahlung nicht auseinanderhalten.
 */
function makeStub(rechnungGesamtEuro: number, bereitsBezahltEuro = 0) {
  const zahlung = { id: 'pay-1', amount_cents: 0, allocated_cents: 0, organization_id: ORG }
  const rechnung = {
    id: INV,
    total_amount: rechnungGesamtEuro,
    paid_amount: bereitsBezahltEuro,
    status: 'freigegeben',
    organization_id: ORG,
  }
  const protokoll = {
    allocations: [] as Record<string, unknown>[],
    invoiceUpdates: [] as Record<string, unknown>[],
    dunningUpdates: [] as Record<string, unknown>[],
    autoMatchGelaufen: false,
  }

  const stub = {
    from(tabelle: string) {
      if (tabelle === 'payments') {
        return {
          insert: (werte: Record<string, unknown>) => {
            zahlung.amount_cents = Number(werte.amount_cents)
            return { select: () => ({ single: async () => ({ data: { id: zahlung.id }, error: null }) }) }
          },
          select: () => ({ eq: () => ({ single: async () => ({ data: { ...zahlung } }) }) }),
          update: (werte: Record<string, unknown>) => {
            if (typeof werte.allocated_cents === 'number') zahlung.allocated_cents = werte.allocated_cents
            return { eq: () => ({ eq: () => ({ select: async () => ({ data: [{ id: zahlung.id }] }) }) }) }
          },
        } as never
      }

      if (tabelle === 'invoices') {
        return {
          // autoMatchPayment liest offene Rechnungen ueber .not(...).is(...)
          select: () => ({
            eq: (spalte: string) => {
              if (spalte === 'organization_id') {
                protokoll.autoMatchGelaufen = true
                return { not: () => ({ is: async () => ({ data: [] }) }) }
              }
              return {
                eq: () => ({ maybeSingle: async () => ({ data: { ...rechnung } }) }),
                maybeSingle: async () => ({ data: { ...rechnung } }),
              }
            },
          }),
          update: (werte: Record<string, unknown>) => {
            protokoll.invoiceUpdates.push(werte)
            if (typeof werte.paid_amount === 'number') rechnung.paid_amount = werte.paid_amount
            if (typeof werte.status === 'string') rechnung.status = werte.status
            return { eq: () => ({ eq: () => ({ select: async () => ({ data: [{ id: INV }], error: null }) }) }) }
          },
        } as never
      }

      if (tabelle === 'payment_allocations') {
        return {
          insert: async (werte: Record<string, unknown>) => {
            protokoll.allocations.push(werte)
            return { error: null }
          },
        } as never
      }

      if (tabelle === 'dunning_entries') {
        return {
          update: (werte: Record<string, unknown>) => {
            protokoll.dunningUpdates.push(werte)
            return { eq: async () => ({ error: null }) }
          },
        } as never
      }

      if (tabelle === 'billing_audit_trail') {
        return { insert: async () => ({ error: null }) } as never
      }

      throw new Error(`Unerwartete Tabelle im Stub: ${tabelle}`)
    },
  }

  return { stub: stub as never, rechnung, zahlung, protokoll }
}

/**
 * Bildet den Serverpfad aus POST /api/billing/payments mit `invoiceId`
 * nach: kein Auto-Matching, Zuordnung hoechstens in Hoehe des offenen
 * Betrags, Rest bleibt unzugeordnet.
 */
async function bucheAufRechnung(
  stub: never,
  betragCents: number,
  offenCents: number
) {
  const result = await createPayment(stub, {
    organizationId: ORG,
    paymentDate: '2026-08-21',
    amountCents: betragCents,
    paymentMethod: 'bar',
    payerType: 'kunde',
    payerName: 'Erika Mustermann',
    actorId: ACTOR,
    autoMatch: false,
  })

  const zuordnungCents = Math.min(betragCents, offenCents)
  await allocatePayment(stub, {
    paymentId: result.paymentId,
    allocations: [{ invoiceId: INV, amountCents: zuordnungCents }],
    actorId: ACTOR,
  })

  return {
    paymentId: result.paymentId,
    zuordnungCents,
    ueberzahlungCents: betragCents - zuordnungCents,
    rechnungAusgeglichen: zuordnungCents >= offenCents,
  }
}

describe('Zahlung auf eine Rechnung buchen', () => {
  it('bucht eine Vollzahlung und setzt die Rechnung auf bezahlt', async () => {
    const { stub, rechnung, protokoll } = makeStub(105)

    const ergebnis = await bucheAufRechnung(stub, 10500, 10500)

    expect(ergebnis.zuordnungCents).toBe(10500)
    expect(ergebnis.ueberzahlungCents).toBe(0)
    expect(ergebnis.rechnungAusgeglichen).toBe(true)
    expect(rechnung.status).toBe('bezahlt')
    expect(rechnung.paid_amount).toBe(105)
    expect(protokoll.allocations[0]).toMatchObject({ allocation_type: 'vollzahlung', amount_cents: 10500 })
    // Kein Auto-Matching: die Route schaltet es mit invoiceId ab.
    expect(protokoll.autoMatchGelaufen).toBe(false)
  })

  it('bucht eine Teilzahlung und laesst den Rest offen', async () => {
    const { stub, rechnung, protokoll } = makeStub(105)

    const ergebnis = await bucheAufRechnung(stub, 4000, 10500)

    expect(ergebnis.zuordnungCents).toBe(4000)
    expect(ergebnis.rechnungAusgeglichen).toBe(false)
    expect(rechnung.status).toBe('teilweise_bezahlt')
    expect(rechnung.paid_amount).toBe(40)
    expect(protokoll.allocations[0]).toMatchObject({ allocation_type: 'teilzahlung' })
    // Der Mahneintrag muss den Teilbetrag kennen, sonst mahnt der Lauf zu viel.
    expect(protokoll.dunningUpdates[0]).toMatchObject({ amount_paid_cents: 4000 })
  })

  it('ordnet bei Ueberzahlung hoechstens den offenen Betrag zu', async () => {
    const { stub, rechnung, protokoll } = makeStub(105)

    const ergebnis = await bucheAufRechnung(stub, 12000, 10500)

    expect(ergebnis.zuordnungCents).toBe(10500)
    expect(ergebnis.ueberzahlungCents).toBe(1500)
    expect(rechnung.paid_amount).toBe(105)
    expect(protokoll.allocations).toHaveLength(1)
    // Der Ueberschuss bleibt als nicht zugeordneter Zahlungseingang stehen.
    expect(protokoll.allocations[0]).toMatchObject({ amount_cents: 10500 })
  })

  it('beruecksichtigt eine bereits geleistete Anzahlung', async () => {
    const { stub, rechnung } = makeStub(105, 40)

    const ergebnis = await bucheAufRechnung(stub, 6500, 6500)

    expect(ergebnis.rechnungAusgeglichen).toBe(true)
    expect(rechnung.paid_amount).toBe(105)
    expect(rechnung.status).toBe('bezahlt')
  })

  it('weist eine Zuordnung ueber den offenen Betrag hinaus ab', async () => {
    const { stub } = makeStub(105)

    const result = await createPayment(stub, {
      organizationId: ORG,
      paymentDate: '2026-08-21',
      amountCents: 20000,
      paymentMethod: 'ueberweisung',
      payerType: 'kunde',
      actorId: ACTOR,
      autoMatch: false,
    })

    await expect(allocatePayment(stub, {
      paymentId: result.paymentId,
      allocations: [{ invoiceId: INV, amountCents: 20000 }],
      actorId: ACTOR,
    })).rejects.toThrow(/uebersteigt offenen Betrag/)
  })
})
