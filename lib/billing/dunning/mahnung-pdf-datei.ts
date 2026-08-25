// ═══════════════════════════════════════════════════════════════
// Mahnung als echte PDF-Datei
// ═══════════════════════════════════════════════════════════════
//
// mahnung-pdf.ts erzeugt bislang nur HTML (generateMahnungHtml) — im
// Projekt gibt es keinen HTML→PDF-Renderer, weder Puppeteer noch eine
// Print-Pipeline. Fuer den E-Mail-Versand braucht die Mahnung aber einen
// Anhang, den der Kunde archivieren kann.
//
// Deshalb wird hier dieselbe MahnungData mit pdf-lib gesetzt — gleiche
// Fonts (DejaVuSans, sonst brechen Umlaute und türkische Zeichen),
// gleicher Briefkopf und dieselbe Pflichtangaben-Fußzeile wie beim
// Rechnungs-Belegpaket.
// ═══════════════════════════════════════════════════════════════

import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { DUNNING_TEXTS as MAHN_TEXTE, mahnungAnrede, type MahnungData } from './mahnung-pdf'
import { DUNNING_LABELS } from '../core/dunning'
import {
  drawBriefkopf,
  drawBriefkopfFooter,
  loadBriefkopfLogo,
  loadPdfFonts,
  asDrawable,
  wrapText,
  CONTENT_BOTTOM,
  PAGE_WIDTH,
  PAGE_HEIGHT,
  MARGIN,
} from '@/lib/pdf/briefkopf'

/** Stufen ohne eigenen Schreibtext (offen, inkasso_vorbereitung, bezahlt). */
export function hatMahnText(dunningLevel: string): boolean {
  return Boolean(MAHN_TEXTE[dunningLevel])
}

function datumDe(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00+01:00` : iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function mahnungDateiname(data: MahnungData): string {
  const label = MAHN_TEXTE[data.dunningLevel]?.subject || DUNNING_LABELS[data.dunningLevel] || 'Mahnung'
  const sicher = `${label}_${data.invoiceNumber}`
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return `${sicher || 'Mahnung'}.pdf`
}

/**
 * Setzt die Mahnung als A4-PDF.
 *
 * Wirft, wenn es fuer die Stufe keinen Schreibtext gibt — genau wie
 * generateMahnungHtml(). Eine Mahnung ohne Text darf nicht rausgehen.
 */
export async function erzeugeMahnungPdf(data: MahnungData): Promise<Uint8Array> {
  const template = MAHN_TEXTE[data.dunningLevel]
  if (!template) throw new Error(`Kein Mahnungstext für Stufe "${data.dunningLevel}"`)

  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const { regular, bold } = await loadPdfFonts(pdfDoc)
  const logo = await loadBriefkopfLogo(pdfDoc)

  const footerOpts = {
    payable: true,
    ik: null,
    iban: data.creditorIban ?? null,
    bic: data.creditorBic ?? null,
    bank: null,
    steuernummer: null,
  }

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  let y = drawBriefkopf({ page: asDrawable(page), fontRegular: regular, fontBold: bold, logo })
  const rechts = PAGE_WIDTH - MARGIN
  const breite = rechts - MARGIN

  const footer = (p: typeof page) =>
    drawBriefkopfFooter({ page: asDrawable(p), font: regular, ...footerOpts })

  const neueSeite = (hinweis: string) => {
    footer(page)
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    y = drawBriefkopf({
      page: asDrawable(page), fontRegular: regular, fontBold: bold, logo,
      compact: true, compactHint: hinweis,
    })
  }
  const platz = (benoetigt: number) => {
    if (y - benoetigt < CONTENT_BOTTOM) {
      neueSeite(`${template.subject} — Rechnung ${data.invoiceNumber} (Fortsetzung)`)
    }
  }

  // ── Empfaengeranschrift ──
  for (const zeile of data.debtorAddress) {
    platz(14)
    page.drawText(zeile, { x: MARGIN, y, size: 11, font: regular, color: rgb(0.1, 0.1, 0.1) })
    y -= 14
  }

  // ── Datum + Aktenzeichen rechtsbuendig ──
  y -= 14
  const ortZeile = `${data.creditorAddress[data.creditorAddress.length - 1] || ''}, den ${datumDe(data.date)}`
  page.drawText(ortZeile, {
    x: rechts - regular.widthOfTextAtSize(ortZeile, 10), y, size: 10, font: regular, color: rgb(0.4, 0.4, 0.4),
  })
  y -= 13
  const azZeile = `Aktenzeichen: ${data.referenceNumber}`
  page.drawText(azZeile, {
    x: rechts - regular.widthOfTextAtSize(azZeile, 10), y, size: 10, font: regular, color: rgb(0.4, 0.4, 0.4),
  })
  y -= 30

  // ── Betreff ──
  const betreff = `${template.subject} — Rechnung Nr. ${data.invoiceNumber}`
  for (const zeile of wrapText(bold, betreff, 13, breite)) {
    platz(18)
    page.drawText(zeile, { x: MARGIN, y, size: 13, font: bold, color: rgb(0.1, 0.2, 0.36) })
    y -= 18
  }
  y -= 8

  // Anrede mit Namen — bis hierher war debtorName totes Feld (s. mahnungAnrede()).
  for (const anredeZeile of wrapText(regular, mahnungAnrede(data.debtorName), 11, breite)) {
    platz(15)
    page.drawText(anredeZeile, { x: MARGIN, y, size: 11, font: regular, color: rgb(0.1, 0.1, 0.1) })
    y -= 15
  }
  y -= 7

  // ── Fliesstext ──
  const bodyText = template.body.replace(/{deadline}/g, datumDe(data.paymentDeadline))
  for (const absatz of bodyText.split('\n\n')) {
    for (const zeile of wrapText(regular, absatz.replace(/\n/g, ' '), 11, breite)) {
      platz(15)
      page.drawText(zeile, { x: MARGIN, y, size: 11, font: regular, color: rgb(0.1, 0.1, 0.1) })
      y -= 15
    }
    y -= 8
  }

  // ── Forderungsaufstellung ──
  platz(120)
  y -= 10
  page.drawLine({ start: { x: MARGIN, y }, end: { x: rechts, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) })
  y -= 18

  const betragX = rechts - 90
  const zeile = (bezeichnung: string, betrag: string, fett = false) => {
    platz(16)
    const f = fett ? bold : regular
    page.drawText(bezeichnung, { x: MARGIN, y, size: 10, font: f, color: rgb(0.1, 0.1, 0.1) })
    page.drawText(betrag, {
      x: rechts - f.widthOfTextAtSize(betrag, 10), y, size: 10, font: f, color: rgb(0.1, 0.1, 0.1),
    })
    y -= 16
  }

  zeile(
    `Rechnungsbetrag (Nr. ${data.invoiceNumber} vom ${datumDe(data.invoiceDate)})`,
    data.invoiceAmount
  )
  zeile('Bereits gezahlt', `- ${data.paidAmount}`)
  zeile('Offener Betrag', data.openAmount)
  if (data.dunningFee !== '0,00 €') {
    zeile(`Mahngebühr (${DUNNING_LABELS[data.dunningLevel]})`, data.dunningFee)
  }
  y -= 4
  page.drawLine({ start: { x: betragX - 140, y: y + 10 }, end: { x: rechts, y: y + 10 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) })
  zeile('Gesamtforderung', data.totalDue, true)

  // ── Zahlungsangaben ──
  platz(100)
  y -= 12
  const bankZeilen: [string, string][] = [
    ['Zahlungsfrist', datumDe(data.paymentDeadline)],
    ['Empfänger', data.creditorName],
  ]
  if (data.creditorIban) bankZeilen.push(['IBAN', data.creditorIban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim()])
  if (data.creditorBic) bankZeilen.push(['BIC', data.creditorBic])
  bankZeilen.push(['Verwendungszweck', data.referenceNumber])

  for (const [k, v] of bankZeilen) {
    platz(15)
    page.drawText(`${k}:`, { x: MARGIN, y, size: 10, font: bold, color: rgb(0.35, 0.35, 0.35) })
    page.drawText(v, { x: MARGIN + 130, y, size: 10, font: regular, color: rgb(0.1, 0.1, 0.1) })
    y -= 15
  }

  // ── Gruss ──
  platz(60)
  y -= 18
  page.drawText(template.closing, { x: MARGIN, y, size: 11, font: regular, color: rgb(0.1, 0.1, 0.1) })
  y -= 26
  page.drawText(data.creditorName, { x: MARGIN, y, size: 11, font: bold, color: rgb(0.1, 0.1, 0.1) })
  y -= 30

  const hinweis = 'Sollte die Zahlung bereits erfolgt sein, betrachten Sie dieses Schreiben bitte als gegenstandslos. Bei Rückfragen wenden Sie sich bitte unter Angabe des Aktenzeichens an uns.'
  for (const z of wrapText(regular, hinweis, 8.5, breite)) {
    platz(12)
    page.drawText(z, { x: MARGIN, y, size: 8.5, font: regular, color: rgb(0.55, 0.55, 0.55) })
    y -= 12
  }

  footer(page)
  return pdfDoc.save()
}
