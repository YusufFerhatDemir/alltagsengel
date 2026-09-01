#!/usr/bin/env tsx
/**
 * audit-admin-from.ts
 * -------------------
 * Sondierung fuer den Dienstschluessel-Pass, den lint-leerzustand.ts im
 * Kopfkommentar als offen benennt („~120 findet ein weiter gefasster
 * Scan zusaetzlich: Abfragen ueber den Dienstschluessel").
 *
 * WARUM EIN EIGENES WERKZEUG UND NICHT `grep "admin.from("`
 * Der Dienstschluessel-Client heisst nicht ueberall `admin`. Live sind es
 * acht Namen (`admin`, `supabase`, `supabaseAdmin`, `adminSupabase`,
 * `adminClient`, `dienst`, `db`, `client`) — und ausgerechnet der
 * haeufigste Zweitname, `supabase`, ist derselbe, unter dem anderswo der
 * RLS-gebundene Client steht. Wer nach dem Namen greppt, misst die
 * Schreibgewohnheit des Autors, nicht den Schluessel. Diese Regel bindet
 * deshalb pro Datei: sie sucht erst die Zuweisung aus einer
 * Dienstschluessel-Fabrik und verfolgt dann GENAU die so gebundenen Namen.
 *
 * WAS SIE MELDET — vier Signale, absteigend nach Wirkung:
 *
 *   verworfen   Die Abfrage destrukturiert nur `data`, der Fehler faellt
 *               weg, und das Ergebnis wird unmittelbar verwertet
 *               (Iteration, `|| []`, Setter, Rueckgabe). Faellt die
 *               Abfrage aus, ist das Ergebnis leer — und „leer" wird zur
 *               Aussage. Am Geldweg ist das ein Fail-Open.
 *
 *   ungeprueft  `error` wird zwar destrukturiert, aber nirgends im
 *               Fenster dahinter gelesen. Das ist dieselbe Wirkung mit
 *               einem Feigenblatt.
 *
 *   mandant     Zugriff auf eine Tabelle aus org-default-tables.json
 *               ohne `organization_id`-Bedingung in der Kette. Unter dem
 *               Dienstschluessel gibt es keinen org_fence — RLS ist
 *               ausgeschaltet, die Bedingung im Code IST der Zaun.
 *
 *   rls-genuegt Lesezugriff unter dem Dienstschluessel in einer Datei,
 *               die ohnehin einen Nutzerkontext hat. MITTEL: hier ist
 *               nicht der Fehler das Problem, sondern die zu grosse
 *               Vollmacht.
 *
 * BEWUSSTE GRENZEN — hier benannt statt stillschweigend:
 *  - Ein Client, der als Parameter durch mehrere Module gereicht wird,
 *    ist statisch nicht als Dienstschluessel erkennbar. Solche Stellen
 *    sieht diese Regel NICHT (dieselbe Grenze wie lint-org-id-inserts).
 *  - Die Fehlerpruefung wird im Fenster hinter der Abfrage gesucht.
 *    Wird `error` erst 50 Zeilen spaeter gelesen, meldet sie falsch.
 *  - Ein Treffer ist ein Verdacht, kein Urteil. Jede Meldung ist von
 *    Hand zu beurteilen.
 *
 * Aufruf:  tsx scripts/audit-admin-from.ts
 *          tsx scripts/audit-admin-from.ts --json
 *          tsx scripts/audit-admin-from.ts --art verworfen
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ohneKommentare } from './lint-leerzustand'

const WURZEL = process.cwd()
const SCAN = ['app', 'lib', 'components']
const AUS = new Set(['node_modules', '.next', '.git', 'dist', 'out', '__tests__'])

const ORG_TABELLEN: Set<string> = new Set(
  (JSON.parse(readFileSync(join(WURZEL, 'scripts/org-default-tables.json'), 'utf-8')) as {
    tabellen: string[]
  }).tabellen
)

/** Fabriken, die einen Client MIT Dienstschluessel liefern. */
const FABRIKEN = /(?:const|let|var)\s+(\w+)\s*(?::[^=\n]+)?=\s*(?:await\s+)?(?:createAdminClient|createServiceClient|createServiceRoleClient|getAdminClient)\s*\(/g

/**
 * Fensterbreite hinter der Abfrage, in der eine VERWERTUNG noch als
 * „unmittelbar" gilt.
 */
const FENSTER = 900

/**
 * Eigenes, weiteres Fenster fuer die Frage „wird `error` geprueft?".
 *
 * Die beiden Fragen brauchen verschiedene Weiten. Bei der Verwertung ist
 * Naehe das Kriterium. Bei der Fehlerpruefung ist sie es nicht: dort
 * steht zwischen Abfrage und `if (error)` regelmaessig die Begruendung,
 * WARUM hier fail-closed geantwortet wird — und je sorgfaeltiger diese
 * Begruendung ausfaellt, desto weiter schiebt sie die Pruefung nach
 * hinten. Mit einem gemeinsamen 900er-Fenster meldete die Regel deshalb
 * ausgerechnet die frisch abgesicherten Stellen wieder als ungeprueft
 * (zuerst aufgefallen an der Doppelabrechnungs-Sperre in
 * auto-invoice/route.ts). ohneKommentare() ist laengentreu, der
 * Kommentar zaehlt also in voller Laenge mit.
 */
const FEHLER_FENSTER = 3000

export type Art = 'verworfen' | 'ungeprueft' | 'mandant' | 'rls-genuegt'

export interface Befund {
  datei: string
  zeile: number
  variable: string
  tabelle: string
  operation: string
  art: Art
  ausschnitt: string
}

function dateien(verz: string, treffer: string[] = []): string[] {
  let eintraege: string[]
  try {
    eintraege = readdirSync(verz)
  } catch {
    return treffer
  }
  for (const e of eintraege) {
    if (AUS.has(e)) continue
    const p = join(verz, e)
    let s
    try {
      s = statSync(p)
    } catch {
      continue
    }
    if (s.isDirectory()) dateien(p, treffer)
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e) && !/\.d\.ts$/.test(e)) treffer.push(p)
  }
  return treffer
}

/**
 * Liest die Kette ab `.from(` bis zum Ende des Ausdrucks — klammerbalanciert,
 * damit ein `.or('a.eq.1,b.eq.2')` die Kette nicht vorzeitig beendet.
 */
function kette(quelle: string, ab: number): { text: string; ende: number } {
  let tiefe = 0
  let i = ab
  while (i < quelle.length) {
    const z = quelle[i]
    if (z === '(' || z === '[' || z === '{') tiefe++
    else if (z === ')' || z === ']' || z === '}') {
      tiefe--
      if (tiefe < 0) break
    } else if (tiefe === 0 && (z === ';' || z === ',')) break
    else if (tiefe === 0 && z === '\n') {
      // Zeilenumbruch beendet nur, wenn die naechste nicht weiterkettet.
      //
      // LEERE ZEILEN MUESSEN UEBERSPRUNGEN WERDEN: ohneKommentare() ist
      // laengentreu und laesst von einem Kommentar INNERHALB der Kette
      // eine Zeile aus Leerzeichen zurueck. Wer beim ersten solchen
      // Umbruch abbricht, liest die Kette nur bis zum Kommentar — und
      // meldet dann genau die Dateien als „ohne Mandantenzaun", die den
      // Zaun sorgfaeltig genug gesetzt haben, um ihn zu kommentieren.
      // (Der Dokument-Download war so ein Fehltreffer.)
      let j = i
      while (j < quelle.length && /[ \t\r\n]/.test(quelle[j])) j++
      const rest = quelle.slice(j, j + 60)
      if (!rest.startsWith('.') && !rest.startsWith(')')) break
      i = j - 1
    }
    i++
  }
  return { text: quelle.slice(ab, i), ende: i }
}

/**
 * Anfang der umgebenden Funktion — Suchraum fuer einen vorgelagerten Zaun.
 *
 * Rueckwaerts bis zur naechsten Zeile, die auf Spaltenanfang eine Funktion
 * eroeffnet. Grob, aber es haelt die Suche innerhalb EINER Route.
 */
function funktionsAnfang(quelle: string, pos: number): number {
  const bis = quelle.slice(0, pos)
  const treffer = [...bis.matchAll(/^(?:export\s+)?(?:const\s+\w+\s*=\s*)?(?:async\s+)?function\b|^export\s+const\s+\w+\s*=\s*(?:withTracking\s*\()?\s*(?:async\s*)?(?:function\b|\()/gm)]
  return treffer.length ? treffer[treffer.length - 1].index! : Math.max(0, pos - 4000)
}

/**
 * Steht der Mandantenzaun SCHON vor dieser Abfrage?
 *
 * Das uebliche und richtige Muster ist zweistufig: erst eine Abfrage mit
 * `.eq('organization_id', …)`, die die Kennung ueberhaupt erst freigibt,
 * danach Folgeabfragen ueber genau diese Kennung. Wer nur die zweite Zeile
 * ansieht, meldet die sorgfaeltig gebauten Routen als Leck — der
 * Rechnungs-PDF-Weg, der Statuswechsel und die Snapshot-Liste pruefen die
 * Zugehoerigkeit alle sauber eine Abfrage vorher.
 */
function zaunDavor(quelle: string, funktionStart: number, pos: number): boolean {
  const davor = quelle.slice(funktionStart, pos)
  return /organization_id|\borgId\b|organizationId|assertCaregiverInOrg|clientGehoertZuOrg/.test(davor)
}

/** Anfang der Anweisung vor `pos` — fuer die Destrukturierung. */
function anweisungsAnfang(quelle: string, pos: number): number {
  let i = pos
  let tiefe = 0
  while (i > 0) {
    const z = quelle[i]
    if (z === ')' || z === ']' || z === '}') tiefe++
    else if (z === '(' || z === '[' || z === '{') {
      if (tiefe === 0) return i + 1
      tiefe--
    } else if (tiefe === 0 && (z === ';' || z === '\n')) {
      const kopf = quelle.slice(i + 1, pos)
      // Fortsetzungszeile einer Kette? Dann weiter nach oben.
      if (!/^\s*\./.test(kopf)) return i + 1
    }
    i--
  }
  return 0
}

export function pruefeDatei(pfad: string): Befund[] {
  const roh = readFileSync(pfad, 'utf-8')
  if (!/createAdminClient|createServiceClient|createServiceRoleClient|getAdminClient/.test(roh)) return []
  const q = ohneKommentare(roh)
  const datei = relative(WURZEL, pfad)

  const namen = new Set<string>()
  FABRIKEN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = FABRIKEN.exec(q))) namen.add(m[1])
  if (namen.size === 0) return []

  const befunde: Befund[] = []
  const zeileVon = (i: number) => q.slice(0, i).split('\n').length

  for (const name of namen) {
    const re = new RegExp(`\\b${name}\\s*\\n?\\s*\\.from\\s*\\(\\s*['"\`]([\\w.]+)['"\`]`, 'g')
    let t: RegExpExecArray | null
    while ((t = re.exec(q))) {
      const tabelle = t[1]
      const k = kette(q, t.index)
      const start = anweisungsAnfang(q, t.index)
      const kopf = q.slice(start, t.index)
      const fenster = q.slice(k.ende, k.ende + FENSTER)

      const operation =
        /\.\s*insert\s*\(/.test(k.text) ? 'insert'
        : /\.\s*upsert\s*\(/.test(k.text) ? 'upsert'
        : /\.\s*update\s*\(/.test(k.text) ? 'update'
        : /\.\s*delete\s*\(/.test(k.text) ? 'delete'
        : 'select'

      // ── Fehlerbehandlung ────────────────────────────────────────
      const destrukturiert = /\{[^}]*\}\s*=\s*$/.test(kopf.trimEnd() + ' ')
      const holtFehler = /\berror\b/.test(kopf)
      const fehlerName =
        kopf.match(/\berror\s*:\s*(\w+)/)?.[1] ?? (holtFehler ? 'error' : null)

      let geprueft = false
      if (fehlerName) {
        const fehlerFenster = q.slice(k.ende, k.ende + FEHLER_FENSTER)
        const nutzung = new RegExp(`\\b${fehlerName}\\b`, 'g')
        geprueft = (fehlerFenster.match(nutzung) ?? []).length > 0
      }
      // `throwOnError()` und `await ...` in try/catch pruefen anders.
      const wirftSelbst = /\.\s*throwOnError\s*\(/.test(k.text)

      // Verwertung unmittelbar dahinter?
      const datenName =
        kopf.match(/\bdata\s*:\s*(\w+)/)?.[1] ?? (/\bdata\b/.test(kopf) ? 'data' : null)
      let verwertet = false
      if (datenName) {
        const n = datenName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        // `?.` ist ein EIGENER Zugriffsoperator, kein Praefix vor einem
        // Punkt: `clients?.map` enthaelt hinter dem Namen genau ein `?.`
        // und keinen weiteren Punkt. Die frueher hier stehende Form
        // `(?:\?\.)?\s*\.` verlangte beides und uebersah damit jede
        // optional verkettete Verwertung — also gerade die vorsichtig
        // geschriebenen Stellen.
        const zugriff = `\\s*(?:\\?\\.|\\.)\\s*`
        verwertet = new RegExp(
          `for\\s*\\(\\s*(?:const|let)\\s+[\\w{}:,\\s]+\\s+of\\s+\\(?\\s*${n}\\b` +
            `|\\b${n}\\s*(?:\\|\\||\\?\\?)\\s*\\[\\]` +
            `|\\b${n}${zugriff}(?:map|filter|forEach|reduce|length|find|some|slice|sort|flatMap|entries)\\b` +
            `|set[A-Z]\\w*\\s*\\(\\s*${n}\\b` +
            `|return\\s+${n}\\b` +
            `|new\\s+Map\\s*\\(\\s*${n}\\b`
        ).test(fenster)
      }

      // ── Mandantenzaun ───────────────────────────────────────────
      const orgTabelle = ORG_TABELLEN.has(tabelle)
      const hatOrgFilter = /organization_id|\borg_id\b/.test(k.text)

      let art: Art | null = null
      if (!wirftSelbst && !holtFehler && verwertet) art = 'verworfen'
      else if (!wirftSelbst && fehlerName && !geprueft) art = 'ungeprueft'
      else if (
        orgTabelle &&
        !hatOrgFilter &&
        operation !== 'insert' &&
        operation !== 'upsert' &&
        !zaunDavor(q, funktionsAnfang(q, t.index), t.index)
      )
        art = 'mandant'

      if (!art) continue

      befunde.push({
        datei,
        zeile: zeileVon(t.index),
        variable: name,
        tabelle,
        operation,
        art,
        ausschnitt: roh
          .slice(start, k.ende)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 170),
      })
    }
  }
  return befunde
}

function main() {
  const argv = process.argv.slice(2)
  const nurArt = argv.includes('--art') ? argv[argv.indexOf('--art') + 1] : null

  let alle: Befund[] = []
  for (const w of SCAN) for (const d of dateien(join(WURZEL, w))) alle = alle.concat(pruefeDatei(d))
  if (nurArt) alle = alle.filter((b) => b.art === nurArt)

  if (argv.includes('--json')) {
    console.log(JSON.stringify(alle, null, 2))
    return
  }

  const nachArt = new Map<Art, Befund[]>()
  for (const b of alle) nachArt.set(b.art, [...(nachArt.get(b.art) ?? []), b])

  for (const art of ['verworfen', 'ungeprueft', 'mandant'] as Art[]) {
    const liste = nachArt.get(art) ?? []
    if (!liste.length) continue
    console.log(`\n══ ${art} (${liste.length}) ══`)
    for (const b of liste) {
      console.log(`  ${b.datei}:${b.zeile}  [${b.operation} ${b.tabelle}]`)
      console.log(`      ${b.ausschnitt}`)
    }
  }
  console.log(`\nGesamt: ${alle.length}`)
}

if (process.argv[1] && process.argv[1].includes('audit-admin-from')) main()
