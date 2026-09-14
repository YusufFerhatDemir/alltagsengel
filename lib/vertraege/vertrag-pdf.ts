// ═══════════════════════════════════════════════════════════════════
// Vertrags-PDF — aus akten_vertraege wird ein unterschriftsreifes Blatt
// ═══════════════════════════════════════════════════════════════════
//
// Baut auf lib/pdf/briefkopf.ts auf: gleicher Briefbogen wie Rechnung und
// Mahnung, gleiche Schriften. `loadPdfFonts` bettet DejaVuSans ein und
// WIRFT, wenn die Dateien fehlen — ein stiller Helvetica-Rückfall würde
// Umlaute und türkische Zeichen zu Kästchen machen, und das fällt erst
// dem Kunden auf dem fertigen Vertrag auf.
//
// ── SEITENUMBRUCH IST HIER KEINE KOSMETIK ─────────────────────────
// Ein Vertrag ist mehrseitig, und eine Unterschriftszeile, die allein auf
// der letzten Seite steht, ist ein bekannter Formfehler: das Blatt mit der
// Unterschrift traegt dann keinen Vertragstext. `zeichneUnterschriften`
// haelt deshalb zusammen, was zusammengehoert, und beginnt lieber eine
// neue Seite, als den Block zu zerreissen.
// ═══════════════════════════════════════════════════════════════════

import { PDFDocument, rgb } from 'pdf-lib'
import {
  BRIEFKOPF, COAL, GREY, GOLD,
  PAGE_WIDTH, PAGE_HEIGHT, MARGIN, CONTENT_BOTTOM,
  loadPdfFonts, loadBriefkopfLogo, drawBriefkopf, drawBriefkopfFooter,
  wrapText, asDrawable,
  type DrawablePage, type MeasurableFont,
} from '@/lib/pdf/briefkopf'
import {
  vertragsBausteine, vorlageFreigegeben, ENTWURF_VERMERK,
  VORLAGEN_TITEL, type VorlagenTyp, type VertragsDaten,
} from './vorlagen'

const SATZ = 9.5
const ZEILE = 13.5
const TITEL = 15

export interface VertragPdfOptions extends VertragsDaten {
  typ: VorlagenTyp
  /** Freigabestand; Vorgabe ist die Umgebung. Nur für Tests zu setzen. */
  freigegeben?: boolean
}

interface Lage {
  doc: PDFDocument
  page: DrawablePage
  y: number
  regular: MeasurableFont
  bold: MeasurableFont
  logo: Awaited<ReturnType<typeof loadBriefkopfLogo>>
  titelKurz: string
}

const BREITE = PAGE_WIDTH - 2 * MARGIN

/** Neue Seite mit Kompakt-Briefkopf und Fußzeile; liefert die Start-y. */
function neueSeite(l: Lage, fortsetzung: boolean): void {
  const p = l.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  l.page = asDrawable(p)
  l.y = drawBriefkopf({
    page: l.page, fontRegular: l.regular, fontBold: l.bold, logo: l.logo,
    compact: true, compactHint: fortsetzung ? `${l.titelKurz} (Fortsetzung)` : null,
  })
  // payable=false: ein Vertrag ist keine Zahlungsaufforderung. Die Fusszeile
  // blendet dann die Bankverbindung aus und behaelt nur die Pflichtangaben.
  drawBriefkopfFooter({ page: l.page, font: l.regular, payable: false })
}

/** Sorgt dafür, dass `hoehe` noch auf die Seite passt. */
function platzSchaffen(l: Lage, hoehe: number): void {
  if (l.y - hoehe >= CONTENT_BOTTOM) return
  neueSeite(l, true)
}

function schreibe(l: Lage, text: string, opts: { font?: MeasurableFont; size?: number; farbe?: typeof COAL } = {}): void {
  const font = opts.font ?? l.regular
  const size = opts.size ?? SATZ
  for (const zeile of wrapText(font, text, size, BREITE)) {
    platzSchaffen(l, ZEILE)
    l.page.drawText(zeile, { x: MARGIN, y: l.y, size, font, color: opts.farbe ?? COAL })
    l.y -= ZEILE
  }
}

/**
 * Unterschriftsblock — beide Parteien, nebeneinander.
 *
 * Wird als Ganzes umbrochen: eine Unterschriftszeile ohne Vertragstext
 * darüber ist ein Formfehler.
 */
function zeichneUnterschriften(l: Lage, ort: string): void {
  const BLOCK = 110
  if (l.y - BLOCK < CONTENT_BOTTOM) neueSeite(l, true)

  l.y -= 18
  l.page.drawText(`${ort}, den ______________________`, {
    x: MARGIN, y: l.y, size: SATZ, font: l.regular, color: COAL,
  })
  l.y -= 46

  const spalte = BREITE / 2 - 12
  for (const [i, rolle] of ['Auftraggeber', 'Alltagsengel'].entries()) {
    const x = MARGIN + i * (spalte + 24)
    l.page.drawLine({
      start: { x, y: l.y }, end: { x: x + spalte, y: l.y },
      thickness: 0.75, color: rgb(0.4, 0.4, 0.4),
    })
    l.page.drawText(rolle, { x, y: l.y - 12, size: 8, font: l.regular, color: GREY })
  }
  l.y -= 30
}

/**
 * Erzeugt das Vertrags-PDF.
 *
 * Wirft, wenn Vergütung oder Auftraggeber fehlen (siehe
 * `vertragsBausteine`) oder die Schriftdateien nicht lesbar sind.
 */
export async function baueVertragPdf(opts: VertragPdfOptions): Promise<Uint8Array> {
  // Erst prüfen, dann Dokument anlegen: scheitert die Vorlage, soll gar
  // nichts entstanden sein.
  const bausteine = vertragsBausteine(opts.typ, opts)
  const freigegeben = opts.freigegeben ?? vorlageFreigegeben()

  const doc = await PDFDocument.create()
  const { regular, bold } = await loadPdfFonts(doc)
  const logo = await loadBriefkopfLogo(doc)

  const titel = VORLAGEN_TITEL[opts.typ]
  const erste = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const l: Lage = {
    doc, page: asDrawable(erste), y: 0, regular, bold, logo, titelKurz: titel,
  }
  l.y = drawBriefkopf({
    page: l.page, fontRegular: regular, fontBold: bold, logo, compact: false,
  })
  drawBriefkopfFooter({ page: l.page, font: regular, payable: false })

  // ── Entwurfs-Vermerk ────────────────────────────────────────────
  // Ohne juristische Freigabe traegt das Blatt den Hinweis sichtbar oben,
  // nicht als Fussnote. Wer es dann versendet, hat es gelesen.
  if (!freigegeben) {
    l.y -= 8
    for (const zeile of wrapText(bold, ENTWURF_VERMERK, 9, BREITE)) {
      l.page.drawText(zeile, { x: MARGIN, y: l.y, size: 9, font: bold, color: rgb(0.75, 0.2, 0.2) })
      l.y -= 12
    }
    l.y -= 6
  }

  // ── Überschrift ─────────────────────────────────────────────────
  l.y -= 14
  l.page.drawText(titel, { x: MARGIN, y: l.y, size: TITEL, font: bold, color: COAL })
  l.y -= 10
  l.page.drawLine({
    start: { x: MARGIN, y: l.y }, end: { x: PAGE_WIDTH - MARGIN, y: l.y },
    thickness: 1, color: GOLD,
  })
  l.y -= 20

  if (opts.vertragsnummer) {
    schreibe(l, `Vertragsnummer: ${opts.vertragsnummer}`, { font: regular, farbe: GREY })
    l.y -= 4
  }

  // ── Parteien ────────────────────────────────────────────────────
  schreibe(l, 'zwischen', { farbe: GREY })
  l.y -= 2
  schreibe(l, opts.auftraggeber, { font: bold })
  if (opts.auftraggeberAnschrift) {
    for (const zeile of String(opts.auftraggeberAnschrift).split('\n')) {
      if (zeile.trim()) schreibe(l, zeile.trim())
    }
  }
  schreibe(l, '— nachfolgend „Auftraggeber" —', { farbe: GREY })
  l.y -= 8
  schreibe(l, 'und', { farbe: GREY })
  l.y -= 2
  schreibe(l, BRIEFKOPF.firma, { font: bold })
  schreibe(l, BRIEFKOPF.strasse)
  schreibe(l, BRIEFKOPF.ort)
  schreibe(l, '— nachfolgend „Alltagsengel" —', { farbe: GREY })
  l.y -= 14

  // ── Paragraphen ─────────────────────────────────────────────────
  for (const b of bausteine) {
    platzSchaffen(l, ZEILE * 3)
    l.y -= 6
    schreibe(l, b.titel, { font: bold, size: 10.5 })
    l.y -= 3
    for (const absatz of b.absaetze) {
      schreibe(l, absatz)
      l.y -= 5
    }
  }

  // ── Vergütungsherkunft ──────────────────────────────────────────
  // Damit spaeter nachvollziehbar ist, WOHER der Satz im Vertrag kam.
  l.y -= 6
  schreibe(l, `Grundlage der Vergütung: ${opts.verguetungsQuelle}`, { size: 7.5, farbe: GREY })

  zeichneUnterschriften(l, BRIEFKOPF.ort.replace(/^\d+\s*/, ''))

  return doc.save()
}
