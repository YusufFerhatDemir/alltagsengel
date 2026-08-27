#!/usr/bin/env node
/**
 * Codemod: `export async function GET(...)` -> `export const GET = withTracking(async function GET(...))`
 *
 * Verdrahtet das Request-Tracking (lib/monitoring/tracker.ts) in allen
 * API-Routen. Ohne diesen Schritt misst /api/admin/monitoring nichts —
 * und "keine Fehler" heisst dort "nichts gemessen".
 *
 * Lauf:  node scripts/withtracking-codemod.mjs [--dry] [pfad ...]
 *
 * Der Rumpf wird NICHT per Regex gesucht, sondern in drei Schritten
 * abgezaehlt: Parameterliste, etwaige Rueckgabetyp-Angabe, Rumpf. Der
 * naive Weg (erste `{` nach dem Namen) greift bei Next-Signaturen wie
 * `(req, { params }: { params: Promise<{ id: string }> })` daneben.
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import path from 'node:path'

const WURZEL = path.resolve(import.meta.dirname, '..')
const HANDLER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const IMPORT_ZEILE = "import { withTracking } from '@/lib/monitoring/tracker'"

function routenDateien(start) {
  const treffer = []
  const lauf = (verzeichnis) => {
    for (const eintrag of readdirSync(verzeichnis)) {
      const voll = path.join(verzeichnis, eintrag)
      if (statSync(voll).isDirectory()) lauf(voll)
      else if (eintrag === 'route.ts') treffer.push(voll)
    }
  }
  lauf(path.join(WURZEL, start))
  return treffer.sort()
}

/** Ende des Funktionsrumpfes ab dem Kopf-Treffer, exklusiv gezaehlt. */
function rumpfEnde(src, kopfEnde) {
  let i = kopfEnde - 1 // steht auf der oeffnenden Klammer der Parameterliste
  let klammern = 0
  for (; i < src.length; i++) {
    if (src[i] === '(') klammern++
    else if (src[i] === ')') { klammern--; if (klammern === 0) { i++; break } }
  }
  // Rueckgabetyp ueberspringen: nur eine `{` auf Winkelklammer-Tiefe 0 zaehlt.
  let winkel = 0, start = -1
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === '<') winkel++
    else if (c === '>') winkel = Math.max(0, winkel - 1)
    else if (c === '{' && winkel === 0) { start = i; break }
  }
  if (start === -1) return null
  let tiefe = 0
  for (let j = start; j < src.length; j++) {
    if (src[j] === '{') tiefe++
    else if (src[j] === '}') { tiefe--; if (tiefe === 0) return j + 1 }
  }
  return null
}

/** Position hinter der letzten Top-Level-Import-Anweisung. */
function nachImports(src) {
  const re = /^import\s[\s\S]*?from\s+(['"])[^'"]+\1;?[ \t]*$/gm
  let letzte = null, m
  while ((m = re.exec(src)) !== null) letzte = m
  if (!letzte) return null
  return letzte.index + letzte[0].length
}

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const ziele = args.filter(a => !a.startsWith('--'))
const dateien = ziele.length
  ? ziele.map(z => path.resolve(WURZEL, z))
  : routenDateien('app/api')

let geaendert = 0, handlerGesamt = 0
const uebersprungen = []

for (const datei of dateien) {
  let src = readFileSync(datei, 'utf-8')
  const rel = path.relative(WURZEL, datei)

  // Kopf-Treffer einsammeln (nur Top-Level, also Zeilenanfang).
  const treffer = []
  for (const name of HANDLER) {
    const re = new RegExp(`^export\\s+async\\s+function\\s+${name}\\s*\\(`, 'gm')
    let m
    while ((m = re.exec(src)) !== null) {
      const ende = rumpfEnde(src, m.index + m[0].length)
      if (ende === null) { uebersprungen.push(`${rel}: Rumpf von ${name} nicht lesbar`); continue }
      treffer.push({ name, von: m.index, kopfLaenge: m[0].length, bis: ende })
    }
  }
  if (treffer.length === 0) continue

  // Von hinten ersetzen, damit die Indizes vorne gueltig bleiben.
  treffer.sort((a, b) => b.von - a.von)
  for (const t of treffer) {
    const kopf = src.slice(t.von, t.von + t.kopfLaenge)
    const neuerKopf = kopf.replace(
      /^export\s+async\s+function\s+/,
      `export const ${t.name} = withTracking(async function `,
    )
    src = src.slice(0, t.von) + neuerKopf + src.slice(t.von + t.kopfLaenge, t.bis) + ')' + src.slice(t.bis)
    handlerGesamt++
  }

  if (!src.includes(IMPORT_ZEILE)) {
    const pos = nachImports(src)
    if (pos === null) { uebersprungen.push(`${rel}: keine Import-Zeile gefunden`); continue }
    src = src.slice(0, pos) + '\n' + IMPORT_ZEILE + src.slice(pos)
  }

  if (!dry) writeFileSync(datei, src, 'utf-8')
  geaendert++
}

console.log(`${dry ? '[dry] ' : ''}Dateien: ${geaendert}, Handler: ${handlerGesamt}`)
if (uebersprungen.length) {
  console.log(`\nUEBERSPRUNGEN (${uebersprungen.length}):`)
  for (const u of uebersprungen) console.log('  ' + u)
  process.exit(1)
}
