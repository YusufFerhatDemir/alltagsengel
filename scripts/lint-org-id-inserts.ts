#!/usr/bin/env tsx
/**
 * lint-org-id-inserts.ts
 * ----------------------
 * Prevention-Control gegen Mandanten-Streuung in die Stamm-Organisation.
 *
 * DAS PROBLEM, das diese Regel abfaengt:
 * 190 Tabellen tragen live `organization_id NOT NULL DEFAULT current_org_id()`.
 * Diese Funktion liest `auth.uid()`. Beim Dienstschluessel (createAdminClient,
 * SERVICE_ROLE/SECRET_KEY) gibt es keinen angemeldeten Nutzer: die
 * Fallback-Kette (app_metadata.org_id → organization_members → caregivers →
 * clients) laeuft ins Leere und endet in einer FEST VERDRAHTETEN
 * Stamm-Organisation.
 *
 * Ein Dienstschluessel-Insert ohne `organization_id` legt die Zeile deshalb
 * beim falschen Mandanten ab. Die Wirkung geht in BEIDE Richtungen:
 *   - der eigene Mandant sieht sie nicht (der RESTRICTIVE org_fence filtert
 *     auf die eigene Organisation) — die Zeile ist verloren, nicht nur falsch;
 *   - die Stamm-Organisation sieht die Zeilen fremder Mandanten.
 *
 * ZWEI REGELN:
 *
 *   R1 „Dienstschluessel-Insert ohne Mandant"
 *      Ein Insert/Upsert in eine Tabelle aus org-default-tables.json, dessen
 *      Client im SELBEN File aus einer Dienstschluessel-Fabrik stammt und
 *      dessen Nutzlast keine organization_id setzt.
 *
 *   R2 „Modul kennt den Mandanten und schreibt ihn nicht"
 *      Eine exportierte Funktion, die einen `SupabaseClient` UND eine
 *      `organizationId` entgegennimmt, aber in eine org-default-Tabelle
 *      schreibt, ohne sie zu setzen. Diese Form ist der haeufigere Fall: das
 *      Modul weiss den Mandanten (fenced damit sogar seine Lesezugriffe) und
 *      laesst ihn beim Insert daneben weg.
 *
 * BEWUSSTE GRENZE — hier ehrlich benannt statt stillschweigend:
 * Ein Client, der ueber MEHRERE Module hinweg als Parameter durchgereicht
 * wird, ist statisch nicht sicher als Dienstschluessel erkennbar; dafuer
 * braeuchte es einen Aufrufgraphen. R2 deckt genau die Faelle ab, in denen
 * das Modul den Mandanten ohnehin schon kennt — den Rest deckt sie NICHT.
 * Diese Regel ist ein Tuersteher, kein Beweis.
 *
 * Aufruf:  tsx scripts/lint-org-id-inserts.ts
 * Konfig:  scripts/org-default-tables.json (generiert, siehe
 *          scripts/gen-org-default-tables.mjs)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const WURZEL = process.cwd()
const SCAN_VERZEICHNISSE = ['app', 'lib', 'components', 'scripts']
const AUSGESCHLOSSEN = new Set(['node_modules', '.next', '.git', '__tests__'])

const KONFIG = JSON.parse(
  readFileSync(join(WURZEL, 'scripts/org-default-tables.json'), 'utf-8')
) as { tabellen: string[] }
const ORG_TABELLEN = new Set(KONFIG.tabellen)

/** Fabriken, die einen Client MIT Dienstschluessel liefern. */
const DIENSTSCHLUESSEL_FABRIKEN =
  /(createAdminClient|getServiceClient|createServiceRoleClient|createServiceClient)/

const KLAMMER_AUF: Record<string, string> = { '(': ')', '{': '}', '[': ']' }

// ---- Quelltext-Hilfen -----------------------------------------------------

function stringEnde(src: string, j: number): number {
  const q = src[j]
  j++
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue }
    if (src[j] === q) return j + 1
    j++
  }
  return j
}

/** i zeigt auf eine oeffnende Klammer → Index HINTER der passenden schliessenden. */
function balanciert(src: string, i: number): number {
  const stapel: string[] = []
  let j = i
  while (j < src.length) {
    const c = src[j]
    if (c === '\'' || c === '"' || c === '`') { j = stringEnde(src, j); continue }
    if (KLAMMER_AUF[c]) stapel.push(KLAMMER_AUF[c])
    else if (c === ')' || c === '}' || c === ']') {
      if (stapel.length > 0 && stapel[stapel.length - 1] === c) {
        stapel.pop()
        if (stapel.length === 0) return j + 1
      }
    }
    j++
  }
  return src.length
}

/** Ende des Ausdrucks ab k (Klammertiefe 0, Zeilenende ohne Ketten-Fortsetzung). */
function ausdruckEnde(src: string, k: number): number {
  let tiefe = 0
  let j = k
  while (j < src.length) {
    const c = src[j]
    if (c === '\'' || c === '"' || c === '`') { j = stringEnde(src, j); continue }
    if (KLAMMER_AUF[c]) { tiefe++; j++; continue }
    if (c === ')' || c === '}' || c === ']') {
      if (tiefe === 0) return j
      tiefe--; j++; continue
    }
    if (c === ';' && tiefe === 0) return j
    if (c === '\n' && tiefe === 0) {
      const naechste = src.slice(j + 1, j + 200).trimStart()
      if (!naechste || (naechste[0] !== '.' && naechste[0] !== '?')) return j
    }
    j++
  }
  return src.length
}

/** Vollstaendiger Initialisierungs-Ausdruck von `const <name> = …`. */
function initialisierung(src: string, name: string): string {
  const d = new RegExp(`(?:const|let|var)\\s+${name}\\b\\s*(?::[^=\\n]*)?=\\s*`).exec(src)
  if (!d) return ''
  const k = d.index + d[0].length
  return src.slice(k, ausdruckEnde(src, k))
}

/**
 * Setzt die Nutzlast organization_id? Loest dabei Variablen auf:
 * `insert(zeile)`, `insert({ ...basis })`, `insert(rows)` mit
 * `const rows = xs.map(x => ({ organization_id, … }))`.
 */
function setztOrg(src: string, nutzlast: string, tiefe = 0, gesehen = new Set<string>()): boolean {
  if (nutzlast.includes('organization_id')) return true
  if (tiefe > 4) return false
  const innen = nutzlast.trim().replace(/^\(/, '').replace(/\)$/, '').trim()
  const namen = new Set<string>()
  for (const m of innen.matchAll(/\.\.\.(\w+)/g)) namen.add(m[1])
  const bar = /^(\w+)\s*(?:,|$)/.exec(innen)
  if (bar) namen.add(bar[1])
  for (const name of namen) {
    if (gesehen.has(name)) continue
    gesehen.add(name)
    // Transitiv: `upsert(nutzlast)` mit `const nutzlast = { ...zeile }` und
    // `const zeile = { organization_id, … }` setzt den Mandanten sehr wohl.
    const init = initialisierung(src, name)
    if (init && setztOrg(src, init, tiefe + 1, gesehen)) return true
    if (new RegExp(`\\b${name}\\s*\\.\\s*organization_id\\s*=`).test(src)) return true
    if (initialisierung(src, name).includes('organization_id')) return true
    // Schleifenvariable: `for (const zeile of zeilen)` → die Quelle pruefen
    const schleife = new RegExp(`for\\s*\\(\\s*(?:const|let)\\s+${name}\\s+of\\s+(\\w+)`).exec(src)
    if (schleife && initialisierung(src, schleife[1]).includes('organization_id')) return true
    if (schleife && new RegExp(`\\b${schleife[1]}\\s*\\.push\\s*\\(`).test(src)) {
      const push = new RegExp(`\\b${schleife[1]}\\s*\\.push\\s*\\(`).exec(src)!
      const auf = src.indexOf('(', push.index + push[0].length - 1)
      if (src.slice(auf, balanciert(src, auf)).includes('organization_id')) return true
    }
  }
  return false
}

// ---- Scan -----------------------------------------------------------------

export interface Treffer {
  regel: 'R1' | 'R2'
  datei: string
  zeile: number
  tabelle: string
  art: string
  variable: string
}

function dateienSammeln(verzeichnis: string, raus: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    if (AUSGESCHLOSSEN.has(eintrag)) continue
    const pfad = join(verzeichnis, eintrag)
    if (statSync(pfad).isDirectory()) dateienSammeln(pfad, raus)
    else if (/\.tsx?$/.test(eintrag) && !eintrag.includes('.test.')) raus.push(pfad)
  }
  return raus
}

/**
 * Prueft EINEN Quelltext. Ausgelagert und exportiert, damit die Regel selbst
 * pruefbar ist: die Tests fuehren die ALTE Form jeder behobenen Stelle noch
 * einmal aus und verlangen, dass sie hier auffaellt. Eine Lint-Regel, die
 * niemand gegen einen echten Treffer laufen laesst, beweist nichts.
 */
export function pruefeQuelltext(src: string, rel: string): Treffer[] {
  const treffer: Treffer[] = []

  // Welche Variablen stammen im SELBEN File aus einer Dienstschluessel-Fabrik?
  const dienstVars = new Set<string>()
  for (const m of src.matchAll(
    /(?:const|let|var)\s+(\w+)\s*(?::[^=\n]*)?=\s*(?:await\s+)?([\w.]*(?:createAdminClient|getServiceClient|createServiceRoleClient|createServiceClient))\s*\(/g
  )) dienstVars.add(m[1])

  // R2 greift, wenn das Modul den Mandanten ohnehin schon als Parameter hat.
  const kenntOrgParam =
    /\borganizationId\s*:\s*string/.test(src) || /\borgId\s*:\s*string/.test(src)
  const nimmtClient = /\b\w+\s*:\s*SupabaseClient/.test(src)

  for (const m of src.matchAll(/(\w+)\s*\n?\s*\.from\s*\(\s*['"`](\w+)['"`]\s*\)/g)) {
    const variable = m[1]
    const tabelle = m[2]
    if (!ORG_TABELLEN.has(tabelle)) continue
    const ab = m.index! + m[0].length
    const schwanz = src.slice(ab, ab + 200)
    const mi = /^\s*\.(insert|upsert)\s*\(/.exec(schwanz)
    if (!mi) continue
    const auf = ab + schwanz.indexOf('(', mi.index + mi[0].length - 1)
    const nutzlast = src.slice(auf, balanciert(src, auf))
    if (setztOrg(src, nutzlast)) continue

    const zeile = src.slice(0, m.index!).split('\n').length
    const istDienst =
      dienstVars.has(variable) ||
      (DIENSTSCHLUESSEL_FABRIKEN.test(src) && /^(admin|supabaseAdmin|adminClient|serviceClient)$/.test(variable))

    if (istDienst) {
      treffer.push({ regel: 'R1', datei: rel, zeile, tabelle, art: mi[1], variable })
    } else if (nimmtClient && kenntOrgParam) {
      treffer.push({ regel: 'R2', datei: rel, zeile, tabelle, art: mi[1], variable })
    }
  }
  return treffer
}

function pruefeDatei(pfad: string): Treffer[] {
  return pruefeQuelltext(readFileSync(pfad, 'utf-8'), relative(WURZEL, pfad))
}

function main() {
  const dateien = SCAN_VERZEICHNISSE
    .map((d) => join(WURZEL, d))
    .filter((d) => { try { return statSync(d).isDirectory() } catch { return false } })
    .flatMap((d) => dateienSammeln(d))

  const alle = dateien.flatMap(pruefeDatei)

  if (alle.length === 0) {
    console.log(
      `✅ lint-org-id-inserts OK — ${dateien.length} Dateien gescannt, ` +
      `${ORG_TABELLEN.size} Tabellen mit current_org_id()-Default, 0 Treffer.`
    )
    process.exit(0)
  }

  console.error(`\n❌ lint-org-id-inserts: ${alle.length} Insert(s) ohne organization_id.\n`)
  for (const t of alle) {
    console.error(`  ${t.datei}:${t.zeile}  [${t.regel}]`)
    console.error(`    ${t.variable}.from('${t.tabelle}').${t.art}(…) setzt kein organization_id.`)
    console.error(
      t.regel === 'R1'
        ? '    Der Client stammt aus einer Dienstschluessel-Fabrik. Ohne auth.uid()\n'
          + '    faellt der Spalten-Default current_org_id() in die Stamm-Organisation.'
        : '    Das Modul bekommt Client UND Mandant uebergeben, schreibt den Mandanten\n'
          + '    aber nicht mit. Laeuft der Aufrufer mit dem Dienstschluessel, landet die\n'
          + '    Zeile in der Stamm-Organisation.'
    )
    console.error('')
  }
  console.error('Abhilfe: organization_id ausdruecklich in die Nutzlast schreiben.')
  console.error('Ist die Stamm-Organisation wirklich richtig (oeffentliche Website ohne')
  console.error('Mandantenkontext), dann DEFAULT_ORG_ID ausdruecklich setzen — die Aussage')
  console.error('gehoert in den Code, nicht in einen fail-open-Rueckfall der Datenbank.\n')
  process.exit(1)
}

// Nur ausfuehren, wenn direkt aufgerufen — beim Import aus den Tests nicht.
if (process.argv[1] && process.argv[1].endsWith('lint-org-id-inserts.ts')) {
  main()
}
