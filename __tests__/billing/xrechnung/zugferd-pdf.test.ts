import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { embedZugferdXml } from '../zugferd-pdf'

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100">
  <rsm:ExchangedDocument><ram:ID xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100">TEST-001</ram:ID></rsm:ExchangedDocument>
</rsm:CrossIndustryInvoice>`

describe('embedZugferdXml', () => {
  it('embeds XML into a PDF and produces valid PDF bytes', async () => {
    const emptyPdf = await PDFDocument.create()
    emptyPdf.addPage([595, 842])
    const pdfBytes = await emptyPdf.save()

    const result = await embedZugferdXml(new Uint8Array(pdfBytes), SAMPLE_XML, 'TEST-001')

    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBeGreaterThan(pdfBytes.length)

    // Verify we can load the result as a valid PDF
    const loaded = await PDFDocument.load(result)
    expect(loaded.getPageCount()).toBe(1)
  })

  it('sets PDF/A-3 XMP metadata', async () => {
    const emptyPdf = await PDFDocument.create()
    emptyPdf.addPage([595, 842])
    const pdfBytes = await emptyPdf.save()

    const result = await embedZugferdXml(new Uint8Array(pdfBytes), SAMPLE_XML, 'TEST-001')
    const text = new TextDecoder().decode(result)

    expect(text).toContain('pdfaid:part')
    expect(text).toContain('factur-x.xml')
  })

  it('contains the embedded XML filename reference', async () => {
    const emptyPdf = await PDFDocument.create()
    emptyPdf.addPage([595, 842])
    const pdfBytes = await emptyPdf.save()

    const result = await embedZugferdXml(new Uint8Array(pdfBytes), SAMPLE_XML, 'TEST-001')
    const text = new TextDecoder('latin1').decode(result)

    expect(text).toContain('factur-x.xml')
  })
})
