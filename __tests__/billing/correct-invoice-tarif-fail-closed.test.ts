// ═══════════════════════════════════════════════════════════════
// HIGH-Fix 1: correctInvoice darf den Fail-Closed-Tarifschutz nicht umgehen
// ═══════════════════════════════════════════════════════════════
// Die Tarif-Gegenpruefung in correctInvoice() zog frueher den neuesten
// billing_tariffs-Eintrag OHNE tarif_status-Filter. Ein Admin konnte damit
// eine Korrektur mit dem Preis eines 'blocked'- oder 'unverified'-Tarifs
// durchbringen — waehrend resolvePrice() und create_invoice_draft_atomic()
// denselben Tarif ablehnen.
//
// Regel (identisch zu resolvePrice):
//   'blocked'                    → nie verwendbar
//   Kassentarif (!== 'privat')   → nur 'verified'
//   Privattarif  (=== 'privat')  → alles ausser 'blocked'
// ═══════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import {
  correctInvoice,
  isTarifFuerKorrekturVerwendbar,
} from '@/lib/billing/core/invoice-engine'
import { TarifNichtVerifiziertError } from '@/lib/billing/core/price-resolver'

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

const STOP_MARKER = 'STOP_NACH_TARIFPRUEFUNG'

type TarifRow = {
  id: string
  preis_cent: number
  verguetungsart: string
  tarif_status: string | null
  rechtsgrundlage: string | null
  verifizierungs_quelle: string | null
}

function tarif(over: Partial<TarifRow> = {}): TarifRow {
  return {
    id: 'tarif-1',
    preis_cent: 2500,
    verguetungsart: 'zeit_stunde',
    tarif_status: 'verified',
    rechtsgrundlage: '§45b SGB XI',
    verifizierungs_quelle: null,
    ...over,
  }
}

function mockSupabase(opts: {
  tariffs?: TarifRow[]
  tariffError?: { message: string }
}) {
  const tariffQuery: Record<string, unknown> = {}
  const passthrough = () => tariffQuery
  tariffQuery.select = passthrough
  tariffQuery.eq = passthrough
  tariffQuery.lte = passthrough
  tariffQuery.is = passthrough
  tariffQuery.order = passthrough
  tariffQuery.limit = async () => ({
    data: opts.tariffError ? null : (opts.tariffs ?? []),
    error: opts.tariffError ?? null,
  })

  return {
    rpc: vi.fn().mockResolvedValue({ data: { validated: true }, error: null }),
    from: vi.fn((table: string) => {
      if (table === 'invoices') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: ORIGINAL_INVOICE, error: null }),
            }),
          }),
          // Ab hier waere die Korrektur durch — im Test bewusst abbrechen.
          insert: () => {
            throw new Error(STOP_MARKER)
          },
        }
      }
      if (table === 'billing_tariffs') return tariffQuery
      throw new Error(STOP_MARKER)
    }),
  }
}

const KORREKTUR = [{
  leistungsart: 'alltagsbegleitung_45a',
  leistungsdatum: '2026-06-15',
  menge: 1,
  einheit: 'stunde',
  einzelpreisCent: 2500,
  gesamtpreisCent: 2500,
}]

function korrigiere(sb: unknown) {
  return correctInvoice(
    sb as never,
    'inv-1',
    KORREKTUR,
    'Testkorrektur',
    'user-1',
    'org-1'
  )
}

// ---------------------------------------------------------------------------
// Statusregel (Unit)
// ---------------------------------------------------------------------------

describe('isTarifFuerKorrekturVerwendbar', () => {
  it('Kassentarif: nur verified', () => {
    expect(isTarifFuerKorrekturVerwendbar({ tarif_status: 'verified', rechtsgrundlage: '§45b SGB XI' })).toBe(true)
    expect(isTarifFuerKorrekturVerwendbar({ tarif_status: 'unverified', rechtsgrundlage: '§45b SGB XI' })).toBe(false)
    expect(isTarifFuerKorrekturVerwendbar({ tarif_status: 'blocked', rechtsgrundlage: '§45b SGB XI' })).toBe(false)
  })

  it('Privattarif: alles ausser blocked', () => {
    expect(isTarifFuerKorrekturVerwendbar({ tarif_status: 'unverified', rechtsgrundlage: 'privat' })).toBe(true)
    expect(isTarifFuerKorrekturVerwendbar({ tarif_status: 'verified', rechtsgrundlage: 'privat' })).toBe(true)
    expect(isTarifFuerKorrekturVerwendbar({ tarif_status: 'blocked', rechtsgrundlage: 'privat' })).toBe(false)
  })

  it('fehlender Status gilt als unverified (fail-closed)', () => {
    expect(isTarifFuerKorrekturVerwendbar({ rechtsgrundlage: '§45b SGB XI' })).toBe(false)
    expect(isTarifFuerKorrekturVerwendbar({ tarif_status: null, rechtsgrundlage: null })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// correctInvoice — Fail-Closed
// ---------------------------------------------------------------------------

describe('correctInvoice: Tarif-Fail-Closed', () => {
  it('lehnt Korrektur ab, wenn nur ein blockierter Kassentarif existiert', async () => {
    const sb = mockSupabase({
      tariffs: [tarif({
        tarif_status: 'blocked',
        verifizierungs_quelle: 'Preis ueberschreitet Obergrenze',
      })],
    })

    await expect(korrigiere(sb)).rejects.toThrow(TarifNichtVerifiziertError)

    try {
      await korrigiere(sb)
      throw new Error('haette werfen muessen')
    } catch (e) {
      expect(e).toBeInstanceOf(TarifNichtVerifiziertError)
      const err = e as TarifNichtVerifiziertError
      expect(err.tarifStatus).toBe('blocked')
      expect(err.message).toContain('gesperrt')
      expect(err.message).toContain('Obergrenze')
    }
  })

  it('lehnt Korrektur ab, wenn nur ein unverifizierter Kassentarif existiert', async () => {
    const sb = mockSupabase({ tariffs: [tarif({ tarif_status: 'unverified' })] })

    await expect(korrigiere(sb)).rejects.toThrow(TarifNichtVerifiziertError)

    try {
      await korrigiere(sb)
      throw new Error('haette werfen muessen')
    } catch (e) {
      expect((e as TarifNichtVerifiziertError).tarifStatus).toBe('unverified')
    }
  })

  it('lehnt Korrektur ab, wenn ein blockierter Privattarif exakt matcht', async () => {
    const sb = mockSupabase({
      tariffs: [tarif({ tarif_status: 'blocked', rechtsgrundlage: 'privat' })],
    })

    await expect(korrigiere(sb)).rejects.toThrow(TarifNichtVerifiziertError)
  })

  it('ignoriert den blockierten Preis und prueft gegen den verifizierten Tarif', async () => {
    // Angriffsmuster: neuester Tarif ist blocked und passt exakt zum
    // gewuenschten Preis (2500). Verwendbar ist nur der verifizierte
    // Tarif mit 1000 Cent → >10% Abweichung → Korrekturgrund noetig.
    const sb = mockSupabase({
      tariffs: [
        tarif({ id: 'gesperrt', preis_cent: 2500, tarif_status: 'blocked' }),
        tarif({ id: 'ok', preis_cent: 1000, tarif_status: 'verified' }),
      ],
    })

    await expect(korrigiere(sb)).rejects.toThrow(/Korrektur-Preisabweichung/)
  })

  it('verifizierter Kassentarif kommt durch die Tarifpruefung', async () => {
    const sb = mockSupabase({ tariffs: [tarif({ tarif_status: 'verified' })] })

    // Der Lauf bricht erst NACH der Tarifpruefung am Test-Marker ab.
    await expect(korrigiere(sb)).rejects.toThrow(STOP_MARKER)
  })

  it('unverifizierter PRIVATtarif kommt durch (nur Kasse ist streng)', async () => {
    const sb = mockSupabase({
      tariffs: [tarif({ tarif_status: 'unverified', rechtsgrundlage: 'privat' })],
    })

    await expect(korrigiere(sb)).rejects.toThrow(STOP_MARKER)
  })

  it('DB-Fehler bei der Tarifpruefung bricht ab statt still durchzuwinken', async () => {
    const sb = mockSupabase({ tariffError: { message: 'connection refused' } })

    await expect(korrigiere(sb)).rejects.toThrow(/Tarif-Gegenpruefung .* fehlgeschlagen/)
  })

  it('Tarif-Query selektiert tarif_status und rechtsgrundlage', () => {
    // Regressionsschutz: ohne diese Spalten waere jede Statuspruefung wirkungslos.
    const src = readFileSync(
      join(process.cwd(), 'lib/billing/core/invoice-engine.ts'),
      'utf8'
    )
    const korrekturTeil = src.slice(src.indexOf('export async function correctInvoice'))
    expect(korrekturTeil).toContain('tarif_status')
    expect(korrekturTeil).toContain('rechtsgrundlage')
    expect(korrekturTeil).toContain('isTarifFuerKorrekturVerwendbar')
  })
})
