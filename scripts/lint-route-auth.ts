#!/usr/bin/env tsx
/**
 * lint-route-auth.ts
 * ------------------
 * Prevention-Control aus Track 7 (API-Routes Security Audit).
 *
 * ZWEI REGELN, beide gegen einen Befund vom 28.08.2026:
 *
 * ─── R1 „Rollenentscheidung aus EINER Quelle" ────────────────────────
 *
 * Das Projekt hat zwei nicht selbst beschreibbare Rollenquellen:
 * `profiles.role` und `app_metadata.role`. Die Entscheidungsregel steht in
 * lib/auth/rollen.ts: profiles ist BINDEND, app_metadata wirkt NUR
 * einschraenkend, gewaehrt wird die Schnittmenge.
 *
 * 49 API-Routen haben `profiles.select('role')` selbst gelesen und allein
 * daraus entschieden — darunter praktisch der gesamte Geldweg (DTA,
 * Rechnungen, Zahlungen, Monatsabschluss, Tarife). Fuer diese Routen war
 * eine Herabstufung, die nur im Token steht, WIRKUNGSLOS: das Gegenstueck
 * zu dem Befund, den Commit f45537f auf der anderen Seite behoben hat
 * (dort gewann app_metadata, und eine Herabstufung in der Datenbank blieb
 * wirkungslos). Ein Entzug, der zur Haelfte wirkt, ist keiner.
 *
 * Die Regel faengt jede Datei unter app/api, die `profiles.role` fuer den
 * ANGEMELDETEN NUTZER liest (`.eq('id', user.id)`). Der richtige Weg ist
 * `holeRollenQuellen()` / `holeRollenQuellenFuer()` mit `quellenDuerfen()`
 * aus lib/auth/rollen-quelle.ts — oder einer der Fach-Guards, die das
 * ihrerseits tun.
 *
 * ZWEI GRENZEN, ehrlich benannt statt verschwiegen:
 *
 *   a) Die Rolle einer ZIELPERSON wird NICHT gemeldet. Das ist richtig so
 *      (siehe AUFRUFER_GEFILTERT weiter unten), macht die Regel aber
 *      abhaengig davon, dass der Aufrufer wirklich `user.id` heisst. Wer
 *      den angemeldeten Nutzer in eine anders benannte Variable legt,
 *      laeuft an der Regel vorbei.
 *
 *   b) Die Regel prueft die HERKUNFT der Rolle, nicht ihre Verwendung. Sie
 *      meldet auch eine Route, die die eigene Rolle nur protokolliert. Das
 *      ist beabsichtigt: die Unterscheidung „gelesen" gegen „entschieden"
 *      ist statisch nicht verlaesslich, und ein Guard, der zwischen beidem
 *      raet, faengt genau die Zeile nicht, auf die es ankommt.
 *
 * Diese Regel ist damit ein Tuersteher, kein Beweis — dieselbe Einordnung
 * wie bei scripts/lint-org-id-inserts.ts.
 *
 * ─── R2 „Roher Wert in einer PostgREST-or()-Zeichenkette" ────────────
 *
 * `.eq('spalte', wert)` ist ungefaehrlich — der Wert geht als eigener
 * Parameter in die Anfrage. `.or(…)` nimmt dagegen EINE Zeichenkette, in
 * der PostgREST seine eigene Filtergrammatik liest: Kommas trennen
 * Bedingungen, Punkte trennen Spalte/Operator/Wert. Wer eine Sucheingabe
 * roh hineinschreibt, laesst den Suchenden Bedingungen ueber beliebige
 * Spalten der Tabelle anhaengen.
 *
 * Gemeldet wird jede `.or(`…`)`-Zeichenkette mit `${…}` in einem
 * `ilike`/`like`-Ausdruck, deren eingesetzter Wert nicht durch
 * `postgrestSuchwert()`/`postgrestWert()` gegangen ist (oder erkennbar
 * vorher entschaerft wurde).
 *
 * Nicht gemeldet werden die zahlreichen `.or('organization_id.eq.${…}')`-
 * Stellen: dort ist der eingesetzte Wert eine UUID aus dem Auth-Kontext,
 * kein Wert aus der Anfrage.
 *
 * Aufruf:  tsx scripts/lint-route-auth.ts
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const WURZEL = process.cwd()
const AUSGESCHLOSSEN = new Set(['node_modules', '.next', '.git', 'graphify-out', 'archive'])

export interface Treffer {
  datei: string
  zeile: number
  regel: 'R1' | 'R2'
  text: string
}

/**
 * Blendet Zeilen- und Blockkommentare aus, ohne die Zeilenzaehlung zu
 * verschieben (Inhalt wird durch Leerzeichen ersetzt, Umbrueche bleiben).
 *
 * Ohne das melden beide Regeln ihre eigenen Erklaertexte: die zeigen die
 * falsche Form ja gerade, damit man sie wiedererkennt.
 */
export function kommentarfrei(quelltext: string): string {
  return quelltext.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (treffer) =>
    treffer.replace(/[^\n]/g, ' '),
  )
}

// ───────────────────────────────────────────────────────────────────────
// R1 — Rollenlesung in einer API-Route
// ───────────────────────────────────────────────────────────────────────

/**
 * Erkennt `.from('profiles')` … `.select('role…')` … `.eq('id', <wer>)`
 * innerhalb desselben Ausdrucks. Zwischen den Gliedern duerfen
 * Zeilenumbrueche stehen (die Ketten in diesem Repo sind ueberwiegend
 * mehrzeilig), aber kein zweites `.from(`.
 */
const PROFILES_ROLLE =
  /\.from\(\s*['"]profiles['"]\s*\)(?![\s\S]{0,300}?\.from\()([\s\S]{0,300}?\.select\(\s*['"]role\b[\s\S]{0,200}?)(?=\.(?:single|maybeSingle)\(|$)/g

/**
 * Wessen Rolle wird gelesen?
 *
 * Nur die Rolle des AUFRUFERS ist eine Entscheidung ueber ihn selbst und
 * muss deshalb beide Quellen sehen. Wird die Rolle einer ZIELPERSON
 * gelesen (`/api/admin/reset-password` prueft, ob das Zielkonto geschuetzt
 * ist; die Loeschwege legen sie in den Audit-Schnappschuss), ist
 * `profiles` allein richtig: sie ist die bindende Quelle, und ein hoeherer
 * Wert im Token der Zielperson gewaehrt ihr ohnehin nichts.
 *
 * Die Regel meldet deshalb nur Ketten, die auf den angemeldeten Nutzer
 * gefiltert sind.
 */
const AUFRUFER_GEFILTERT = /\.eq\(\s*['"]id['"]\s*,\s*(?:user|caller|authUser|session\.user|data\.user)\.id\s*\)/

export function pruefeRollenquelle(quelltext: string, datei: string): Treffer[] {
  const treffer: Treffer[] = []
  const ohneKommentare = kommentarfrei(quelltext)
  PROFILES_ROLLE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PROFILES_ROLLE.exec(ohneKommentare))) {
    if (!AUFRUFER_GEFILTERT.test(m[1])) continue
    treffer.push({
      datei,
      zeile: ohneKommentare.slice(0, m.index).split('\n').length,
      regel: 'R1',
      text: "liest die eigene Rolle aus profiles statt ueber holeRollenQuellen()/quellenDuerfen()",
    })
  }
  return treffer
}

// ───────────────────────────────────────────────────────────────────────
// R2 — roher Wert in .or(`…`)
// ───────────────────────────────────────────────────────────────────────

/** `.or(` gefolgt von einer Zeichenkette in Backticks. */
const ODER_AUSDRUCK = /\.or\(\s*`([^`]*)`/g

/**
 * Einsetzungen in einem `ilike`/`like`-Teilausdruck. Nur diese Operatoren
 * nehmen freie Sucheingaben; `eq`/`is`/`gte` bekommen im Bestand
 * ausschliesslich Werte aus dem Auth-Kontext oder berechnete Daten.
 */
const SUCH_EINSETZUNG = /\b(?:i?like)\.[^,`]*\$\{([^}]+)\}/g

/** Ausdruecke, die den Wert nachweislich entschaerfen. */
const ENTSCHAERFT = /postgrestSuchwert|postgrestWert|\.replace\(/

export function pruefeOderFilter(rohtext: string, datei: string): Treffer[] {
  const treffer: Treffer[] = []
  // Kommentare zuerst entfernen: dieses Modul und die Erklaertexte in
  // lib/supabase/postgrest-filter.ts zeigen die FALSCHE Form absichtlich —
  // eine Regel, die ihre eigene Warnung meldet, wird abgeschaltet.
  const quelltext = kommentarfrei(rohtext)
  ODER_AUSDRUCK.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = ODER_AUSDRUCK.exec(quelltext))) {
    const inhalt = m[1]
    SUCH_EINSETZUNG.lastIndex = 0
    let e: RegExpExecArray | null
    while ((e = SUCH_EINSETZUNG.exec(inhalt))) {
      const wert = e[1].trim()
      if (ENTSCHAERFT.test(wert)) continue
      // Eine Variable gilt als entschaerft, wenn sie im selben File aus
      // postgrestSuchwert()/postgrestWert() stammt ODER erkennbar durch
      // ein .replace() gegangen ist (so entschaerft /api/fhir/Patient
      // seinen Namensfilter: es entfernt Komma, Punkt, Klammer und
      // Anfuehrungszeichen — die gesamte Filtergrammatik).
      const name = wert.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`(?:const|let)\\s+${name}\\s*=\\s*[^\\n]*(?:postgrestSuchwert|postgrestWert|\\.replace\\()`).test(quelltext)) {
        continue
      }
      treffer.push({
        datei,
        zeile: quelltext.slice(0, m.index).split('\n').length,
        regel: 'R2',
        text: `roher Wert \`${wert}\` in einem PostgREST-or()-Filter`,
      })
    }
  }
  return treffer
}

// ───────────────────────────────────────────────────────────────────────

function dateienSammeln(verzeichnis: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    if (AUSGESCHLOSSEN.has(eintrag)) continue
    const pfad = join(verzeichnis, eintrag)
    let s
    try { s = statSync(pfad) } catch { continue }
    if (s.isDirectory()) dateienSammeln(pfad, treffer)
    else if (/\.tsx?$/.test(eintrag) && !/\.test\.tsx?$/.test(eintrag)) treffer.push(pfad)
  }
  return treffer
}

function main(): void {
  const routenDateien = dateienSammeln(join(WURZEL, 'app/api'))
  // R2 gilt fuer den ganzen Serverquelltext, nicht nur fuer Routen: die
  // Suchfunktionen liegen in lib/**.
  const oderDateien = ['app', 'lib', 'components']
    .map((d) => join(WURZEL, d))
    .filter((d) => { try { return statSync(d).isDirectory() } catch { return false } })
    .flatMap((d) => dateienSammeln(d))

  const alle: Treffer[] = []
  for (const datei of routenDateien) {
    alle.push(...pruefeRollenquelle(readFileSync(datei, 'utf-8'), relative(WURZEL, datei)))
  }
  for (const datei of oderDateien) {
    alle.push(...pruefeOderFilter(readFileSync(datei, 'utf-8'), relative(WURZEL, datei)))
  }

  if (alle.length === 0) {
    console.log(
      `✅ lint-route-auth OK — ${routenDateien.length} Route-Dateien (R1), ` +
      `${oderDateien.length} Dateien (R2), 0 Treffer.`
    )
    process.exit(0)
  }

  console.error(`\n❌ lint-route-auth: ${alle.length} Treffer.\n`)
  for (const t of alle) {
    console.error(`  ${t.datei}:${t.zeile}  [${t.regel}] ${t.text}`)
    console.error(
      t.regel === 'R1'
        ? '    Abhilfe: holeRollenQuellenFuer(supabase, user) + quellenDuerfen(quellen, …)\n'
          + '    aus lib/auth/rollen-quelle.ts. profiles allein laesst eine Herabstufung\n'
          + '    in app_metadata wirkungslos.'
        : '    Abhilfe: postgrestSuchwert() aus lib/supabase/postgrest-filter.ts.\n'
          + '    In einer or()-Zeichenkette ist ein Komma ein Trennzeichen, kein Text.'
    )
    console.error('')
  }
  process.exit(1)
}

// Nur ausfuehren, wenn direkt aufgerufen — beim Import aus den Tests nicht.
if (process.argv[1] && process.argv[1].endsWith('lint-route-auth.ts')) {
  main()
}
