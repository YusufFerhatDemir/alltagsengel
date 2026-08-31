// ═══════════════════════════════════════════════════════════════════
// Zaun: eine Druckvorlage, die DejaVu NENNT, muss sie auch LADEN
// ═══════════════════════════════════════════════════════════════════
// Der Befund, der diesen Zaun ausgeloest hat: beide HTML-Druckvorlagen
// (Leistungsnachweis, Mahnung) trugen `font-family: 'DejaVu Sans', …`
// und kein einziges @font-face. DejaVu ist auf keinem der Rechner, an
// denen gedruckt wird, eine Systemschrift — der Browser fiel still auf
// Arial zurueck. Das faellt in keinem Test auf, weil das HTML gueltig
// ist und der Text lesbar bleibt; auffallen wuerde es erst der
// Pflegekasse an einem Kassenformular mit verschobenen Zeilen.
//
// Der statische Teil des Zauns ist der wichtigere: er trifft auch die
// naechste Druckvorlage, die es heute noch nicht gibt.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  dejaVuFontFaceCss,
  PDF_SCHRIFT_DATEIEN,
  PDF_SCHRIFT_FAMILIE,
} from '@/lib/pdf/schrift-css'
import { buildLeistungsnachweisHtml, type LeistungsnachweisData } from '@/lib/abrechnung/leistungsnachweis-pdf'
import { generateMahnungHtml, type MahnungData } from '@/lib/billing/dunning/mahnung-pdf'

const WURZEL = process.cwd()

// ── Die Schriftdateien muessen wirklich liegen, wo das CSS sie sucht ──
describe('DejaVu liegt dort, wohin das CSS zeigt', () => {
  it.each([...PDF_SCHRIFT_DATEIEN])('public/fonts/%s ist vorhanden und nicht leer', (datei) => {
    const pfad = join(WURZEL, 'public', 'fonts', datei)
    expect(existsSync(pfad)).toBe(true)
    expect(statSync(pfad).size).toBeGreaterThan(50_000)
  })

  it('das erzeugte CSS zeigt auf genau diese Dateien', () => {
    const css = dejaVuFontFaceCss()
    for (const datei of PDF_SCHRIFT_DATEIEN) {
      expect(css).toContain(`/fonts/${datei}`)
    }
    expect(css).toContain('font-weight: 400')
    expect(css).toContain('font-weight: 700')
  })

  it('mit Herkunft wird ein absoluter Pfad daraus — ohne doppelten Schraegstrich', () => {
    expect(dejaVuFontFaceCss('https://alltagsengel.care'))
      .toContain("url('https://alltagsengel.care/fonts/DejaVuSans.ttf')")
    expect(dejaVuFontFaceCss('https://alltagsengel.care/'))
      .toContain("url('https://alltagsengel.care/fonts/DejaVuSans.ttf')")
  })
})

// ── Statischer Zaun: jede Druckvorlage laedt die Schrift ─────────────
describe('jede Druck-Vorlage laedt die Schrift, die sie nennt', () => {
  /** Alle .ts/.tsx unter lib/ und app/, ohne node_modules. */
  function dateien(start: string, treffer: string[] = []): string[] {
    for (const eintrag of readdirSync(start, { withFileTypes: true })) {
      if (eintrag.name === 'node_modules' || eintrag.name.startsWith('.')) continue
      const pfad = join(start, eintrag.name)
      if (eintrag.isDirectory()) dateien(pfad, treffer)
      else if (/\.tsx?$/.test(eintrag.name)) treffer.push(pfad)
    }
    return treffer
  }

  const alle = [...dateien(join(WURZEL, 'lib')), ...dateien(join(WURZEL, 'app'))]

  it('findet ueberhaupt Dateien (sonst prueft der Zaun nichts)', () => {
    expect(alle.length).toBeGreaterThan(500)
  })

  it('keine Datei nennt DejaVu in font-family, ohne @font-face zu liefern', () => {
    const luecken: string[] = []
    for (const pfad of alle) {
      const inhalt = readFileSync(pfad, 'utf8')
      // Nur echte CSS-Deklarationen, nicht Kommentare oder Erklaertexte.
      const nenntInCss = /font-family:\s*[^;\n]*DejaVu/i.test(inhalt)
        || /font-family:\s*\$\{\s*PDF_SCHRIFT_FAMILIE/.test(inhalt)
      if (!nenntInCss) continue
      const laedt = inhalt.includes('@font-face') || inhalt.includes('dejaVuFontFaceCss')
      if (!laedt) luecken.push(pfad.replace(WURZEL + '/', ''))
    }
    expect(luecken).toEqual([])
  })

  it('jede Datei mit @page-Druck-CSS nennt eine Schrift und laedt sie', () => {
    const luecken: string[] = []
    for (const pfad of alle) {
      const inhalt = readFileSync(pfad, 'utf8')
      if (!inhalt.includes('@page')) continue
      const laedt = inhalt.includes('@font-face') || inhalt.includes('dejaVuFontFaceCss')
      if (!laedt) luecken.push(pfad.replace(WURZEL + '/', ''))
    }
    expect(luecken).toEqual([])
  })
})

// ── Die erzeugten Dokumente selbst ──────────────────────────────────
function nachweisDaten(): LeistungsnachweisData {
  return {
    monat: '2026-08',
    monat_label: 'August 2026',
    erstellt_am: '2026-08-31',
    leistungserbringer_ik: '460629986',
    leistungserbringer: {
      name: 'Alltagsengel UG (haftungsbeschränkt)',
      kurz: 'Alltagsengel',
      strasse: 'Neue Mainzer Straße 66-68',
      ort: '60311 Frankfurt am Main',
      email: 'info@alltagsengel.care',
    },
    verordnung: {
      id: 'v1', typ: '45b', genehmigungsnummer: 'AZ-4711',
      genehmigt_bis: '2026-12-31', kostentraeger_name: 'AOK Hessen',
      kostentraeger_ik: '105313145', leistungsart: 'Betreuung',
    },
    klient: {
      // Bewusst mit tuerkischen Zeichen: genau dafuer steht DejaVu hier.
      name: 'Ayşe Gülşen Çınar', geburtsdatum: '1948-03-12',
      versichertennummer: 'A123456789', pflegekasse: 'AOK Hessen',
      pflegekasse_ik: '105313145', pflegegrad: '3',
      anschrift: 'Musterweg 1, 60311 Frankfurt',
    },
    pflegekraefte: ['MK'],
    einsaetze: [{
      datum: '2026-08-04', von: '09:00', bis: '11:00', dauer_minuten: 120,
      leistungsart: 'Betreuung', betrag_euro: 60,
      handzeichen_pflegekraft: 'MK', handzeichen_klient: true,
    }],
    summe: { anzahl: 1, minuten: 120, betrag_euro: 60 },
    betraege_freigegeben: true,
    betrag_sperrgrund: null,
    warnungen: [],
  }
}

function mahnungDaten(): MahnungData {
  return {
    creditorName: 'Alltagsengel UG (haftungsbeschränkt)',
    creditorAddress: ['Neue Mainzer Straße 66-68', '60311 Frankfurt am Main'],
    creditorIban: 'DE00 0000 0000 0000 0000 00',
    debtorName: 'Ayşe Gülşen Çınar',
    debtorAddress: ['Ayşe Gülşen Çınar', 'Musterweg 1', '60311 Frankfurt'],
    invoiceNumber: 'RE-2026-0001',
    invoiceDate: '2026-07-01',
    invoiceAmount: '105,00 €',
    paidAmount: '0,00 €',
    openAmount: '105,00 €',
    dueDate: '2026-07-15',
    dunningLevel: 'erinnerung',
    dunningFee: '0,00 €',
    totalDue: '105,00 €',
    paymentDeadline: '2026-08-15',
    date: '2026-08-01',
    referenceNumber: 'AZ-1',
  }
}

describe('die erzeugten Druckdokumente laden DejaVu wirklich', () => {
  const faelle: [string, () => string][] = [
    ['Leistungsnachweis', () => buildLeistungsnachweisHtml(nachweisDaten())],
    ['Mahnung', () => generateMahnungHtml(mahnungDaten())],
  ]

  it.each(faelle)('%s: @font-face steht im Dokument', (_name, bauen) => {
    const html = bauen()
    expect(html).toContain('@font-face')
    for (const datei of PDF_SCHRIFT_DATEIEN) {
      expect(html).toContain(`/fonts/${datei}`)
    }
  })

  it.each(faelle)('%s: DejaVu steht VOR den Ersatzschriften', (_name, bauen) => {
    const html = bauen()
    const treffer = /font-family:\s*([^;]+);/.exec(html)
    expect(treffer).not.toBeNull()
    const familie = treffer![1]
    expect(familie).toContain('DejaVu Sans')
    // Der Rueckfall darf nicht vor der geladenen Schrift stehen.
    expect(familie.indexOf('DejaVu Sans')).toBeLessThan(
      familie.indexOf('Arial') === -1 ? Number.MAX_SAFE_INTEGER : familie.indexOf('Arial'),
    )
  })

  it.each(faelle)('%s: die Ersatzangaben bleiben als letzte Rettung stehen', (_name, bauen) => {
    expect(bauen()).toContain('sans-serif')
  })

  it('der Leistungsnachweis nimmt fuer den Download eine Herkunft an', () => {
    const html = buildLeistungsnachweisHtml(nachweisDaten(), 'https://alltagsengel.care')
    expect(html).toContain("url('https://alltagsengel.care/fonts/DejaVuSans.ttf')")
    // Ohne Herkunft bleibt es wurzelrelativ (Druck-iframe).
    expect(buildLeistungsnachweisHtml(nachweisDaten())).toContain("url('/fonts/DejaVuSans.ttf')")
  })

  it('tuerkische Zeichen stehen unveraendert im Dokument', () => {
    const html = buildLeistungsnachweisHtml(nachweisDaten())
    expect(html).toContain('Ayşe Gülşen Çınar')
    expect(html).toMatch(/charset="?utf-8"?/i)
  })

  it('PDF_SCHRIFT_FAMILIE ist die eine Quelle fuer die Schriftliste', () => {
    expect(PDF_SCHRIFT_FAMILIE).toMatch(/^'DejaVu Sans'/)
    expect(PDF_SCHRIFT_FAMILIE).toContain('sans-serif')
  })
})
