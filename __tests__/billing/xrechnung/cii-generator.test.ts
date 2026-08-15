import { describe, it, expect } from 'vitest'
import { generateCiiXml } from '../cii-generator'
import type { XRechnungData } from '../types'

function sampleData(overrides: Partial<XRechnungData> = {}): XRechnungData {
  return {
    invoiceNumber: 'RE-2026-00001',
    typeCode: '380',
    issueDate: '2026-08-15',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    seller: {
      name: 'Alltagsengel UG (haftungsbeschränkt)',
      street: 'Neue Mainzer Straße 66-68',
      city: 'Frankfurt am Main',
      zip: '60311',
      country: 'DE',
      taxId: '012/345/67890',
      ikNummer: '460629986',
      email: 'info@alltagsengel.care',
      registrationName: 'Alltagsengel UG (haftungsbeschränkt)',
      registrationId: 'HRB 140351',
    },
    buyer: {
      name: 'AOK Hessen',
      street: 'Basler Straße 2',
      city: 'Bad Homburg',
      zip: '61352',
      country: 'DE',
      insuranceNumber: '123456789',
      leitwegId: '0204:460629986-AE-01',
    },
    payment: {
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      bankName: 'Commerzbank',
      paymentTermsDays: 14,
    },
    dueDate: '2026-08-29',
    lineItems: [
      {
        lineId: 1,
        description: 'Alltagsbegleitung nach § 45a SGB XI',
        quantity: 2,
        unitCode: 'HUR',
        unitPriceCents: 3500,
        lineTotalCents: 7000,
        leistungsdatum: '2026-08-05',
      },
      {
        lineId: 2,
        description: 'Alltagsbegleitung nach § 45a SGB XI',
        quantity: 3,
        unitCode: 'HUR',
        unitPriceCents: 3500,
        lineTotalCents: 10500,
        leistungsdatum: '2026-08-12',
      },
    ],
    totalAmountCents: 17500,
    ...overrides,
  }
}

describe('generateCiiXml', () => {
  it('produces valid XML with correct root element', () => {
    const xml = generateCiiXml(sampleData())
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<rsm:CrossIndustryInvoice')
    expect(xml).toContain('</rsm:CrossIndustryInvoice>')
  })

  it('sets XRechnung guideline for xrechnung profile', () => {
    const xml = generateCiiXml(sampleData(), 'xrechnung')
    expect(xml).toContain('urn:xoev-de:kosit:standard:xrechnung_3.0')
  })

  it('sets Factur-X guideline for zugferd profile', () => {
    const xml = generateCiiXml(sampleData(), 'zugferd')
    expect(xml).toContain('urn:factur-x.eu:1p0:extended')
  })

  it('contains invoice number', () => {
    const xml = generateCiiXml(sampleData())
    expect(xml).toContain('<ram:ID>RE-2026-00001</ram:ID>')
  })

  it('sets correct type code for invoice', () => {
    const xml = generateCiiXml(sampleData({ typeCode: '380' }))
    expect(xml).toContain('<ram:TypeCode>380</ram:TypeCode>')
  })

  it('sets correct type code for credit note', () => {
    const xml = generateCiiXml(sampleData({ typeCode: '381' }))
    expect(xml).toContain('<ram:TypeCode>381</ram:TypeCode>')
  })

  it('includes seller information', () => {
    const xml = generateCiiXml(sampleData())
    expect(xml).toContain('Alltagsengel UG')
    expect(xml).toContain('Neue Mainzer Stra')
    expect(xml).toContain('<ram:PostcodeCode>60311</ram:PostcodeCode>')
    expect(xml).toContain('<ram:CountryID>DE</ram:CountryID>')
  })

  it('includes buyer information', () => {
    const xml = generateCiiXml(sampleData())
    expect(xml).toContain('AOK Hessen')
    expect(xml).toContain('Bad Homburg')
  })

  it('includes Leitweg-ID as BuyerReference', () => {
    const xml = generateCiiXml(sampleData())
    expect(xml).toContain('<ram:BuyerReference>0204:460629986-AE-01</ram:BuyerReference>')
  })

  it('includes payment information', () => {
    const xml = generateCiiXml(sampleData())
    expect(xml).toContain('<ram:IBANID>DE89370400440532013000</ram:IBANID>')
    expect(xml).toContain('<ram:BICID>COBADEFFXXX</ram:BICID>')
    expect(xml).toContain('<ram:TypeCode>58</ram:TypeCode>')
  })

  it('marks VAT as exempt for Pflegeleistungen', () => {
    const xml = generateCiiXml(sampleData())
    expect(xml).toContain('<ram:CategoryCode>E</ram:CategoryCode>')
    expect(xml).toContain('<ram:RateApplicablePercent>0</ram:RateApplicablePercent>')
    expect(xml).toContain('§ 4 Nr. 16 UStG')
  })

  it('includes correct monetary summation', () => {
    const xml = generateCiiXml(sampleData())
    expect(xml).toContain('<ram:LineTotalAmount>175.00</ram:LineTotalAmount>')
    expect(xml).toContain('<ram:GrandTotalAmount>175.00</ram:GrandTotalAmount>')
    expect(xml).toContain('<ram:DuePayableAmount>175.00</ram:DuePayableAmount>')
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>')
  })

  it('includes line items with correct details', () => {
    const xml = generateCiiXml(sampleData())
    expect(xml).toContain('<ram:LineID>1</ram:LineID>')
    expect(xml).toContain('<ram:LineID>2</ram:LineID>')
    expect(xml).toContain('<ram:ChargeAmount>35.00</ram:ChargeAmount>')
    expect(xml).toContain('unitCode="HUR"')
    expect(xml).toContain('<ram:LineTotalAmount>70.00</ram:LineTotalAmount>')
    expect(xml).toContain('<ram:LineTotalAmount>105.00</ram:LineTotalAmount>')
  })

  it('includes billing period', () => {
    const xml = generateCiiXml(sampleData())
    expect(xml).toContain('<ram:BillingSpecifiedPeriod>')
    expect(xml).toContain('20260801')
    expect(xml).toContain('20260831')
  })

  it('includes due date and payment terms', () => {
    const xml = generateCiiXml(sampleData())
    expect(xml).toContain('20260829')
    expect(xml).toContain('Zahlbar innerhalb von 14 Tagen ohne Abzug')
  })

  it('escapes XML special characters in text', () => {
    const xml = generateCiiXml(sampleData({
      noteText: 'Sonder & <Zeichen> "Test"',
    }))
    expect(xml).toContain('Sonder &amp; &lt;Zeichen&gt; &quot;Test&quot;')
    expect(xml).not.toContain('Sonder & <Zeichen>')
  })

  it('includes correction reference for Korrekturrechnung', () => {
    const xml = generateCiiXml(sampleData({
      typeCode: '384',
      correctionOfNumber: 'RE-2026-00001',
    }))
    expect(xml).toContain('<ram:TypeCode>384</ram:TypeCode>')
    expect(xml).toContain('<ram:AdditionalReferencedDocument>')
    expect(xml).toContain('RE-2026-00001')
  })

  it('handles missing optional fields gracefully', () => {
    const xml = generateCiiXml(sampleData({
      buyer: {
        name: 'Privatkunde',
        country: 'DE',
      },
      payment: {},
      dueDate: null,
    }))
    expect(xml).toContain('Privatkunde')
    expect(xml).not.toContain('<ram:BuyerReference>')
    expect(xml).not.toContain('<ram:IBANID>')
    expect(xml).not.toContain('<ram:DueDateDateTime>')
  })

  it('formats dates as YYYYMMDD (format 102)', () => {
    const xml = generateCiiXml(sampleData({ issueDate: '2026-08-15' }))
    expect(xml).toContain('format="102">20260815</udt:DateTimeString>')
  })
})
