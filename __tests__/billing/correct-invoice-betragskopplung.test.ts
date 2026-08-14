// ═══════════════════════════════════════════════════════════════
// Security-Final-Audit: Korrekturrechnung mit frei waehlbarem Betrag
// ═══════════════════════════════════════════════════════════════
// Befund: correctInvoice() prueft die Preisabweichung ausschliesslich gegen
// `einzelpreisCent`. Der Rechnungsbetrag entsteht aber aus `gesamtpreisCent`.
// Beide Felder waren voneinander entkoppelt.
//
// Angriff: einzelpreisCent = Tarifpreis (besteht die Abweichungspruefung),
// gesamtpreisCent = beliebig hoch. Ergebnis: Korrekturrechnung ueber jeden
// gewuenschten Betrag, obwohl die Tarif-Gegenpruefung formal bestanden wurde.
//
// Zweiter Befund: gab es zur Leistungsart gar keinen Tarif, entfiel die
// Gegenpruefung vollstaendig (fail-open). Eine frei erfundene Leistungsart
// reichte, um jeden Preis durchzubringen.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest'
import { correctInvoice } from '@/lib/billing/core/invoice-engine'

const ORIGINAL_INVOICE = {
  id: 'inv-1',
  total_amount: 100,
  status: 'freigegeben',
  organization_id: 'org-1',
  client_id: 'cl-1',
  version: 1,
  insurance_name: 'AOK',
  insurance_number: '123',
  period_start: '2026-06-01',
  period_end: '2026-06-30',
}

/** Erreicht der Lauf diesen Marker, ist die Korrektur inhaltlich durch. */
const STOP_MARKER = 'STOP_NACH_PRUEFUNGEN'

const TARIF = {
  id: 'tarif-1',
  preis_cent: 2500,
  verguetungsart: 'zeit_stunde',
  tarif_status: 'verified',
  rechtsgrundlage: 'privat',
  verifizierungs_quelle: null,
}

function mockSupabase(tariffs: unknown[]) {
  const tariffQuery: Record<string, unknown> = {}
  const passthrough = () => tariffQuery
  tariffQuery.select = passthrough
  tariffQuery.eq = passthrough
  tariffQuery.lte = passthrough
  tariffQuery.is = passthrough
  tariffQuery.order = passthrough
  tariffQuery.limit = async () => ({ data: tariffs, error: null })

  return {
    rpc: vi.fn().mockResolvedValue({ data: { validated: true }, error: null }),
    from: vi.fn((table: string) => {
      if (table === 'invoices') {
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: ORIGINAL_INVOICE, error: null }) }) }),
          insert: () => { throw new Error(STOP_MARKER) },
        }
      }
      if (table === 'billing_tariffs') return tariffQuery
      throw new Error(STOP_MARKER)
    }),
  }
}

interface Position {
  leistungsart: string
  leistungsdatum: string
  menge: number
  einheit: string
  einzelpreisCent: number
  gesamtpreisCent: number
  zuschlagProzent?: number
}

function position(over: Partial<Position> = {}): Position {
  return {
    leistungsart: 'alltagsbegleitung_45a',
    leistungsdatum: '2026-06-15',
    menge: 1,
    einheit: 'stunde',
    einzelpreisCent: 2500,
    gesamtpreisCent: 2500,
    ...over,
  }
}

function korrigiere(sb: unknown, positionen: Position[]) {
  return correctInvoice(sb as never, 'inv-1', positionen, 'Testkorrektur', 'user-1', 'org-1')
}

describe('correctInvoice: Kopplung von Einzel- und Gesamtpreis', () => {
  it('lehnt den Angriff ab: Tarifpreis als Einzelpreis, beliebiger Gesamtpreis', async () => {
    const sb = mockSupabase([TARIF])

    await expect(
      korrigiere(sb, [position({ einzelpreisCent: 2500, menge: 1, gesamtpreisCent: 9_999_900 })])
    ).rejects.toThrow(/passt nicht zu Einzelpreis/)
  })

  it('laesst die stimmige Position durch', async () => {
    const sb = mockSupabase([TARIF])

    await expect(
      korrigiere(sb, [position({ einzelpreisCent: 2500, menge: 2, gesamtpreisCent: 5000 })])
    ).rejects.toThrow(STOP_MARKER)
  })

  it('rechnet den Zuschlag in den erwarteten Gesamtpreis ein', async () => {
    const sb = mockSupabase([TARIF])

    await expect(
      korrigiere(sb, [position({
        einzelpreisCent: 2500, menge: 1, zuschlagProzent: 20, gesamtpreisCent: 3000,
      })])
    ).rejects.toThrow(STOP_MARKER)
  })

  it('toleriert 1 Cent Rundung bei gebrochener Menge', async () => {
    const sb = mockSupabase([TARIF])
    // 2500 x 1.5 = 3750; 3751 liegt in der Toleranz, 3760 nicht.
    await expect(
      korrigiere(sb, [position({ menge: 1.5, gesamtpreisCent: 3751 })])
    ).rejects.toThrow(STOP_MARKER)

    await expect(
      korrigiere(sb, [position({ menge: 1.5, gesamtpreisCent: 3760 })])
    ).rejects.toThrow(/passt nicht zu Einzelpreis/)
  })

  it('weist nicht-numerische Betraege ab statt sie zu verrechnen', async () => {
    const sb = mockSupabase([TARIF])

    await expect(
      korrigiere(sb, [position({ gesamtpreisCent: '2500' as unknown as number })])
    ).rejects.toThrow(/muss eine Zahl sein/)
  })

  it('weist Nachkommastellen im Cent-Betrag ab', async () => {
    const sb = mockSupabase([TARIF])

    await expect(
      korrigiere(sb, [position({ einzelpreisCent: 2500.5, gesamtpreisCent: 2500.5 })])
    ).rejects.toThrow(/ganzzahlige Cent/)
  })

  it('weist Menge 0 ab (sonst waere jeder Gesamtpreis "erwartet 0")', async () => {
    const sb = mockSupabase([TARIF])

    await expect(
      korrigiere(sb, [position({ menge: 0, gesamtpreisCent: 5000 })])
    ).rejects.toThrow(/Menge .* groesser als 0/)
  })
})

describe('correctInvoice: fehlender Tarif ist fail-closed', () => {
  it('lehnt eine Leistungsart ohne hinterlegten Tarif ab', async () => {
    const sb = mockSupabase([])

    await expect(
      korrigiere(sb, [position({ leistungsart: 'frei_erfundene_leistung' })])
    ).rejects.toThrow(/Kein Tarif fuer "frei_erfundene_leistung"/)
  })
})
