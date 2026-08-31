#!/usr/bin/env tsx
/**
 * lint-leerzustand.ts
 * -------------------
 * Prevention-Control gegen den Leerzustand als Aussage, die die App gar
 * nicht treffen kann.
 *
 * DAS PROBLEM (Befund 31.08.2026, Vollscan der Oberflaeche):
 *
 *   const { data } = await supabase.from('assignments').select('*')
 *   setEinsaetze(data || [])
 *   ...
 *   {einsaetze.length === 0 && <p>Keine Einsaetze</p>}
 *
 * Der Fehler wird nicht destrukturiert, also verworfen. Faellt die Abfrage
 * aus — RLS, Netz, Schema-Drift, abgelaufenes Token —, ist `data` null, die
 * Liste wird leer, und die Seite schreibt „Keine Einsaetze". Ein Engel liest
 * das morgens als Aussage ueber seinen Tag und faehrt nicht los, obwohl die
 * Einsaetze in der Datenbank stehen.
 *
 * „Nichts da" und „nicht nachsehen koennen" sind verschiedene Aussagen.
 * Der Leerzustand darf nur die erste behaupten.
 *
 * ABGRENZUNG ZU lint-ladefehler.ts
 * Die Schwesterregel faengt die WEITERLEITUNG auf einen verworfenen Fehler
 * („du bist nicht registriert" statt „ich konnte nicht nachsehen"). Diese
 * hier faengt die ANZEIGE: derselbe verworfene Fehler, aber er endet in
 * einer Liste oder einem Zustand, aus dem die Oberflaeche einen Leerzustand
 * rendert. Beide Formen kommen aus derselben Zeile Code, treffen den Nutzer
 * aber verschieden.
 *
 * DIE REGEL
 * In einer Renderdatei (.tsx unter app/ oder components/): eine
 * Supabase-Abfrage, die NUR `data` destrukturiert, deren Ergebnis
 * unmittelbar danach in einen Zustand oder eine Liste fliesst
 * (`setX(data)`, `data || []`, `data ?? []`).
 *
 * Der Fix ist immer derselbe: `ladeListe`/`ladeZeile` aus lib/ui/ladelage.ts
 * nutzen und `istFehler(...)` VOR dem Leerzustand abfragen — oder `error`
 * mitnehmen und getrennt behandeln.
 *
 * BEWUSSTE GRENZEN
 *  - Nur .tsx. Ein verworfener Fehler in einer API-Route ist ein eigener
 *    Fehlerfall (dort antwortet die Route), nicht der Leerzustand.
 *  - Nur das unmittelbare Fenster hinter der Abfrage. Wird `data` erst
 *    durch mehrere Funktionen gereicht, sieht diese Regel es nicht.
 *  - `auth.getUser()` ist ausgenommen: dort IST null bereits die Aussage
 *    „nicht angemeldet".
 * Sie ist ein Tuersteher, kein Beweis.
 *
 * ── UND WAS IST MIT lib/ UND app/api/? ───────────────────────────
 * Dort steht dieselbe Form, aber sie endet nicht im Leerzustand einer
 * Seite, sondern in einer Entscheidung — und Entscheidungen sind einzeln
 * zu beurteilen. Deshalb blockiert diese Regel dort nicht; `--bericht`
 * zaehlt nur.
 *
 * ZWEI ZAHLEN, WEIL ES ZWEI FRAGEN SIND (Stand 31.08.2026):
 *   41  findet `--bericht` mit GENAU dieser Regel (Bindung an `supabase`,
 *       Verwertung als Setter oder `|| []`).
 *   ~120 findet ein weiter gefasster Scan zusaetzlich: Abfragen ueber den
 *       Dienstschluessel (`await admin.from(...)`) und Verwertung durch
 *       Iteration (`for (const x of liste)`) statt durch einen Setter.
 * Die zweite Zahl steht hier, damit die erste nicht als Vollstaendigkeit
 * missverstanden wird. `--bericht` misst die erste — was es misst, misst
 * es genau.
 *
 * An den Geldwegen ist der verworfene Fehler dort ein FAIL-OPEN: das
 * Mahn-Sicherheitstor meldete „keine Beanstandung", der Gutschriftdeckel
 * liess den vollen Betrag ein zweites Mal durch, die SEPA-Sperre gegen
 * den Doppeleinzug war wirkungslos. Diese sind zu (mahn-safety-gate.ts,
 * dunning.ts, invoice-engine.ts, sepa-service.ts); der Rest ist
 * gesichtet, aber nicht durchgearbeitet.
 *
 * Aufruf:  tsx scripts/lint-leerzustand.ts
 *          tsx scripts/lint-leerzustand.ts --staged
 *          tsx scripts/lint-leerzustand.ts --bericht   (zaehlt lib/ + app/api, blockiert nie)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const WURZELN = ['app', 'components']
const UEBERSPRINGEN = ['node_modules', '.next', 'dist', 'out', '__tests__']

/** Nur `data` destrukturiert — `error` fehlt. */
const NUR_DATA = /const\s*\{\s*data(?:\s*:\s*(\w+))?\s*\}\s*=\s*await\s+supabase\b/g

/** Fensterbreite hinter der Abfrage, in der die Verwertung noch als „unmittelbar" gilt. */
const FENSTER = 700

export interface Befund {
  datei: string
  zeile: number
  variable: string
  art: 'zustand' | 'leerliste'
  ausschnitt: string
}

export function pruefeQuelle(quelle: string, datei: string): Befund[] {
  const befunde: Befund[] = []
  NUR_DATA.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = NUR_DATA.exec(quelle)) !== null) {
    const variable = m[1] ?? 'data'
    const hinter = m.index + m[0].length
    // `auth.getUser()` liefert `{ data: { user } }`; dort ist null bereits
    // die Aussage „nicht angemeldet".
    if (/^\s*\.?auth\b/.test(quelle.slice(hinter, hinter + 30))) continue

    const fenster = quelle.slice(hinter, hinter + FENSTER)

    // `x || []` / `x ?? []` — der verworfene Fehler WIRD hier zur leeren Liste.
    const leerliste = new RegExp(`\\b${variable}\\s*(?:\\|\\||\\?\\?)\\s*\\[\\s*\\]`).exec(fenster)
    // `setX(x` — der verworfene Fehler wird zum Anzeigezustand.
    const zustand = new RegExp(`\\bset[A-Z]\\w*\\(\\s*${variable}\\b`).exec(fenster)

    const treffer = leerliste ?? zustand
    if (!treffer) continue

    befunde.push({
      datei,
      zeile: quelle.slice(0, m.index).split('\n').length,
      variable,
      art: leerliste ? 'leerliste' : 'zustand',
      ausschnitt: fenster
        .slice(Math.max(0, treffer.index - 20), treffer.index + 90)
        .split('\n').map(z => z.trim()).filter(Boolean).slice(0, 2).join(' ').slice(0, 110),
    })
  }
  return befunde
}

function dateienSammeln(wurzel: string, treffer: string[] = []): string[] {
  let eintraege: string[]
  try { eintraege = readdirSync(wurzel) } catch { return treffer }
  for (const e of eintraege) {
    if (UEBERSPRINGEN.includes(e)) continue
    const pfad = join(wurzel, e)
    if (statSync(pfad).isDirectory()) dateienSammeln(pfad, treffer)
    else if (pfad.endsWith('.tsx') && !pfad.endsWith('.test.tsx')) treffer.push(pfad)
  }
  return treffer
}

/**
 * Zaehlt dieselbe Form in lib/ und app/api — ohne Urteil und ohne
 * Blockade. Die Regel oben kann hier nicht greifen: was ein verworfener
 * Fehler dort anrichtet, haengt am Aufrufer und ist nicht mechanisch
 * entscheidbar.
 */
function bericht(): void {
  const WEITERE = ['lib', 'app/api']
  const treffer: Record<string, number> = {}
  let gesamt = 0

  function sammeln(wurzel: string, aus: string[] = []): string[] {
    let eintraege: string[]
    try { eintraege = readdirSync(wurzel) } catch { return aus }
    for (const e of eintraege) {
      if (UEBERSPRINGEN.includes(e)) continue
      const pfad = join(wurzel, e)
      if (statSync(pfad).isDirectory()) sammeln(pfad, aus)
      else if (/\.tsx?$/.test(pfad) && !pfad.endsWith('.test.ts')) aus.push(pfad)
    }
    return aus
  }

  for (const w of WEITERE) {
    for (const d of sammeln(w)) {
      let quelle: string
      try { quelle = readFileSync(d, 'utf-8') } catch { continue }
      const n = pruefeQuelle(quelle, d).length
      if (n > 0) { treffer[d] = n; gesamt += n }
    }
  }

  console.log(`\nBERICHT — verworfene Abfragefehler in lib/ und app/api: ${gesamt} Stelle(n)\n`)
  console.log('Das ist die Zahl NACH DIESER Regel (Bindung an `supabase`, Setter oder `|| []`).')
  console.log('Ein weiter gefasster Scan — `await admin.from(...)`, Verwertung per Iteration —')
  console.log('findet mehr. Diese Zahl ist genau, aber nicht vollstaendig.\n')
  console.log('Kein Urteil: was ein verworfener Fehler dort anrichtet, haengt am Aufrufer.')
  console.log('An den Geldwegen war es ein Fail-open (Mahntor, Gutschriftdeckel, SEPA-Doppeleinzug) —')
  console.log('diese sind zu. Der Rest ist gesichtet, nicht durchgearbeitet.\n')
  for (const [datei, n] of Object.entries(treffer).sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    console.log(`  ${String(n).padStart(2)}  ${datei}`)
  }
  const rest = Object.keys(treffer).length - 25
  if (rest > 0) console.log(`  … und ${rest} weitere Datei(en)`)
}

function main() {
  if (process.argv.includes('--bericht')) { bericht(); return }
  const nurStaged = process.argv.includes('--staged')
  let dateien: string[]
  if (nurStaged) {
    const aus = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf-8' })
    dateien = aus.split('\n').filter(Boolean)
      .filter(f => WURZELN.some(w => f.startsWith(w + '/')))
      .filter(f => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
  } else {
    dateien = WURZELN.flatMap(w => dateienSammeln(w))
  }

  const befunde: Befund[] = []
  for (const d of dateien) {
    let quelle: string
    try { quelle = readFileSync(d, 'utf-8') } catch { continue }
    befunde.push(...pruefeQuelle(quelle, d))
  }

  if (befunde.length === 0) {
    console.log(`✅ lint-leerzustand OK — ${dateien.length} Renderdateien gescannt${nurStaged ? ' (STAGED)' : ''}, 0 Leerzustaende aus verworfenen Fehlern.`)
    return
  }

  console.error(`\n❌ lint-leerzustand: ${befunde.length} Stelle(n), an denen ein verworfener Abfragefehler als Leerzustand erscheint\n`)
  for (const b of befunde) {
    console.error(`  ${b.datei}:${b.zeile}  — \`${b.variable}\` ist null, wenn die Abfrage FEHLSCHLAEGT`)
    console.error(`      ${b.ausschnitt}`)
  }
  console.error(`
  Fix: lib/ui/ladelage.ts nutzen — sie trennt „nichts da" von „nicht ladbar".

      const lage = await ladeListe<Zeile>(supabase.from('x').select('*'), 'bereich:zweck')
      if (istFehler(lage)) { setFehler(LADEFEHLER_TEXT); return }
      setZeilen(zeilenVon(lage))

  Und im Render den Leerzustand nur zeigen, wenn KEIN Fehler anliegt.
`)
  process.exit(1)
}

// Nur ausfuehren, wenn direkt aufgerufen — der Test importiert pruefeQuelle.
if (process.argv[1] && process.argv[1].includes('lint-leerzustand')) main()
