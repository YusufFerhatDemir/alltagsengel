/**
 * Briefkopf + Pflichtangaben-Fußzeile des Rechnungs-PDFs.
 *
 * Zwei Ebenen:
 *  1. Layout-Ebene — eine Attrappen-Seite protokolliert jeden Zeichenbefehl.
 *     Damit lässt sich prüfen, WAS im Briefkopf steht und WO es steht, ohne
 *     ein PDF parsen zu müssen.
 *  2. Integrations-Ebene — echtes pdf-lib-Dokument mit den echten Dateien aus
 *     public/ (DejaVuSans + Engel-Logo). Fängt fehlende/umbenannte Assets.
 */
import { describe, it, expect } from 'vitest'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { PDFDocument } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

import {
  BRIEFKOPF,
  GOLD,
  FOOTER_TOP,
  CONTENT_BOTTOM,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  MARGIN,
  drawBriefkopf,
  drawBriefkopfFooter,
  loadBriefkopfLogo,
  loadPdfFonts,
  type DrawablePage,
  type MeasurableFont,
} from '@/lib/pdf/briefkopf'

// ── Attrappen ──────────────────────────────────────────────────────

interface TextCall { text: string; x: number; y: number; size: number }
interface LineCall { start: { x: number; y: number }; end: { x: number; y: number }; thickness: number; color: unknown }
interface ImageCall { x: number; y: number; width: number; height: number }

class FakePage implements DrawablePage {
  texts: TextCall[] = []
  lines: LineCall[] = []
  images: ImageCall[] = []

  drawText(text: string, opts: Record<string, any>) {
    this.texts.push({ text, x: opts.x, y: opts.y, size: opts.size })
  }
  drawLine(opts: Record<string, any>) {
    this.lines.push({ start: opts.start, end: opts.end, thickness: opts.thickness, color: opts.color })
  }
  drawImage(_image: unknown, opts: Record<string, any>) {
    this.images.push({ x: opts.x, y: opts.y, width: opts.width, height: opts.height })
  }

  /** Alle gezeichneten Texte als ein String — für „kommt X überhaupt vor". */
  get alleTexte(): string {
    return this.texts.map(t => t.text).join('\n')
  }
}

// Grobe, aber monotone Breitenschätzung — reicht für Zentrierung/Rechtsbündigkeit.
const fakeFont: MeasurableFont = {
  widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.52,
}

const fakeLogo = { width: 160, height: 138 } as any

// ── 1. Briefkopf-Layout ────────────────────────────────────────────

describe('Briefkopf (voll)', () => {
  function zeichne(ik: string | null = '460629986') {
    const page = new FakePage()
    const y = drawBriefkopf({
      page, fontRegular: fakeFont, fontBold: fakeFont, logo: fakeLogo, ik,
    })
    return { page, y }
  }

  it('zeichnet Logo links, Firmierung mittig, Adresse rechts', () => {
    const { page } = zeichne()

    // Logo: linke Spalte, am oberen Rand, Seitenverhältnis der Quelldatei.
    expect(page.images).toHaveLength(1)
    const logo = page.images[0]
    expect(logo.x).toBe(MARGIN)
    expect(logo.y + logo.height).toBeCloseTo(PAGE_HEIGHT - MARGIN, 5)
    expect(logo.height / logo.width).toBeCloseTo(138 / 160, 5)

    // Mitte: Firmierung, zentriert um die Seitenmitte.
    const firma = page.texts.find(t => t.text === BRIEFKOPF.firma)
    expect(firma).toBeDefined()
    const firmaMitte = firma!.x + fakeFont.widthOfTextAtSize(firma!.text, firma!.size) / 2
    expect(firmaMitte).toBeCloseTo(PAGE_WIDTH / 2, 1)

    // Rechts: Adresse, rechtsbündig am Satzspiegel.
    for (const zeile of [BRIEFKOPF.strasse, BRIEFKOPF.ort, BRIEFKOPF.email]) {
      const t = page.texts.find(x => x.text === zeile)
      expect(t, `Adresszeile fehlt: ${zeile}`).toBeDefined()
      const rechterRand = t!.x + fakeFont.widthOfTextAtSize(t!.text, t!.size)
      expect(rechterRand).toBeCloseTo(PAGE_WIDTH - MARGIN, 1)
    }
  })

  it('enthält die vollständige Adresse aus dem Impressum', () => {
    const { page } = zeichne()
    expect(page.alleTexte).toContain('Neue Mainzer Straße 66-68')
    expect(page.alleTexte).toContain('60311 Frankfurt am Main')
    expect(page.alleTexte).toContain('Alltagsengel UG (haftungsbeschränkt)')
  })

  it('zeichnet die goldene Trennlinie unter dem Kopf', () => {
    const { page, y } = zeichne()
    expect(page.lines).toHaveLength(1)
    const linie = page.lines[0]
    expect(linie.color).toEqual(GOLD)
    expect(linie.thickness).toBeGreaterThanOrEqual(1)
    expect(linie.start.x).toBe(MARGIN)
    expect(linie.end.x).toBe(PAGE_WIDTH - MARGIN)
    // Inhalt beginnt UNTER der Linie.
    expect(y).toBeLessThan(linie.start.y)
  })

  it('gold entspricht dem Brand-Ton #C9963C', () => {
    expect(GOLD.red).toBeCloseTo(201 / 255, 5)
    expect(GOLD.green).toBeCloseTo(150 / 255, 5)
    expect(GOLD.blue).toBeCloseTo(60 / 255, 5)
  })

  it('zeigt die IK-Nummer, wenn vorhanden — und lässt sie sonst weg', () => {
    expect(zeichne('460629986').page.alleTexte).toContain('IK-Nummer: 460629986')
    expect(zeichne(null).page.alleTexte).not.toContain('IK-Nummer')
  })

  it('nennt KEINEN persönlichen Namen im Absenderkopf', () => {
    const { page } = zeichne()
    expect(page.alleTexte).not.toContain(BRIEFKOPF.geschaeftsfuehrer)
    expect(page.alleTexte).not.toContain('Yusuf')
  })

  it('zeichnet auch ohne Logo (Datei nicht lesbar) einen gültigen Kopf', () => {
    const page = new FakePage()
    const y = drawBriefkopf({ page, fontRegular: fakeFont, fontBold: fakeFont, logo: null, ik: '460629986' })
    expect(page.images).toHaveLength(0)
    expect(page.alleTexte).toContain(BRIEFKOPF.firma)
    expect(page.lines[0].color).toEqual(GOLD)
    expect(y).toBeGreaterThan(CONTENT_BOTTOM)
  })
})

describe('Briefkopf (kompakt, Folgeseiten)', () => {
  it('bleibt flacher als der volle Kopf und trägt den Hinweistext', () => {
    const voll = new FakePage()
    const yVoll = drawBriefkopf({ page: voll, fontRegular: fakeFont, fontBold: fakeFont, logo: fakeLogo, ik: '460629986' })

    const kompakt = new FakePage()
    const yKompakt = drawBriefkopf({
      page: kompakt, fontRegular: fakeFont, fontBold: fakeFont, logo: fakeLogo, ik: '460629986',
      compact: true, compactHint: 'Rechnung RE-2026-0042 (Fortsetzung)',
    })

    expect(yKompakt).toBeGreaterThan(yVoll) // mehr Platz für Inhalt
    expect(kompakt.alleTexte).toContain('Rechnung RE-2026-0042 (Fortsetzung)')
    expect(kompakt.alleTexte).toContain(BRIEFKOPF.kurz)
    expect(kompakt.lines[0].color).toEqual(GOLD)
    expect(kompakt.images).toHaveLength(1)
  })
})

// ── 2. Fußzeile / Pflichtangaben ───────────────────────────────────

describe('Fußzeile — Pflichtangaben', () => {
  function fuss(extra: Record<string, unknown> = {}) {
    const page = new FakePage()
    drawBriefkopfFooter({
      page, font: fakeFont, ik: '460629986',
      iban: 'DE00 0000 0000 0000 0000 00', bic: 'HELADEF1822', bank: 'Frankfurter Sparkasse',
      ...extra,
    })
    return page
  }

  it('enthält alle geforderten Pflichtangaben', () => {
    const t = fuss().alleTexte
    expect(t).toContain('Alltagsengel UG (haftungsbeschränkt)')
    expect(t).toContain('Neue Mainzer Straße 66-68')
    expect(t).toContain('60311 Frankfurt am Main')
    expect(t).toContain('IK-Nummer: 460629986')
    expect(t).toContain('E-Mail: info@alltagsengel.care')
    expect(t).toContain('Geschäftsführer: Yusuf Ferhat Demir')
    expect(t).toContain('Amtsgericht Frankfurt am Main')
    expect(t).toContain('HRB 140351')
  })

  it('nimmt die Steuernummer nur auf, wenn sie hinterlegt ist', () => {
    expect(fuss().alleTexte).not.toContain('Steuernummer')
    expect(fuss({ steuernummer: '013 456 78901' }).alleTexte).toContain('Steuernummer: 013 456 78901')
  })

  it('unterscheidet zahlbare Belege von Gutschriften/Storno', () => {
    expect(fuss({ payable: true }).alleTexte).toContain('Zahlbar innerhalb von 30 Tagen')
    const gutschrift = fuss({ payable: false }).alleTexte
    expect(gutschrift).toContain('keine Zahlungsaufforderung')
    expect(gutschrift).not.toContain('Zahlbar innerhalb')
  })

  it('bleibt vollständig unter der Inhaltsgrenze und über dem Blattrand', () => {
    const page = fuss()
    for (const t of page.texts) {
      expect(t.y, `Fußzeile ragt in den Inhalt: ${t.text}`).toBeLessThan(FOOTER_TOP)
      expect(t.y, `Fußzeile läuft aus dem Blatt: ${t.text}`).toBeGreaterThan(20)
    }
    const trenner = page.lines[0]
    expect(trenner.color).toEqual(GOLD)
    expect(trenner.start.y).toBe(FOOTER_TOP)
    expect(CONTENT_BOTTOM).toBeGreaterThan(FOOTER_TOP)
  })

  it('schrumpft überlange Zeilen, statt über den Satzspiegel zu laufen', () => {
    const page = fuss({
      bank: 'Sehr lange Bankbezeichnung eines Kreditinstituts mit Zusatz',
      iban: 'DE00 0000 0000 0000 0000 00',
      bic: 'HELADEF1822XXX',
      steuernummer: '013 456 78901',
    })
    for (const t of page.texts) {
      const breite = fakeFont.widthOfTextAtSize(t.text, t.size)
      expect(breite, `zu breit: ${t.text}`).toBeLessThanOrEqual(PAGE_WIDTH - 2 * MARGIN + 0.5)
      expect(t.x).toBeGreaterThanOrEqual(MARGIN - 0.5)
    }
  })
})

// ── 3. Echte Assets + echtes PDF ───────────────────────────────────

describe('Briefkopf-Assets (echte Dateien)', () => {
  it('DejaVuSans liegt im Repo und deckt deutsche + türkische Zeichen ab', async () => {
    const pdfDoc = await PDFDocument.create()
    pdfDoc.registerFontkit(fontkit)
    const { regular, bold } = await loadPdfFonts(pdfDoc)

    // Kein Helvetica-Fallback — der würde ü/ö/ä/ş/ç/ğ/ı als ■ setzen.
    expect(regular.name).toMatch(/DejaVu/i)
    expect(bold.name).toMatch(/DejaVu/i)
    expect(() => regular.widthOfTextAtSize('Şükrü Çağrı Güngör — Grüße, ıI', 10)).not.toThrow()
  })

  it('das vorhandene Engel-Logo lässt sich als PNG einbetten', async () => {
    const pdfDoc = await PDFDocument.create()
    const logo = await loadBriefkopfLogo(pdfDoc)
    expect(logo).not.toBeNull()
    expect(logo!.width).toBeGreaterThan(0)
    expect(logo!.height).toBeGreaterThan(0)

    // Es muss GENAU die vorhandene Datei sein — kein nachgebautes SVG.
    const datei = await readFile(join(process.cwd(), 'public', 'icon-transparent-trimmed.png'))
    expect(datei.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(logo!.width).toBe(160)
    expect(logo!.height).toBe(138)
  })

  it('erzeugt ein gültiges PDF mit Briefkopf und Fußzeile', async () => {
    const pdfDoc = await PDFDocument.create()
    pdfDoc.registerFontkit(fontkit)
    const { regular, bold } = await loadPdfFonts(pdfDoc)
    const logo = await loadBriefkopfLogo(pdfDoc)
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])

    const y = drawBriefkopf({
      page: page as any, fontRegular: regular, fontBold: bold, logo, ik: '460629986',
    })
    expect(y).toBeLessThan(PAGE_HEIGHT - MARGIN)
    expect(y).toBeGreaterThan(CONTENT_BOTTOM)

    page.drawText('Rechnung — Şükrü Çağrı, Grüße & Umlaute äöüß', {
      x: MARGIN, y, size: 11, font: regular,
    })
    drawBriefkopfFooter({ page: page as any, font: regular, ik: '460629986' })

    const bytes = await pdfDoc.save()
    expect(bytes.byteLength).toBeGreaterThan(1000)
    expect(Buffer.from(bytes.subarray(0, 5)).toString('ascii')).toBe('%PDF-')
  })
})

// ── 4. Layout bei unterschiedlichen Rechnungslängen ────────────────

describe('Seitenumbruch-Grenze', () => {
  /**
   * Bildet die Umbruchlogik der Route nach: solange Platz da ist, Zeilen
   * setzen — sonst Fußzeile, neue Seite, kompakter Kopf. Geprüft wird, dass
   * bei JEDER Positionsanzahl keine Zeile in die Fußzeile rutscht.
   */
  function simuliere(anzahlPositionen: number) {
    const seiten: FakePage[] = []
    let page = new FakePage()
    seiten.push(page)
    let y = drawBriefkopf({ page, fontRegular: fakeFont, fontBold: fakeFont, logo: fakeLogo, ik: '460629986' })
    y -= 120 // Stammdatenblock der Rechnung

    for (let i = 0; i < anzahlPositionen; i++) {
      if (y - 16 < CONTENT_BOTTOM) {
        drawBriefkopfFooter({ page, font: fakeFont, ik: '460629986' })
        page = new FakePage()
        seiten.push(page)
        y = drawBriefkopf({
          page, fontRegular: fakeFont, fontBold: fakeFont, logo: fakeLogo, ik: '460629986',
          compact: true, compactHint: 'Rechnung RE-2026-0042 (Fortsetzung)',
        })
      }
      page.drawText(`Position ${i + 1}`, { x: MARGIN, y, size: 9 })
      y -= 16
    }
    drawBriefkopfFooter({ page, font: fakeFont, ik: '460629986' })
    return seiten
  }

  for (const n of [0, 1, 12, 40, 200]) {
    it(`hält den Satzspiegel bei ${n} Positionen ein`, () => {
      const seiten = simuliere(n)
      let positionen = 0
      for (const seite of seiten) {
        const inhalt = seite.texts.filter(t => t.text.startsWith('Position '))
        positionen += inhalt.length
        for (const t of inhalt) {
          expect(t.y, `Position läuft in die Fußzeile: ${t.text}`).toBeGreaterThanOrEqual(FOOTER_TOP)
          expect(t.y).toBeLessThan(PAGE_HEIGHT - MARGIN)
        }
        // Jede Seite trägt Kopf (goldene Linie) und Fußzeile (zweite Linie).
        expect(seite.lines.length).toBe(2)
        expect(seite.alleTexte).toContain('Geschäftsführer: Yusuf Ferhat Demir')
      }
      expect(positionen).toBe(n)
    })
  }
})
