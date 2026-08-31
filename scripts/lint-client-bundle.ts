#!/usr/bin/env tsx
/**
 * lint-client-bundle.ts
 * ---------------------
 * Prevention-Control fuer das Browser-Bundle.
 *
 * DAS PROBLEM: Was in einer Client-Komponente landet, laedt jeder Besucher
 * herunter — und ob etwas dort landet, entscheidet nicht die Datei selbst,
 * sondern die IMPORTKETTE bis zu ihr. Diese Kette sieht niemand beim Lesen
 * eines Diffs.
 *
 * Es gibt heute zwei Regeln, die genau so verabredet sind — und beide
 * standen bis 31.08.2026 nur als Kommentar im Quelltext:
 *
 *   R1 „server-only bleibt am Server"
 *      lib/supabase/admin.ts und die Sicherheitsspur importieren
 *      `server-only`. Das wirft zur LAUFZEIT, wenn der Code doch im Browser
 *      ausgefuehrt wird — also erst, wenn jemand die Seite oeffnet. Diese
 *      Regel zieht die Antwort auf den Zeitpunkt vor, an dem der Import
 *      geschrieben wird.
 *
 *   R2 „schwere Datentabellen bleiben am Server"
 *      lib/plz-coords.data.ts ist 176 KB. Ueber lib/plz-coords.ts haengen
 *      lib/plz-match.ts und lib/touren/fahrtzeit.ts daran; beide tragen
 *      den Hinweis „NICHT in Client-Komponenten importieren". Ein einziger
 *      unbedachter Import haengt 176 KB an ein Bundle, ohne dass irgendwo
 *      etwas rot wird.
 *
 * Beide Regeln waren zum Zeitpunkt der Einfuehrung erfuellt (0 Treffer).
 * Der Wert liegt nicht im Finden, sondern im Halten.
 *
 * ── 'use server' IST EINE GRENZE ──────────────────────────────────
 * Ein Modul mit 'use server' am Dateianfang ist eine Server-Action. Der
 * Client bekommt davon nur eine Referenz, nicht den Rumpf — die Importe
 * einer Action landen NICHT im Bundle. Wer das uebersieht, bekommt eine
 * Regel, die staendig Falschmeldungen produziert: eine erste Fassung
 * dieser Pruefung meldete fuenf „Lecks", die alle ueber
 * app/**\/actions.ts liefen und keine waren.
 *
 * ── BEWUSSTE GRENZE ───────────────────────────────────────────────
 * Die Aufloesung ist statisch und kennt nur relative und '@/'-Importe.
 * Dynamische Importe (`await import(...)`) sind ABSICHT — sie erzeugen
 * einen eigenen Abschnitt und werden nicht mitgezaehlt. Diese Regel ist
 * ein Tuersteher, kein Bundler.
 *
 * Aufruf:  tsx scripts/lint-client-bundle.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, normalize, relative, isAbsolute } from 'node:path'

const WURZEL = process.cwd()
const WURZELN = ['app', 'lib', 'components', 'hooks']
const UEBERSPRINGEN = ['node_modules', '.next', 'dist', 'out', '__tests__']

/** Module, die nie ueber eine Client-Komponente erreichbar sein duerfen. */
export const SCHWERE_SERVERMODULE: ReadonlyArray<{ pfad: string; grund: string }> = [
  {
    pfad: 'lib/plz-coords.data.ts',
    grund: '176 KB Koordinatentabelle — gehoert nicht in das Browser-Bundle '
      + '(siehe Hinweis in lib/plz-radius.ts und lib/touren/fahrtzeit.ts)',
  },
]

export interface Graph {
  imports: Map<string, string[]>
  useClient: Set<string>
  useServer: Set<string>
  serverOnly: Set<string>
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^;\n]*?from\s+['"]([^'"]+)['"]/g
/** 'use server' am Dateianfang, Kommentare davor erlaubt. */
const USE_SERVER_RE = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use server['"]/
const SERVER_ONLY_RE = /import\s+['"]server-only['"]/

function aufloesen(spez: string, von: string): string | null {
  let basis: string
  if (spez.startsWith('@/')) basis = join(WURZEL, spez.slice(2))
  else if (spez.startsWith('.')) basis = normalize(join(dirname(isAbsolute(von) ? von : join(WURZEL, von)), spez))
  else return null
  for (const k of [basis + '.ts', basis + '.tsx', join(basis, 'index.ts'), join(basis, 'index.tsx'), basis]) {
    try { if (statSync(k).isFile()) return relative(WURZEL, k) } catch { /* weiter */ }
  }
  return null
}

function dateienSammeln(wurzel: string, treffer: string[] = []): string[] {
  let eintraege: string[]
  try { eintraege = readdirSync(wurzel) } catch { return treffer }
  for (const e of eintraege) {
    if (UEBERSPRINGEN.includes(e)) continue
    const p = join(wurzel, e)
    if (statSync(p).isDirectory()) dateienSammeln(p, treffer)
    else if ((p.endsWith('.ts') || p.endsWith('.tsx')) && !p.endsWith('.test.ts')) treffer.push(p)
  }
  return treffer
}

export function baueGraph(dateien: string[]): Graph {
  const imports = new Map<string, string[]>()
  const useClient = new Set<string>()
  const useServer = new Set<string>()
  const serverOnly = new Set<string>()
  for (const p of dateien) {
    let s: string
    try { s = readFileSync(p, 'utf-8') } catch { continue }
    const kopf = s.slice(0, 400)
    if (kopf.includes("'use client'") || kopf.includes('"use client"')) useClient.add(p)
    if (USE_SERVER_RE.test(s)) useServer.add(p)
    if (SERVER_ONLY_RE.test(s)) serverOnly.add(p)
    const ziele: string[] = []
    IMPORT_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = IMPORT_RE.exec(s)) !== null) {
      const z = aufloesen(m[1], p)
      if (z) ziele.push(z)
    }
    imports.set(p, ziele)
  }
  return { imports, useClient, useServer, serverOnly }
}

/**
 * Alle Module, die ab einer Client-Komponente erreichbar sind — mit dem
 * Weg dorthin, damit ein Treffer sofort behebbar ist.
 *
 * 'use server' beendet die Suche: der Rumpf einer Server-Action wandert
 * nicht ins Bundle.
 */
export function clientGraph(g: Graph): Map<string, string[]> {
  const weg = new Map<string, string[]>()
  const stapel: Array<[string, string[]]> = []
  for (const p of g.useClient) { weg.set(p, [p]); stapel.push([p, [p]]) }
  while (stapel.length) {
    const [k, w] = stapel.pop()!
    if (g.useServer.has(k) && !g.useClient.has(k)) continue
    for (const i of g.imports.get(k) ?? []) {
      if (weg.has(i)) continue
      const neu = [...w, i]
      weg.set(i, neu)
      stapel.push([i, neu])
    }
  }
  return weg
}

export interface BundleBefund {
  modul: string
  regel: 'server-only' | 'schwer'
  grund: string
  weg: string[]
}

export function pruefeGraph(g: Graph): BundleBefund[] {
  const erreichbar = clientGraph(g)
  const befunde: BundleBefund[] = []
  for (const p of g.serverOnly) {
    const w = erreichbar.get(p)
    if (w && !g.useClient.has(p)) {
      befunde.push({ modul: p, regel: 'server-only', grund: "importiert 'server-only'", weg: w })
    }
  }
  for (const { pfad, grund } of SCHWERE_SERVERMODULE) {
    const w = erreichbar.get(pfad)
    if (w) befunde.push({ modul: pfad, regel: 'schwer', grund, weg: w })
  }
  return befunde
}

function main() {
  const dateien = WURZELN.flatMap(w => dateienSammeln(w))
  const g = baueGraph(dateien)
  const befunde = pruefeGraph(g)

  if (befunde.length === 0) {
    console.log(
      `✅ lint-client-bundle OK — ${dateien.length} Dateien, `
      + `${g.useClient.size} Client-Komponenten, ${g.useServer.size} Server-Actions (Grenze), `
      + `${clientGraph(g).size} Module im Client-Graphen, 0 Treffer.`,
    )
    return
  }

  console.error(`\n❌ lint-client-bundle: ${befunde.length} Modul(e) im Browser-Bundle, die dort nicht hingehoeren\n`)
  for (const b of befunde) {
    console.error(`  ${b.modul}`)
    console.error(`      Regel : ${b.regel} — ${b.grund}`)
    console.error(`      Weg   : ${b.weg.join(' → ')}`)
  }
  console.error(`
  Fix: den Import aus der Client-Komponente entfernen. Ueblich sind zwei Wege:
    • die Berechnung in eine Server-Action ('use server') oder eine API-Route
      verlagern und nur das Ergebnis an den Client geben;
    • bei grossen Tabellen: dynamisch nachladen (await import(...)), damit
      der Bundler einen eigenen Abschnitt daraus macht.
`)
  process.exit(1)
}

if (process.argv[1] && process.argv[1].includes('lint-client-bundle')) main()
