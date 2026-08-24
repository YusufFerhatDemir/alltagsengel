// ═══════════════════════════════════════════════════════════════
// Welle 4 — pain008.ts Tests
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  validateIban,
  generateMandateReference,
  generatePain008,
  type SepaPain008Options,
  type SepaDirectDebitItem,
} from '../pain008'

// ---------------------------------------------------------------------------
// Hilfsstrukturen
// ---------------------------------------------------------------------------

const VALID_CREDITOR_ID = 'DE51ZZZ12345678901'

function makeItem(overrides: Partial<SepaDirectDebitItem> = {}): SepaDirectDebitItem {
  return {
    endToEndId: 'E2E-001',
    amountCents: 13100,
    mandateId: 'MNDT-001',
    mandateDate: '2026-01-15',
    sequenceType: 'RCUR',
    debtorName: 'Max Mustermann',
    debtorIban: 'DE89370400440532013000',
    ...overrides,
  }
}

function makeOptions(overrides: Partial<SepaPain008Options> = {}): SepaPain008Options {
  return {
    messageId: 'MSG-20260801-001',
    creationDateTime: '2026-08-01T10:00:00Z',
    requestedCollectionDate: '2026-08-15',
    creditor: {
      name: 'Alltagsengel UG',
      iban: 'DE89370400440532013000',
      creditorId: VALID_CREDITOR_ID,
    },
    items: [makeItem()],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// validateIban
// ---------------------------------------------------------------------------

describe('validateIban', () => {
  test('akzeptiert gueltige DE-IBAN', () => {
    assert.equal(validateIban('DE89370400440532013000'), true)
  })

  test('lehnt IBAN mit falscher Pruefsumme ab', () => {
    // DE89 -> DE00 ergibt ungueltige Pruefsumme
    assert.equal(validateIban('DE00370400440532013000'), false)
  })

  test('lehnt zu kurze IBAN ab', () => {
    assert.equal(validateIban('DE8937040044'), false)
  })

  test('lehnt zu lange IBAN ab (>34 Zeichen)', () => {
    assert.equal(validateIban('DE89370400440532013000123456789012345'), false)
  })

  test('akzeptiert Kleinbuchstaben (wird intern normalisiert)', () => {
    assert.equal(validateIban('de89370400440532013000'), true)
  })

  test('akzeptiert IBAN mit Leerzeichen', () => {
    assert.equal(validateIban('DE89 3704 0044 0532 0130 00'), true)
  })
})

// ---------------------------------------------------------------------------
// generateMandateReference
// ---------------------------------------------------------------------------

describe('generateMandateReference', () => {
  test('Ergebnis ist maximal 35 Zeichen lang', () => {
    const ref = generateMandateReference('ALLTAGSENGEL', 'K-123456')
    assert.ok(ref.length <= 35, `Referenz zu lang: ${ref.length} Zeichen`)
  })

  test('enthaelt Org-Praefix und Kundennummer', () => {
    const ref = generateMandateReference('AE', '999')
    assert.ok(ref.startsWith('AE-999-'), `Erwartet Start mit AE-999-, bekommen: ${ref}`)
  })

  test('gibt einen String zurueck', () => {
    const ref = generateMandateReference('X', '1')
    assert.equal(typeof ref, 'string')
  })
})

// ---------------------------------------------------------------------------
// generatePain008
// ---------------------------------------------------------------------------

describe('generatePain008', () => {
  test('erzeugt XML mit korrekter Grundstruktur', () => {
    const xml = generatePain008(makeOptions())
    assert.ok(xml.includes('<?xml version="1.0"'))
    assert.ok(xml.includes('<Document'))
    assert.ok(xml.includes('<CstmrDrctDbtInitn>'))
    assert.ok(xml.includes('<GrpHdr>'))
    assert.ok(xml.includes('<MsgId>'))
    assert.ok(xml.includes('<NbOfTxs>'))
    assert.ok(xml.includes('<CtrlSum>'))
    assert.ok(xml.includes('<PmtInf>'))
    assert.ok(xml.includes('<DrctDbtTxInf>'))
  })

  test('wirft bei leerer items-Liste', () => {
    assert.throws(
      () => generatePain008(makeOptions({ items: [] })),
      { message: /Mindestens eine Lastschrift-Position/ },
    )
  })

  test('escaped XML-Sonderzeichen im Namen', () => {
    const xml = generatePain008(makeOptions({
      creditor: {
        name: 'Schmidt & Schulze <GmbH>',
        iban: 'DE89370400440532013000',
        creditorId: VALID_CREDITOR_ID,
      },
    }))
    assert.ok(xml.includes('Schmidt &amp; Schulze &lt;GmbH&gt;'))
    assert.ok(!xml.includes('Schmidt & Schulze <GmbH>'))
  })

  test('gruppiert nach sequenceType (FRST + RCUR)', () => {
    const items: SepaDirectDebitItem[] = [
      makeItem({ endToEndId: 'E2E-F1', sequenceType: 'FRST' }),
      makeItem({ endToEndId: 'E2E-R1', sequenceType: 'RCUR' }),
      makeItem({ endToEndId: 'E2E-R2', sequenceType: 'RCUR' }),
    ]
    const xml = generatePain008(makeOptions({ items }))
    assert.ok(xml.includes('<SeqTp>FRST</SeqTp>'))
    assert.ok(xml.includes('<SeqTp>RCUR</SeqTp>'))
    // Gesamtanzahl im Header ist 3
    assert.ok(xml.includes('<NbOfTxs>3</NbOfTxs>'))
  })

  test('setzt NOTPROVIDED wenn BIC fehlt', () => {
    const xml = generatePain008(makeOptions({
      creditor: {
        name: 'Test GmbH',
        iban: 'DE89370400440532013000',
        creditorId: VALID_CREDITOR_ID,
        // bic absichtlich nicht gesetzt
      },
    }))
    assert.ok(xml.includes('NOTPROVIDED'))
  })

  test('setzt BIC wenn vorhanden', () => {
    const xml = generatePain008(makeOptions({
      creditor: {
        name: 'Test GmbH',
        iban: 'DE89370400440532013000',
        creditorId: VALID_CREDITOR_ID,
        bic: 'COBADEFFXXX',
      },
    }))
    assert.ok(xml.includes('<BIC>COBADEFFXXX</BIC>'))
    // NOTPROVIDED darf trotzdem fuer Debtor erscheinen (kein debtorBic)
  })

  test('kuerzt ueberlanges endToEndId auf 35 Zeichen', () => {
    const longId = 'A'.repeat(50)
    const xml = generatePain008(makeOptions({
      items: [makeItem({ endToEndId: longId })],
    }))
    // Das XML darf nicht den vollen 50-Zeichen-String enthalten
    assert.ok(!xml.includes(longId))
    assert.ok(xml.includes('A'.repeat(35)))
  })

  test('berechnet CtrlSum korrekt fuer mehrere Positionen', () => {
    const items = [
      makeItem({ amountCents: 10050 }),
      makeItem({ amountCents: 5025, endToEndId: 'E2E-002' }),
    ]
    const xml = generatePain008(makeOptions({ items }))
    // Gesamtsumme: 100.50 + 50.25 = 150.75
    assert.ok(xml.includes('<CtrlSum>150.75</CtrlSum>'))
  })
})
