import { PDFDocument, PDFName, PDFString, PDFDict, PDFHexString } from 'pdf-lib'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadInvoiceXRechnungData } from './invoice-to-xrechnung'
import { generateCiiXml } from './cii-generator'

const ZUGFERD_XML_FILENAME = 'factur-x.xml'

/**
 * Namensraum des Factur-X-XMP-Schemas. Steht als Konstante da, weil er an
 * ZWEI Stellen gebraucht wird — in der Namensraum-Deklaration und in der
 * Beschreibung des Erweiterungsschemas. Zwei getippte Fassungen desselben
 * URI waeren ein stiller Fehler: der Pruefer haelt die Eigenschaften dann
 * fuer undefiniert, obwohl ein Schema danebensteht.
 */
const FX_NAMENSRAUM = 'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#'

/** Die fx:-Eigenschaften, die die XMP setzt — und nur diese. */
const FX_EIGENSCHAFTEN = [
  { name: 'DocumentFileName', beschreibung: 'Dateiname des eingebetteten Rechnungsdatensatzes' },
  { name: 'DocumentType', beschreibung: 'Art des Dokuments (INVOICE)' },
  { name: 'Version', beschreibung: 'Version des Factur-X-Schemas' },
  { name: 'ConformanceLevel', beschreibung: 'Profil des Rechnungsdatensatzes' },
] as const

/** Profil, das der eingebettete Datensatz erfuellt. */
const FX_PROFIL = 'EN 16931'

/**
 * Beziehung zwischen eingebettetem Datensatz und Dokument.
 *
 * BEFUND 29.08.2026: hier stand `Data`. Das ist der Wert fuer die Profile
 * MINIMUM und BASIC WL — die XMP dieses Generators nennt aber ausdruecklich
 * `EN 16931`, und ab dem Profil BASIC verlangt ZUGFeRD `Alternative`: PDF
 * und XML sind zwei Darstellungen DESSELBEN Belegs, nicht Dokument und
 * Beiwerk. Einzige Ausnahme waere `Source` — Empfaenger ausserhalb
 * Deutschlands UND das PDF aus den XML-Daten erzeugt; beides trifft hier
 * nicht zu.
 * Quelle: PDFlib, „The ZUGFeRD and Factur-X Formats for electronic
 * Invoices" (abgerufen 29.08.2026).
 */
const AF_BEZIEHUNG = 'Alternative'

/**
 * Beschreibung des fx:-Schemas fuer den PDF/A-Erweiterungsblock.
 *
 * BEFUND 29.08.2026: die vier fx:-Angaben standen ohne jede
 * Schemabeschreibung da. Benutzereigene XMP-Eigenschaften muessen in einem
 * `pdfaExtension:schemas`-Block beschrieben sein; fehlt er, meldet ein
 * PDF/A-Pruefer JEDE davon als undefinierte Eigenschaft — die Datei traegt
 * dann zwar die ZUGFeRD-Angaben, faellt aber genau an ihnen durch.
 */
function buildErweiterungsschema(): string[] {
  const eigenschaften = FX_EIGENSCHAFTEN.flatMap(e => [
    '                <rdf:li rdf:parseType="Resource">',
    `                  <pdfaProperty:name>${e.name}</pdfaProperty:name>`,
    '                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>',
    '                  <pdfaProperty:category>external</pdfaProperty:category>',
    `                  <pdfaProperty:description>${escapeXmpValue(e.beschreibung)}</pdfaProperty:description>`,
    '                </rdf:li>',
  ])
  return [
    '    <rdf:Description rdf:about=""',
    '      xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"',
    '      xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"',
    '      xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">',
    '      <pdfaExtension:schemas>',
    '        <rdf:Bag>',
    '          <rdf:li rdf:parseType="Resource">',
    '            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>',
    `            <pdfaSchema:namespaceURI>${FX_NAMENSRAUM}</pdfaSchema:namespaceURI>`,
    '            <pdfaSchema:prefix>fx</pdfaSchema:prefix>',
    '            <pdfaSchema:property>',
    '              <rdf:Seq>',
    ...eigenschaften,
    '              </rdf:Seq>',
    '            </pdfaSchema:property>',
    '          </rdf:li>',
    '        </rdf:Bag>',
    '      </pdfaExtension:schemas>',
    '    </rdf:Description>',
  ]
}

function buildXmpMetadata(invoiceNumber: string, now: string): string {
  return [
    '<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '    <rdf:Description rdf:about=""',
    '      xmlns:dc="http://purl.org/dc/elements/1.1/"',
    '      xmlns:pdf="http://ns.adobe.com/pdf/1.3/"',
    '      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"',
    `      xmlns:fx="${FX_NAMENSRAUM}">`,
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
    // Der Dateiname kommt aus derselben Konstante, die auch die Einbettung
    // benennt: eine zweite getippte Fassung wuerde die Empfaengersoftware
    // unter einem Namen suchen lassen, den es im PDF nicht gibt.
    `      <fx:DocumentFileName>${ZUGFERD_XML_FILENAME}</fx:DocumentFileName>`,
    '      <fx:DocumentType>INVOICE</fx:DocumentType>',
    '      <fx:Version>1.0</fx:Version>',
    `      <fx:ConformanceLevel>${FX_PROFIL}</fx:ConformanceLevel>`,
    '    </rdf:Description>',
    ...buildErweiterungsschema(),
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
    AFRelationship: PDFName.of(AF_BEZIEHUNG),
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

  // KEIN MarkInfo mehr.
  //
  // Hier stand `context.obj({ Marked: true })` mit dem Kommentar „required
  // for PDF/A". Das ist fuer Stufe B nicht richtig — die Auszeichnung
  // verlangt erst Stufe A. Und ein `/Marked true` ohne `/StructTreeRoot`
  // ist keine harmlose Zugabe, sondern eine Behauptung ueber das Dokument,
  // die nicht stimmt: es gibt keinen Strukturbaum, auf den sie sich
  // beziehen koennte. Die XMP oben nennt Stufe B; damit ist die Angabe
  // ueberfluessig und falsch zugleich.

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
