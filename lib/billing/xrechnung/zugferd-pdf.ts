import { PDFDocument, PDFName, PDFString, PDFArray, PDFDict, PDFHexString, PDFStream } from 'pdf-lib'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateZugferdXml, loadInvoiceXRechnungData } from './invoice-to-xrechnung'
import { generateCiiXml } from './cii-generator'

const ZUGFERD_XML_FILENAME = 'factur-x.xml'

function buildXmpMetadata(invoiceNumber: string, now: string): string {
  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '    <rdf:Description rdf:about=""',
    '      xmlns:dc="http://purl.org/dc/elements/1.1/"',
    '      xmlns:pdf="http://ns.adobe.com/pdf/1.3/"',
    '      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"',
    '      xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">',
    '      <dc:title>',
    '        <rdf:Alt>',
    `          <rdf:li xml:lang="x-default">${escapeXmpValue(invoiceNumber)}</rdf:li>`,
    '        </rdf:Alt>',
    '      </dc:title>',
    '      <dc:creator>',
    '        <rdf:Seq>',
    '          <rdf:li>Alltagsengel UG (haftungsbeschränkt)</rdf:li>',
    '        </rdf:Seq>',
    '      </dc:creator>',
    `      <dc:date><rdf:Seq><rdf:li>${now}</rdf:li></rdf:Seq></dc:date>`,
    '      <pdf:Producer>pdf-lib + Alltagsengel Billing</pdf:Producer>',
    '      <pdfaid:part>3</pdfaid:part>',
    '      <pdfaid:conformance>B</pdfaid:conformance>',
    '      <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>',
    '      <fx:DocumentType>INVOICE</fx:DocumentType>',
    '      <fx:Version>1.0</fx:Version>',
    '      <fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>',
    '    </rdf:Description>',
    '  </rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
  ].join('\n')
}

function escapeXmpValue(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function embedZugferdXml(
  pdfBytes: Uint8Array,
  xmlContent: string,
  invoiceNumber: string,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false })
  const context = pdfDoc.context

  const xmlBytes = new TextEncoder().encode(xmlContent)

  // Embed XML as a file stream
  const xmlStream = context.stream(xmlBytes, {
    Type: PDFName.of('EmbeddedFile'),
    Subtype: PDFName.of('text/xml'),
    Length: xmlBytes.length,
  })
  const xmlStreamRef = context.register(xmlStream)

  // File spec dictionary
  const efDict = context.obj({
    F: xmlStreamRef,
    UF: xmlStreamRef,
  })

  const fileSpec = context.obj({
    Type: PDFName.of('Filespec'),
    F: PDFString.of(ZUGFERD_XML_FILENAME),
    UF: PDFHexString.fromText(ZUGFERD_XML_FILENAME),
    Desc: PDFString.of('ZUGFeRD/Factur-X XML Invoice'),
    AFRelationship: PDFName.of('Data'),
    EF: efDict,
  })
  const fileSpecRef = context.register(fileSpec)

  // Add to catalog
  const catalog = pdfDoc.catalog

  // Names -> EmbeddedFiles
  const namesArray = context.obj([
    PDFHexString.fromText(ZUGFERD_XML_FILENAME),
    fileSpecRef,
  ])

  const embeddedFilesDict = context.obj({
    Names: namesArray,
  })

  const namesDict = catalog.lookup(PDFName.of('Names')) as PDFDict | undefined
  if (namesDict instanceof PDFDict) {
    namesDict.set(PDFName.of('EmbeddedFiles'), embeddedFilesDict)
  } else {
    const newNamesDict = context.obj({
      EmbeddedFiles: embeddedFilesDict,
    })
    catalog.set(PDFName.of('Names'), newNamesDict)
  }

  // AF (Associated Files) array
  const afArray = context.obj([fileSpecRef])
  catalog.set(PDFName.of('AF'), afArray)

  // Mark as PDF/A-3
  const now = new Date().toISOString()
  const xmpXml = buildXmpMetadata(invoiceNumber, now)
  const xmpBytes = new TextEncoder().encode(xmpXml)

  const xmpStream = context.stream(xmpBytes, {
    Type: PDFName.of('Metadata'),
    Subtype: PDFName.of('XML'),
    Length: xmpBytes.length,
  })
  const xmpRef = context.register(xmpStream)
  catalog.set(PDFName.of('Metadata'), xmpRef)

  // Set MarkInfo for tagged PDF (required for PDF/A)
  const markInfo = context.obj({ Marked: true })
  catalog.set(PDFName.of('MarkInfo'), markInfo)

  return pdfDoc.save()
}

export async function generateZugferdPdf(
  supabase: SupabaseClient,
  invoiceId: string,
  orgId: string,
  existingPdfBytes: Uint8Array,
): Promise<Uint8Array> {
  const data = await loadInvoiceXRechnungData(supabase, invoiceId, orgId)
  const xmlContent = generateCiiXml(data, 'zugferd')
  return embedZugferdXml(existingPdfBytes, xmlContent, data.invoiceNumber)
}
