/**
 * ZUGFeRD/Factur-X — was der Generator wirklich produziert.
 *
 * BEFUND I-7 der Completion-Matrix: „3 Testfälle für einen
 * PDF/A-3-Generator, und keine Konformitätsprüfung (weder veraPDF noch ein
 * EN-16931-Validator). Eine Rechnung, die der Empfänger nicht einlesen
 * kann, fällt erst beim Empfänger auf."
 *
 * Die drei Fälle prüften: „ist das Ergebnis ein PDF", „steht `pdfaid:part`
 * irgendwo drin" und „kommt die Zeichenkette `factur-x.xml` vor". Alle drei
 * bleiben grün, wenn die Zuordnung zwischen XML und Dokument falsch
 * ausgezeichnet ist, wenn das XMP-Erweiterungsschema fehlt oder wenn die
 * Datei eine Auszeichnung behauptet, die sie nicht hat.
 *
 * Diese Suite lässt `pruefeZugferdPdf` über den geladenen Objektgraphen
 * laufen und prüft jeden Befund einzeln — in beide Richtungen: dass er bei
 * korrekter Ausgabe schweigt UND dass er bei kaputter Ausgabe anschlägt.
 * Ein Prüfer, der nie anschlägt, ist kein Prüfer.
 *
 * ── DREI BEFUNDE, DIE DABEI HERAUSKAMEN, JETZT BEHOBEN ───────────────
 *  1. `/AFRelationship` war `Data`. Das ist der Wert für MINIMUM und
 *     BASIC WL; die XMP nennt aber `EN 16931`, und ab BASIC verlangt
 *     ZUGFeRD `Alternative`.
 *  2. Die vier `fx:`-Angaben standen ohne `pdfaExtension:schemas` da — ein
 *     PDF/A-Prüfer wertet jede davon als undefinierte Eigenschaft.
 *  3. `/MarkInfo /Marked true` ohne `/StructTreeRoot`, mit dem Kommentar
 *     „required for PDF/A". Für Stufe B ist es nicht verlangt, und ohne
 *     Strukturbaum ist es eine Behauptung, die nicht stimmt.
 *
 * ── EIN BEFUND BLEIBT OFFEN UND WIRD HIER FESTGEHALTEN ──────────────
 * `OUTPUTINTENT_FEHLT`. Eine Ausgabebedingung braucht ein EINGEBETTETES
 * ICC-Profil; im Baum liegt keines, und eines zu beschaffen ist eine
 * Entscheidung über eine Binärdatei und deren Lizenz, keine
 * Programmieraufgabe. Der Test hält den Zustand ausdrücklich fest, statt
 * ihn zu übergehen: fällt der Befund weg, ist die Lücke geschlossen und
 * dieser Test gehört angepasst.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { embedZugferdXml } from '@/lib/billing/xrechnung/zugferd-pdf'
import {
  pruefeZugferdPdf, istZugferdKonform,
  ERWARTETER_XML_NAME, ZULAESSIGE_AF_BEZIEHUNGEN, NICHT_GEPRUEFT,
} from '@/lib/billing/xrechnung/zugferd-pruefung'

const CII = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100">
  <rsm:ExchangedDocument><ram:ID xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100">RE-2026-0001</ram:ID></rsm:ExchangedDocument>
</rsm:CrossIndustryInvoice>`

const SCHRIFT = path.join(process.cwd(), 'public', 'fonts', 'DejaVuSans.ttf')

/**
 * Ein Grundgerüst wie der echte Rechnungsweg: DejaVuSans EINGEBETTET.
 * `lib/pdf/rechnung-paket.ts` verwendet dieselbe Datei und ausdrücklich
 * keinen Helvetica-Rückfall — ein Test gegen Helvetica würde hier einen
 * Befund erzeugen, den die Produktion gar nicht hat.
 */
async function rechnungsPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const schrift = await doc.embedFont(readFileSync(SCHRIFT))
  const seite = doc.addPage([595, 842])
  seite.drawText('Rechnung RE-2026-0001', { font: schrift, size: 12, x: 50, y: 790 })
  return doc.save()
}

/** Dasselbe mit einer NICHT eingebetteten Standardschrift. */
async function pdfMitHelvetica(): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const schrift = await doc.embedFont(StandardFonts.Helvetica)
  const seite = doc.addPage([595, 842])
  seite.drawText('Rechnung', { font: schrift, size: 12, x: 50, y: 790 })
  return doc.save()
}

let zugferd: Uint8Array
let codes: string[]

beforeAll(async () => {
  zugferd = await embedZugferdXml(new Uint8Array(await rechnungsPdf()), CII, 'RE-2026-0001')
  codes = (await pruefeZugferdPdf(zugferd)).map(b => b.code)
})

describe('Was der Generator richtig macht', () => {
  it('erzeugt ein ladbares PDF', () => {
    expect(codes).not.toContain('NICHT_LESBAR')
  })

  it('kennzeichnet die Datei als PDF/A-3', () => {
    expect(codes).not.toContain('XMP_FEHLT')
    expect(codes).not.toContain('PDFA_TEIL')
    expect(codes).not.toContain('PDFA_STUFE')
  })

  it('bettet den Rechnungsdatensatz als zugeordnete UND als gewöhnliche Datei ein', () => {
    // Beides ist nötig: /AF für Programme, die zugeordnete Dateien kennen,
    // /Names/EmbeddedFiles für die, die es nicht tun.
    expect(codes).not.toContain('AF_FEHLT')
    expect(codes).not.toContain('EMBEDDEDFILES_FEHLT')
  })

  it('zeichnet die Zuordnung als Alternative aus — nicht mehr als Data', () => {
    expect(codes).not.toContain('AF_BEZIEHUNG')
    expect(codes).not.toContain('AF_BEZIEHUNG_FEHLT')
  })

  it('nennt in der XMP denselben Dateinamen, unter dem eingebettet wurde', () => {
    expect(codes).not.toContain('XMP_DATEINAME')
    expect(codes).not.toContain('XMP_DATEINAME_FEHLT')
  })

  it('beschreibt die fx:-Eigenschaften in einem Erweiterungsschema', () => {
    expect(codes).not.toContain('XMP_ERWEITERUNGSSCHEMA')
  })

  it('behauptet keine Auszeichnung mehr, die es nicht gibt', () => {
    expect(codes).not.toContain('MARKED_OHNE_STRUKTUR')
  })

  it('bettet den CII-Datensatz lesbar ein', () => {
    expect(codes).not.toContain('XML_LEER')
    expect(codes).not.toContain('XML_KEIN_CII')
  })

  it('bettet die verwendete Schrift ein — wie der echte Rechnungsweg', () => {
    expect(codes).not.toContain('SCHRIFT_NICHT_EINGEBETTET')
  })

  it('verschlüsselt nicht', () => {
    expect(codes).not.toContain('VERSCHLUESSELT')
  })
})

describe('Was offen bleibt — ausdrücklich festgehalten', () => {
  it('hat keine Ausgabebedingung mit eingebettetem ICC-Profil', () => {
    // Kein Versehen: im Baum liegt kein ICC-Profil, und eines zu beschaffen
    // ist eine Entscheidung über eine Binärdatei und deren Lizenz.
    expect(codes).toContain('OUTPUTINTENT_FEHLT')
  })

  it('ist damit noch NICHT konform — und sagt das auch', async () => {
    // Die Kurzform darf nicht „ja" sagen, solange ein Fehler offen ist.
    await expect(istZugferdKonform(zugferd)).resolves.toBe(false)
  })

  it('hat genau diesen einen offenen Fehler und keinen weiteren', async () => {
    // Der eigentliche Wert dieses Falls: ein NEUER Fehler fällt sofort auf,
    // statt in der bekannten Lücke unterzugehen.
    const fehler = (await pruefeZugferdPdf(zugferd)).filter(b => b.art === 'fehler')
    expect(fehler.map(f => f.code)).toEqual(['OUTPUTINTENT_FEHLT'])
  })

  it('führt mit, was die Prüfung NICHT beantwortet', () => {
    // Eine Prüfliste ohne ihre Grenzen wird für vollständig gehalten.
    expect(NICHT_GEPRUEFT.length).toBeGreaterThan(0)
    expect(NICHT_GEPRUEFT.join(' ')).toMatch(/EN-16931-Schema/)
  })
})

describe('Der Prüfer schlägt auch wirklich an', () => {
  it('erkennt eine nicht eingebettete Schrift', async () => {
    const roh = await embedZugferdXml(new Uint8Array(await pdfMitHelvetica()), CII, 'RE-1')
    const b = (await pruefeZugferdPdf(roh)).map(x => x.code)
    expect(b).toContain('SCHRIFT_NICHT_EINGEBETTET')
  })

  it('erkennt eine falsche Beziehung zwischen XML und Dokument', async () => {
    // Nachgestellt: die Zuordnung wieder auf `Data` setzen — der Zustand
    // vor dem 29.08.2026.
    const doc = await PDFDocument.load(zugferd, { updateMetadata: false })
    const af = doc.catalog.lookup(PDFName.of('AF')) as any
    af.lookup(0).set(PDFName.of('AFRelationship'), PDFName.of('Data'))
    const b = (await pruefeZugferdPdf(await doc.save())).map(x => x.code)
    expect(b).toContain('AF_BEZIEHUNG')
  })

  it('erkennt eine fehlende Zuordnung ganz', async () => {
    const doc = await PDFDocument.load(zugferd, { updateMetadata: false })
    doc.catalog.delete(PDFName.of('AF'))
    const b = (await pruefeZugferdPdf(await doc.save())).map(x => x.code)
    expect(b).toContain('AF_FEHLT')
  })

  it('erkennt eine fehlende Einbettung nach /Names', async () => {
    const doc = await PDFDocument.load(zugferd, { updateMetadata: false })
    doc.catalog.delete(PDFName.of('Names'))
    const b = (await pruefeZugferdPdf(await doc.save())).map(x => x.code)
    expect(b).toContain('EMBEDDEDFILES_FEHLT')
  })

  it('erkennt eine fehlende XMP-Kennzeichnung', async () => {
    const doc = await PDFDocument.load(zugferd, { updateMetadata: false })
    doc.catalog.delete(PDFName.of('Metadata'))
    const b = (await pruefeZugferdPdf(await doc.save())).map(x => x.code)
    expect(b).toContain('XMP_FEHLT')
  })

  it('erkennt etwas, das gar kein PDF ist', async () => {
    const b = (await pruefeZugferdPdf(new TextEncoder().encode('kein PDF'))).map(x => x.code)
    expect(b).toContain('NICHT_LESBAR')
  })
})

describe('Die Zusicherungen als Konstanten', () => {
  it('erwartet den Dateinamen von ZUGFeRD 2.1 / Factur-X', () => {
    // ZUGFeRD 2.0 hiess `zugferd-invoice.xml` — der alte Name wuerde bei
    // heutigen Empfaengern nicht gefunden.
    expect(ERWARTETER_XML_NAME).toBe('factur-x.xml')
  })

  it('lässt Alternative und Source zu, aber nicht Data', () => {
    expect(ZULAESSIGE_AF_BEZIEHUNGEN).toContain('Alternative')
    expect(ZULAESSIGE_AF_BEZIEHUNGEN).toContain('Source')
    expect(ZULAESSIGE_AF_BEZIEHUNGEN).not.toContain('Data')
  })
})
