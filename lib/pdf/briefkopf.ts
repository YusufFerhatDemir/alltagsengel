/**
 * Geschäftsbrief-Briefkopf für pdf-lib-Dokumente (Rechnungen, Belegpakete).
 *
 * Aufbau wie der Standard-Briefbogen von Alltagsengel:
 *
 *   ┌──────────────┬───────────────────────────┬──────────────────┐
 *   │  Engel-Logo  │  Alltagsengel UG (haftungs│  Neue Mainzer …  │
 *   │  (Bilddatei) │  beschränkt) + IK-Nummer  │  60311 Frankfurt │
 *   └──────────────┴───────────────────────────┴──────────────────┘
 *   ════════════════ goldene Trennlinie (#C9963C) ═════════════════
 *
 * Fußzeile: Pflichtangaben nach § 35a GmbHG i. V. m. § 5a Abs. 1 GmbHG
 * (Firma, Rechtsform, Sitz, Registergericht, Registernummer, Geschäfts-
 * führer) plus IK-Nummer und Kontakt.
 *
 * WICHTIG — zwei Dinge, die hier bewusst so sind:
 *  1. Das Logo wird als vorhandene PNG-Datei eingebettet
 *     (`public/icon-transparent-trimmed.png`). Es wird NIE als Vektor
 *     nachgebaut — die goldenen Brand-Icons sind unveränderlich.
 *  2. Schriften sind ausschließlich DejaVuSans/-Bold. Helvetica ist
 *     WinAnsi-kodiert und stellt türkische Zeichen (ş, ç, ğ, ı) als ■ dar.
 *     `loadPdfFonts()` wirft daher lieber, als still auf Helvetica
 *     zurückzufallen.
 *
 * Der Geschäftsführername steht ausschließlich in dieser Fußzeile
 * (Pflichtangabe) — niemals im Absender, in der Anrede oder in einer
 * Unterschrift. Kundengerichtet zeichnet immer „Alltagsengel".
 */
import { readFile } from 'fs/promises'
import { join } from 'path'
import { rgb } from 'pdf-lib'
import type { PDFDocument, PDFFont, PDFImage, PDFPage } from 'pdf-lib'
import { logger } from '@/lib/logger'
const log = logger.child('briefkopf')

// ── Firmen-Stammdaten (Quelle: app/impressum/page.tsx) ─────────────
export const BRIEFKOPF = {
  firma: 'Alltagsengel UG (haftungsbeschränkt)',
  kurz: 'Alltagsengel',
  zusatz: 'Alltagsbegleitung & Entlastung nach § 45a SGB XI',
  strasse: 'Neue Mainzer Straße 66-68',
  ort: '60311 Frankfurt am Main',
  email: 'info@alltagsengel.care',
  registergericht: 'Amtsgericht Frankfurt am Main',
  registernummer: 'HRB 140351',
  /** Pflichtangabe § 35a GmbHG — NUR in der Fußzeile, nie im Absender. */
  geschaeftsfuehrer: 'Yusuf Ferhat Demir',
} as const

// ── Farben (Brand-Gold #C9963C, identisch zum Web-Theme) ───────────
export const GOLD = rgb(201 / 255, 150 / 255, 60 / 255)
export const COAL = rgb(0.15, 0.11, 0.07)
export const GREY = rgb(0.45, 0.45, 0.45)
export const FOOTER_GREY = rgb(0.5, 0.5, 0.5)

// ── Seitengeometrie (A4 @ 72dpi) ───────────────────────────────────
export const PAGE_WIDTH = 595.28
export const PAGE_HEIGHT = 841.89
export const MARGIN = 50

/** Oberkante der Fußzeile — darunter darf kein Inhalt gezeichnet werden. */
export const FOOTER_TOP = 74
/** Unterste y-Koordinate, die Inhalt belegen darf (Sicherheitsabstand). */
export const CONTENT_BOTTOM = FOOTER_TOP + 12

const LOGO_FILE = join(process.cwd(), 'public', 'icon-transparent-trimmed.png')
const FONT_DIR = join(process.cwd(), 'public', 'fonts')

/** Minimales Page-Interface — hält die Zeichenlogik unit-testbar. */
export interface DrawablePage {
  drawText(text: string, opts: Record<string, unknown>): void
  drawLine(opts: Record<string, unknown>): void
  drawImage(image: unknown, opts: Record<string, unknown>): void
}

/** Minimales Font-Interface (pdf-lib PDFFont erfüllt es). */
export interface MeasurableFont {
  widthOfTextAtSize(text: string, size: number): number
}

/**
 * Lädt DejaVuSans + DejaVuSans-Bold und bettet sie ein.
 *
 * Wirft, wenn die Dateien fehlen — ein stiller Helvetica-Fallback würde
 * Umlaute/türkische Zeichen zu ■ machen, und das fällt erst dem Kunden
 * auf der fertigen Rechnung auf.
 */
export async function loadPdfFonts(pdfDoc: PDFDocument): Promise<{ regular: PDFFont; bold: PDFFont }> {
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(join(FONT_DIR, 'DejaVuSans.ttf')),
    readFile(join(FONT_DIR, 'DejaVuSans-Bold.ttf')),
  ])
  const regular = await pdfDoc.embedFont(regularBytes, { subset: true })
  const bold = await pdfDoc.embedFont(boldBytes, { subset: true })
  return { regular, bold }
}

/**
 * Bettet das vorhandene Engel-Logo ein. Gibt `null` zurück, wenn die Datei
 * nicht lesbar ist — der Briefkopf zeichnet dann ohne Bild weiter, statt die
 * ganze Rechnung scheitern zu lassen.
 */
export async function loadBriefkopfLogo(pdfDoc: PDFDocument): Promise<PDFImage | null> {
  try {
    const bytes = await readFile(LOGO_FILE)
    return await pdfDoc.embedPng(bytes)
  } catch (err) {
    log.errorWithException('Logo konnte nicht eingebettet werden', err)
    return null
  }
}

// ── Text-Helfer ────────────────────────────────────────────────────

/** Schriftgröße so weit verkleinern, bis der Text in `maxWidth` passt. */
function fitSize(font: MeasurableFont, text: string, size: number, maxWidth: number, min = 5.5): number {
  let s = size
  while (s > min && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.25
  return s
}

/**
 * Bricht einen Text an Wortgrenzen auf `maxWidth` um; überlange Einzelwörter
 * (z. B. eine IBAN ohne Leerzeichen) werden hart getrennt. Nötig, weil
 * Bankname/IBAN/BIC aus der DB kommen und beliebig lang sein können — reines
 * Verkleinern der Schrift stößt irgendwann an die Lesbarkeitsgrenze.
 */
export function wrapText(font: MeasurableFont, text: string, size: number, maxWidth: number): string[] {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return [text]

  const zeilen: string[] = []
  let aktuell = ''

  const pushHart = (wort: string) => {
    let rest = wort
    while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
      let n = rest.length
      while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > maxWidth) n--
      zeilen.push(rest.slice(0, n))
      rest = rest.slice(n)
    }
    aktuell = rest
  }

  for (const wort of text.split(' ')) {
    const probe = aktuell ? `${aktuell} ${wort}` : wort
    if (font.widthOfTextAtSize(probe, size) <= maxWidth) {
      aktuell = probe
      continue
    }
    if (aktuell) zeilen.push(aktuell)
    aktuell = ''
    if (font.widthOfTextAtSize(wort, size) > maxWidth) pushHart(wort)
    else aktuell = wort
  }
  if (aktuell) zeilen.push(aktuell)
  return zeilen
}

function drawRight(
  page: DrawablePage,
  text: string,
  opts: { right: number; y: number; size: number; font: MeasurableFont; color: unknown }
) {
  const x = opts.right - opts.font.widthOfTextAtSize(text, opts.size)
  page.drawText(text, { x, y: opts.y, size: opts.size, font: opts.font, color: opts.color })
}

function drawCentered(
  page: DrawablePage,
  text: string,
  opts: { center: number; y: number; size: number; font: MeasurableFont; color: unknown; maxWidth?: number }
) {
  const size = opts.maxWidth ? fitSize(opts.font, text, opts.size, opts.maxWidth) : opts.size
  const x = opts.center - opts.font.widthOfTextAtSize(text, size) / 2
  page.drawText(text, { x, y: opts.y, size, font: opts.font, color: opts.color })
}

// ── Briefkopf ──────────────────────────────────────────────────────

export interface BriefkopfOptions {
  page: DrawablePage
  fontRegular: MeasurableFont
  fontBold: MeasurableFont
  /** Eingebettetes Logo aus `loadBriefkopfLogo()`; `null` ⇒ ohne Bild. */
  logo?: PDFImage | null
  /** IK-Nummer der Organisation (Mittelspalte). */
  ik?: string | null
  /**
   * Kompaktvariante für Folge-/Detailseiten: kleines Logo, eine Zeile,
   * dünnere Linie. Spart ~40 pt Höhe pro Seite.
   */
  compact?: boolean
  /** Rechtsbündige Zusatzzeile in der Kompaktvariante (z. B. „Rechnung … (Fortsetzung)"). */
  compactHint?: string | null
  pageWidth?: number
  pageHeight?: number
  margin?: number
}

/**
 * Zeichnet den Briefkopf und gibt die y-Koordinate zurück, ab der Inhalt
 * beginnen darf.
 */
export function drawBriefkopf(opts: BriefkopfOptions): number {
  const {
    page, fontRegular, fontBold, logo, ik,
    compact = false, compactHint = null,
    pageWidth = PAGE_WIDTH, pageHeight = PAGE_HEIGHT, margin = MARGIN,
  } = opts

  const top = pageHeight - margin
  const right = pageWidth - margin
  // Logo-Seitenverhältnis aus der Quelldatei (160 × 138) — nie verzerren.
  const ratio = logo && logo.height ? logo.height / logo.width : 138 / 160

  if (compact) {
    const logoW = 26
    const logoH = logoW * ratio
    if (logo) page.drawImage(logo, { x: margin, y: top - logoH, width: logoW, height: logoH })
    page.drawText(BRIEFKOPF.kurz, {
      x: margin + logoW + 8, y: top - logoH + 5, size: 11, font: fontBold, color: GOLD,
    })
    if (compactHint) {
      drawRight(page, compactHint, {
        right, y: top - logoH + 5, size: 8.5, font: fontRegular, color: GREY,
      })
    }
    const lineY = top - logoH - 8
    page.drawLine({
      start: { x: margin, y: lineY }, end: { x: right, y: lineY },
      thickness: 1, color: GOLD,
    })
    return lineY - 22
  }

  const logoW = 46
  const logoH = logoW * ratio
  if (logo) page.drawImage(logo, { x: margin, y: top - logoH, width: logoW, height: logoH })

  // Mittelspalte — Firmierung + IK. Breite begrenzt, damit sie nicht in die
  // Adressspalte hineinläuft.
  const center = pageWidth / 2
  const centerMax = pageWidth - 2 * (margin + logoW + 24)
  drawCentered(page, BRIEFKOPF.firma, {
    center, y: top - 11, size: 10.5, font: fontBold, color: COAL, maxWidth: centerMax,
  })
  drawCentered(page, BRIEFKOPF.zusatz, {
    center, y: top - 22, size: 7.5, font: fontRegular, color: GREY, maxWidth: centerMax,
  })
  if (ik) {
    drawCentered(page, `IK-Nummer: ${ik}`, {
      center, y: top - 34, size: 8.5, font: fontBold, color: COAL, maxWidth: centerMax,
    })
  }

  // Adressspalte rechts.
  for (const [i, line] of [BRIEFKOPF.strasse, BRIEFKOPF.ort, BRIEFKOPF.email].entries()) {
    drawRight(page, line, { right, y: top - 11 - i * 11, size: 8, font: fontRegular, color: GREY })
  }

  const lineY = top - logoH - 10
  page.drawLine({
    start: { x: margin, y: lineY }, end: { x: right, y: lineY },
    thickness: 2, color: GOLD,
  })
  return lineY - 24
}

// ── Fußzeile ───────────────────────────────────────────────────────

export interface BriefkopfFooterOptions {
  page: DrawablePage
  font: MeasurableFont
  /** false ⇒ Beleg ist keine Zahlungsaufforderung (Gutschrift/Storno). */
  payable?: boolean
  ik?: string | null
  iban?: string | null
  bic?: string | null
  bank?: string | null
  steuernummer?: string | null
  pageWidth?: number
  margin?: number
}

/**
 * Zeichnet die Pflichtangaben-Fußzeile mit goldener Trennlinie darüber.
 * Alle Zeilen liegen unterhalb von {@link FOOTER_TOP}.
 */
export function drawBriefkopfFooter(opts: BriefkopfFooterOptions): void {
  const {
    page, font, payable = true, ik, iban, bic, bank,
    steuernummer, pageWidth = PAGE_WIDTH, margin = MARGIN,
  } = opts

  const right = pageWidth - margin
  const center = pageWidth / 2
  const maxWidth = right - margin

  page.drawLine({
    start: { x: margin, y: FOOTER_TOP }, end: { x: right, y: FOOTER_TOP },
    thickness: 0.75, color: GOLD,
  })

  const kontakt = [
    ik ? `IK-Nummer: ${ik}` : null,
    `E-Mail: ${BRIEFKOPF.email}`,
    `${BRIEFKOPF.registergericht}, ${BRIEFKOPF.registernummer}`,
    steuernummer ? `Steuernummer: ${steuernummer}` : null,
  ].filter(Boolean).join(' · ')

  const bankTeile = [
    `Bankverbindung: ${bank || 'Sparkasse'}`,
    iban ? `IBAN ${iban}` : null,
    bic ? `BIC ${bic}` : null,
  ].filter(Boolean).join(' · ')

  const zeilen = [
    `${BRIEFKOPF.firma} · ${BRIEFKOPF.strasse} · ${BRIEFKOPF.ort}`,
    kontakt,
    `Geschäftsführer: ${BRIEFKOPF.geschaeftsfuehrer}`,
    payable
      ? `${bankTeile} · Zahlbar innerhalb von 30 Tagen ohne Abzug`
      : `${bankTeile} · Dieser Beleg ist keine Zahlungsaufforderung`,
  ]

  // Zuerst leicht verkleinern (bis 6 pt), erst dann umbrechen. Sonst rutscht
  // schon die normale Bankzeile in einen Umbruch mit einem einzelnen Restwort.
  // Lange Bankbezeichnungen/IBANs dürfen aber auch nicht abgeschnitten werden —
  // deshalb Umbruch als zweite Stufe statt Ellipse.
  const gesetzt = zeilen.flatMap(zeile => {
    const size = fitSize(font, zeile, 7, maxWidth, 6)
    return wrapText(font, zeile, size, maxWidth).map(text => ({ text, size }))
  })

  // Der Block wächst nach unten. Zeilenabstand so weit stauchen, dass die
  // letzte Zeile über dem Blattrand bleibt (Untergrenze 26 pt).
  const abstand = gesetzt.length > 1
    ? Math.min(9, (FOOTER_TOP - 11 - 26) / (gesetzt.length - 1))
    : 9

  gesetzt.forEach(({ text, size }, i) => {
    drawCentered(page, text, {
      center, y: FOOTER_TOP - 11 - i * abstand, size, font, color: FOOTER_GREY,
    })
  })
}

/** Typ-Hilfe: pdf-lib-Seite als DrawablePage verwenden. */
export function asDrawable(page: PDFPage): DrawablePage {
  return page as unknown as DrawablePage
}
