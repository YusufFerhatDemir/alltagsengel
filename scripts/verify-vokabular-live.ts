#!/usr/bin/env tsx
/**
 * verify-vokabular-live.ts
 * ------------------------
 * Beantwortet ZWEI Fragen gegen die Produktion:
 *
 *   1. Schreibt der Code einen WERT, den der CHECK nicht zulaesst? (23514)
 *   2. Schreibt er auf eine SPALTE, die es nicht gibt?          (42703)
 *
 * Beide Achsen sind noetig, und die erste Messung zeigte warum: die
 * Referral-Benachrichtigung trug BEIDE Fehler in einer Anweisung. Nach
 * der Behebung des Wertes meldete die Wert-Pruefung sie als sauber — die
 * Benachrichtigung kam trotzdem nicht an.
 *
 * Ein solcher Schreibvorgang scheitert IMMER (23514) — die Funktion
 * dahinter ist vollstaendig tot, und je nach Fehlerbehandlung merkt es
 * niemand.
 *
 * Die Bewertung steht in lib/schema/vokabular.ts und ist dort getestet.
 * Hier ist nur die Beschaffung.
 *
 * Er schreibt NICHTS.
 *
 * EXIT: 0 solange nur BEKANNTE Befunde auftauchen, 1 bei jedem neuen —
 * dasselbe Verhalten wie verify:mandantenzaun und verify:portal-bindung.
 *
 * Aufruf:  npm run verify:vokabular
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Vokabelbefund } from '../lib/schema/vokabular'
import type { Spaltenbefund } from '../lib/schema/spalten'

for (const datei of ['.env.local', '.env']) {
  if (!existsSync(datei)) continue
  for (const zeile of readFileSync(datei, 'utf8').split('\n')) {
    const m = zeile.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const UEBERSPRINGEN = new Set(['node_modules', '.next', '.git', 'supabase'])

/**
 * Befunde, die erkannt, belegt und eingeordnet sind.
 *
 * Sie stehen hier, damit der Lauf nicht dauerhaft rot ist und ein NEUER
 * Befund sichtbar bleibt. Wer einen Eintrag ergaenzt, begruendet ihn —
 * „kennen wir schon" ist keine Begruendung.
 */
const BEKANNT = new Map<string, string>([
  // Derzeit keine. Die vier Befunde aus Block 37 sind behoben, nicht
  // eingeordnet — ein toter Schreibweg gehoert repariert, nicht verwaltet.
])

function dateienUnter(verzeichnis: string): string[] {
  const treffer: string[] = []
  for (const eintrag of readdirSync(verzeichnis)) {
    if (UEBERSPRINGEN.has(eintrag)) continue
    const pfad = join(verzeichnis, eintrag)
    if (statSync(pfad).isDirectory()) treffer.push(...dateienUnter(pfad))
    else if (/\.tsx?$/.test(eintrag) && !/\.test\.tsx?$/.test(eintrag)) treffer.push(pfad)
  }
  return treffer
}

async function main(): Promise<void> {
  const { apiHeaders, secretKey, envWert } = await import('./lib/supabase-keys.mjs')
  const { ladeWertelisten, pruefeQuelle, schluessel } = await import('../lib/schema/vokabular')
  const { pruefeSpalten, spaltenAusOpenApi } = await import('../lib/schema/spalten')

  const url = envWert('NEXT_PUBLIC_SUPABASE_URL')

  const leseSql = async (sql: string): Promise<string> => {
    const res = await fetch(`${url}/rest/v1/rpc/_run_sql`, {
      method: 'POST',
      headers: apiHeaders(secretKey(), { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p: sql }),
    })
    const roh = await res.text()
    let j: { message?: string } | null = null
    try { j = JSON.parse(roh) } catch { /* Fehlertexte sind nicht immer JSON */ }
    const meldung = j?.message ?? roh
    const i = meldung.indexOf('KETTE:')
    if (i === -1) throw new Error(`Lesefehler: HTTP ${res.status} ${meldung.slice(0, 300)}`)
    return meldung.slice(i + 6).replace(/\\n/g, ' ')
  }

  console.log('═══════════════════════════════════════════════════════════════════')
  console.log(' VOKABULAR — schreibt der Code Werte, die der CHECK verbietet?')
  console.log(` ${new Date().toISOString()}`)
  console.log(' Ein solcher Schreibvorgang scheitert IMMER (23514).')
  console.log(' Es wird NICHTS geschrieben.')
  console.log('═══════════════════════════════════════════════════════════════════\n')

  const erlaubt = await ladeWertelisten(leseSql)
  console.log(`  Wertelisten im Schema : ${erlaubt.size} (Tabelle.Spalte)`)

  const dateien = [
    ...dateienUnter(join(process.cwd(), 'app')),
    ...dateienUnter(join(process.cwd(), 'lib')),
    ...dateienUnter(join(process.cwd(), 'scripts')),
  ]
  console.log(`  Quelldateien geprueft : ${dateien.length}\n`)

  const spec = await (await fetch(`${url}/rest/v1/`, { headers: apiHeaders(secretKey()) })).json()
  const spalten = spaltenAusOpenApi(spec)
  console.log(`  Tabellen in der API   : ${spalten.size}`)

  const alle: Vokabelbefund[] = []
  const spaltenBefunde: Spaltenbefund[] = []
  for (const datei of dateien) {
    const kurz = datei.replace(process.cwd() + '/', '')
    const quelle = readFileSync(datei, 'utf8')
    alle.push(...pruefeQuelle(kurz, quelle, erlaubt))
    spaltenBefunde.push(...pruefeSpalten(kurz, quelle, spalten))
  }

  const bekannt = alle.filter(b => BEKANNT.has(schluessel(b.tabelle, b.spalte)))
  const neu = alle.filter(b => !BEKANNT.has(schluessel(b.tabelle, b.spalte)))

  if (bekannt.length > 0) {
    console.log('⚠  bekannt und eingeordnet:')
    for (const b of bekannt) {
      console.log(`     ${b.datei}:${b.zeile}  ${b.tabelle}.${b.spalte} = '${b.wert}'`)
      console.log(`        ${BEKANNT.get(schluessel(b.tabelle, b.spalte))}`)
    }
    console.log()
  }

  if (neu.length > 0) {
    console.log('✗  NEUER BEFUND — dieser Schreibvorgang scheitert immer:')
    for (const b of neu) {
      console.log(`     ${b.datei}:${b.zeile}`)
      console.log(`        ${b.tabelle}.${b.spalte} = '${b.wert}'`)
      console.log(`        erlaubt: ${b.erlaubt.join(', ')}`)
    }
    console.log()
  }

  console.log('═══════════════════════════════════════════════════════════════════')
  if (spaltenBefunde.length > 0) {
    console.log('✗  NEUER BEFUND — diese Spalte gibt es nicht (42703):')
    for (const b of spaltenBefunde) {
      console.log(`     ${b.datei}:${b.zeile}`)
      console.log(`        ${b.tabelle}.${b.spalte}`)
      console.log('        Postgres weist eine unbekannte Spalte nicht einzeln ab —')
      console.log('        sie laesst die GANZE Abfrage scheitern.')
    }
    console.log()
  }

  const gesamtNeu = neu.length + spaltenBefunde.length
  console.log(` bekannte Befunde      : ${bekannt.length}`)
  console.log(` NEU: verbotener Wert  : ${neu.length}`)
  console.log(` NEU: fehlende Spalte  : ${spaltenBefunde.length}`)
  console.log(gesamtNeu === 0
    ? ' ✅ Kein Schreibvorgang, der nie gelingen kann.'
    : ' ❌ Mindestens ein Schreibvorgang kann nie gelingen.')
  console.log('═══════════════════════════════════════════════════════════════════')
  process.exit(gesamtNeu === 0 ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })
