#!/usr/bin/env node
/**
 * Setzt einen Abschlussbericht aus docs/reports/*.md als PDF.
 *
 * Bewusst schlicht und ohne Fremdabhängigkeit ausser pdf-lib, die das
 * Projekt ohnehin führt. Schriften sind ausschliesslich DejaVuSans und
 * DejaVuSans-Bold aus public/fonts — Helvetica kennt die deutschen
 * Umlaute in der Standard-Kodierung nicht vollständig und wirft bei
 * „–", „§" oder „…" mit WinAnsi-Fehlern.
 *
 * Unterstützt wird die Teilmenge Markdown, die die Berichte benutzen:
 * ATX-Überschriften, Aufzählungen, Tabellen (Pipe-Syntax), Code-Zäune,
 * horizontale Linien sowie **fett** und `code` im Fliesstext.
 *
 * Aufruf: node scripts/report-md-to-pdf.mjs docs/reports/DATEI.md
 */
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

const quelle = process.argv[2]
if (!quelle) {
  console.error('Aufruf: node scripts/report-md-to-pdf.mjs <datei.md>')
  process.exit(1)
}

const A4 = { breite: 595.28, hoehe: 841.89 }
const RAND = 52
const NUTZBREITE = A4.breite - 2 * RAND
const GOLD = rgb(0.788, 0.588, 0.235)
const TINTE = rgb(0.13, 0.13, 0.15)
const GRAU = rgb(0.42, 0.42, 0.46)
const LINIE = rgb(0.85, 0.85, 0.87)

const doc = await PDFDocument.create()
doc.registerFontkit(fontkit)
const normal = await doc.embedFont(fs.readFileSync('public/fonts/DejaVuSans.ttf'), { subset: true })
const fett = await doc.embedFont(fs.readFileSync('public/fonts/DejaVuSans-Bold.ttf'), { subset: true })

let seite = doc.addPage([A4.breite, A4.hoehe])
let y = A4.hoehe - RAND
const seiten = [seite]

function neueSeite() {
  seite = doc.addPage([A4.breite, A4.hoehe])
  seiten.push(seite)
  y = A4.hoehe - RAND
}
function platz(hoehe) {
  if (y - hoehe < RAND + 24) neueSeite()
}

/** Bricht Text auf eine Breite um; gibt die Zeilen zurück. */
function umbrechen(text, schrift, groesse, breite) {
  const woerter = String(text).split(/\s+/).filter(Boolean)
  const zeilen = []
  let zeile = ''
  for (const w of woerter) {
    const kandidat = zeile ? `${zeile} ${w}` : w
    if (schrift.widthOfTextAtSize(kandidat, groesse) <= breite) { zeile = kandidat; continue }
    if (zeile) zeilen.push(zeile)
    // Ein einzelnes Wort, das breiter ist als die Spalte, wird hart getrennt.
    let rest = w
    while (schrift.widthOfTextAtSize(rest, groesse) > breite && rest.length > 1) {
      let n = rest.length
      while (n > 1 && schrift.widthOfTextAtSize(rest.slice(0, n), groesse) > breite) n--
      zeilen.push(rest.slice(0, n))
      rest = rest.slice(n)
    }
    zeile = rest
  }
  if (zeile) zeilen.push(zeile)
  return zeilen.length ? zeilen : ['']
}

function schreibe(text, { schrift = normal, groesse = 9.5, farbe = TINTE, einzug = 0, abstand = 3.2 } = {}) {
  const breite = NUTZBREITE - einzug
  for (const zeile of umbrechen(text, schrift, groesse, breite)) {
    platz(groesse + abstand)
    seite.drawText(zeile, { x: RAND + einzug, y: y - groesse, size: groesse, font: schrift, color: farbe })
    y -= groesse + abstand
  }
}

/** Entfernt Markdown-Auszeichnung, die wir nicht typografisch abbilden. */
const klar = s => String(s)
  .replace(/\*\*(.+?)\*\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\[(.+?)\]\(.+?\)/g, '$1')
  .trim()

const zeilen = fs.readFileSync(quelle, 'utf8').split('\n')
let imCode = false
let tabelle = null

function tabelleSetzen(rows) {
  if (!rows.length) return
  const spalten = rows[0].length
  const spaltenBreite = NUTZBREITE / spalten
  const G = 8.2
  for (let r = 0; r < rows.length; r++) {
    const schrift = r === 0 ? fett : normal
    const zellen = rows[r].map(z => umbrechen(klar(z), schrift, G, spaltenBreite - 8))
    const hoehe = Math.max(...zellen.map(c => c.length)) * (G + 2.4) + 5
    platz(hoehe + 4)
    for (let c = 0; c < spalten; c++) {
      let zy = y - G
      for (const t of zellen[c]) {
        seite.drawText(t, { x: RAND + c * spaltenBreite + 2, y: zy, size: G, font: schrift, color: TINTE })
        zy -= G + 2.4
      }
    }
    y -= hoehe
    seite.drawLine({
      start: { x: RAND, y: y + 2 }, end: { x: RAND + NUTZBREITE, y: y + 2 },
      thickness: r === 0 ? 0.8 : 0.3, color: r === 0 ? GOLD : LINIE,
    })
    y -= 4
  }
  y -= 6
}

for (const roh of zeilen) {
  const z = roh.replace(/\s+$/, '')

  if (z.trim().startsWith('```')) { imCode = !imCode; y -= 3; continue }
  if (imCode) {
    platz(11)
    for (const t of umbrechen(z || ' ', normal, 8, NUTZBREITE - 14)) {
      platz(11)
      seite.drawText(t, { x: RAND + 10, y: y - 8, size: 8, font: normal, color: GRAU })
      y -= 10.5
    }
    continue
  }

  // Tabellen sammeln, bis der Block endet.
  if (/^\s*\|/.test(z)) {
    const zellen = z.trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim())
    if (zellen.every(c => /^:?-{2,}:?$/.test(c))) continue // Trennzeile
    ;(tabelle ??= []).push(zellen)
    continue
  }
  if (tabelle) { tabelleSetzen(tabelle); tabelle = null }

  if (!z.trim()) { y -= 5; continue }

  if (/^---+$/.test(z.trim())) {
    platz(14)
    seite.drawLine({ start: { x: RAND, y: y - 6 }, end: { x: RAND + NUTZBREITE, y: y - 6 }, thickness: 0.6, color: LINIE })
    y -= 16
    continue
  }

  const ueberschrift = z.match(/^(#{1,4})\s+(.*)$/)
  if (ueberschrift) {
    const stufe = ueberschrift[1].length
    const groesse = [17, 12.5, 10.8, 9.8][stufe - 1]
    y -= stufe <= 2 ? 10 : 6
    platz(groesse + 12)
    schreibe(klar(ueberschrift[2]), { schrift: fett, groesse, farbe: stufe <= 2 ? GOLD : TINTE, abstand: 4 })
    if (stufe === 1) {
      seite.drawLine({ start: { x: RAND, y: y - 3 }, end: { x: RAND + NUTZBREITE, y: y - 3 }, thickness: 1.2, color: GOLD })
      y -= 10
    }
    y -= 3
    continue
  }

  const liste = z.match(/^(\s*)[-*]\s+(.*)$/)
  if (liste) {
    const tiefe = Math.floor(liste[1].length / 2)
    const einzug = 12 + tiefe * 14
    platz(12)
    seite.drawText('•', { x: RAND + einzug - 9, y: y - 9.5, size: 9.5, font: normal, color: GOLD })
    schreibe(klar(liste[2]), { einzug })
    continue
  }

  schreibe(klar(z))
}
if (tabelle) tabelleSetzen(tabelle)

// Fusszeile mit Seitenzahl auf jeder Seite.
seiten.forEach((s, i) => {
  const t = `Alltagsengel — interner Prüfbericht · Seite ${i + 1} von ${seiten.length}`
  s.drawText(t, {
    x: RAND, y: RAND - 22, size: 7.5, font: normal, color: GRAU,
  })
})

const ziel = quelle.replace(/\.md$/, '.pdf')
fs.writeFileSync(ziel, await doc.save())
console.log(`${ziel} — ${seiten.length} Seiten, ${(fs.statSync(ziel).size / 1024).toFixed(0)} KB`)
