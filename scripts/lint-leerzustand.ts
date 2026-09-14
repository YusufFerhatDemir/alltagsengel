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

/**
 * Blendet Kommentare aus — laengentreu, damit Zeilennummern und Ausschnitte
 * weiter auf den Originaltext zeigen.
 *
 * Ohne das zaehlte die Regel ihre eigene Dokumentation mit: `ladelage.ts`
 * erklaert im Kopfkommentar genau die Form, die sie verhindern soll, und
 * stand deshalb als Treffer im Bericht. Ein Beispiel in einem Kommentar ist
 * kein ausgefuehrter Code, und eine Zahl, die Erklaertexte mitzaehlt, ist
 * keine Zahl ueber die App.
 *
 * String-Literale bleiben stehen: sonst wuerde ein `'https://…'` als
 * Zeilenkommentar gelesen und verdeckte echten Code dahinter.
 */
export function ohneKommentare(quelle: string): string {
  let aus = ''
  let i = 0
  type Lage = 'code' | 'zeile' | 'block' | "'" | '"' | '`'
  let lage: Lage = 'code'
  while (i < quelle.length) {
    const z = quelle[i]
    const zwei = quelle.slice(i, i + 2)
    if (lage === 'code') {
      if (zwei === '//') { lage = 'zeile'; aus += '  '; i += 2; continue }
      if (zwei === '/*') { lage = 'block'; aus += '  '; i += 2; continue }
      if (z === "'" || z === '"' || z === '`') { lage = z; aus += z; i++; continue }
      aus += z; i++; continue
    }
    if (lage === 'zeile') {
      if (z === '\n') { lage = 'code'; aus += z; i++; continue }
      aus += ' '; i++; continue
    }
    if (lage === 'block') {
      if (zwei === '*/') { lage = 'code'; aus += '  '; i += 2; continue }
      aus += z === '\n' ? '\n' : ' '; i++; continue
    }
    // In einem String-Literal: Escapes ueberspringen, sonst bis zum Ende.
    if (z === '\\') { aus += quelle.slice(i, i + 2); i += 2; continue }
    if (z === lage) lage = 'code'
    aus += z; i++
  }
  return aus
}

/**
 * Dieselbe Form, gebuendelt:
 *
 *     const [aRes, bRes] = await Promise.all([
 *       supabase.from('x').select('*'),
 *       supabase.from('y').select('*'),
 *     ])
 *     setA(aRes.data || [])
 *
 * BEFUND (Block 79): die Regel oben kann das nicht sehen. Sie sucht
 * `const { data } = await supabase` — hier steht kein `data` in der
 * Zerlegung, sondern ein Ergebnisobjekt je Abfrage, und der verworfene
 * Fehler heisst dann `aRes.error`. Genau diese Form traegt die
 * Uebersichtsseiten des Betriebssystems: acht bis neunzehn Abfragen in
 * einem Aufruf, jede Auswertung mit `|| []` daneben.
 *
 * Der Schaden ist derselbe, den der Dateikopf beschreibt — nur groesser:
 * faellt EINE der acht Abfragen aus, zeigt die Seite ueberall Nullen und
 * meldet nichts.
 */
const PROMISE_ALL = /const\s*\[([^\]]+)\]\s*=\s*await\s+Promise\.all\(\[/g

/**
 * Steht der Name nahe genug an einer Stelle, die `.error` liest?
 *
 * Gemeint ist die Sammelpruefung:
 *
 *     const abfragen = [['Klienten', clientsRes], …]
 *     const gescheitert = abfragen.filter(([, r]) => r.error)
 *
 * Dort taucht `clientsRes.error` nie woertlich auf, geprueft wird er
 * trotzdem. 400 Zeichen sind der Abstand, den so eine Liste ueberbrueckt.
 */
function gebuendeltGeprueft(quelle: string, name: string): boolean {
  const NAEHE = 400
  const nameRe = new RegExp(`\\b${name}\\b`, 'g')
  let t: RegExpExecArray | null
  while ((t = nameRe.exec(quelle)) !== null) {
    const umfeld = quelle.slice(Math.max(0, t.index - NAEHE), t.index + NAEHE)
    if (/\.error\b/.test(umfeld)) return true
  }
  return false
}

/** Fenster hinter einem Promise.all-Block — diese Bloecke sind lang. */
const FENSTER_GEBUENDELT = 2500

function pruefeGebuendelt(quelle: string, rohQuelle: string, datei: string): Befund[] {
  const befunde: Befund[] = []
  PROMISE_ALL.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PROMISE_ALL.exec(quelle)) !== null) {
    const ab = m.index + m[0].length
    // Bis zur schliessenden Klammer des Arrays.
    let tiefe = 1
    let i = ab
    while (i < quelle.length && tiefe > 0) {
      const z = quelle[i]
      if (z === '[') tiefe++
      else if (z === ']') tiefe--
      i++
    }
    const block = quelle.slice(ab, i)
    if (!/\.from\(|\.rpc\(/.test(block)) continue

    const fenster = quelle.slice(i, i + FENSTER_GEBUENDELT)
    for (const roh of m[1].split(',')) {
      const name = roh.trim()
      // Nur einfache Bezeichner: `{ data: c }` traegt den Fehler gar nicht
      // erst, das ist die Form der Regel oben.
      if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue
      // Wird der Fehler IRGENDWO in der Datei gelesen, ist er nicht
      // verworfen. Bewusst grosszuegig: lieber eine Stelle zu wenig
      // melden als eine falsche.
      if (new RegExp(`\\b${name}\\.error\\b`).test(quelle)) continue
      // Auch die gebuendelte Form zaehlt: wer die Ergebnisse in eine Liste
      // legt und diese auf `.error` filtert, prueft sie ebenso — nur unter
      // einem anderen Namen. Eine Regel, die nur EINE Schreibweise gelten
      // laesst, erzieht zur Schreibweise statt zur Pruefung.
      if (gebuendeltGeprueft(quelle, name)) continue

      const leerliste = new RegExp(`\\b${name}\\.data\\s*(?:\\|\\||\\?\\?)\\s*\\[\\s*\\]`).exec(fenster)
      const zustand = new RegExp(`\\bset[A-Z]\\w*\\(\\s*${name}\\.data\\b`).exec(fenster)
      const treffer = leerliste ?? zustand
      if (!treffer) continue

      befunde.push({
        datei,
        zeile: quelle.slice(0, m.index).split('\n').length,
        variable: name,
        art: leerliste ? 'leerliste' : 'zustand',
        ausschnitt: rohQuelle
          .slice(i, i + FENSTER_GEBUENDELT)
          .slice(Math.max(0, treffer.index - 20), treffer.index + 90)
          .split('\n').map(z => z.trim()).filter(Boolean).slice(0, 2).join(' ').slice(0, 110),
      })
    }
  }
  return befunde
}

export function pruefeQuelle(rohQuelle: string, datei: string): Befund[] {
  const quelle = ohneKommentare(rohQuelle)
  const befunde: Befund[] = pruefeGebuendelt(quelle, rohQuelle, datei)
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
      ausschnitt: rohQuelle
        .slice(hinter, hinter + FENSTER)
        .slice(Math.max(0, treffer.index - 20), treffer.index + 90)
        .split('\n').map(z => z.trim()).filter(Boolean).slice(0, 2).join(' ').slice(0, 110),
    })
  }
  return befunde
}

/**
 * Bestand vom 14.09.2026 — 32 gebuendelte Stellen (Block 79: 85; seither
 * abgearbeitet in den Bloecken 80–83).
 *
 * ── WAS DIESE LISTE IST UND WAS NICHT ─────────────────────────
 * Sie deckt BEIDE Bereiche ab: die Renderdateien, in denen die Regel
 * blockiert, und lib/ + app/api, wo dieselbe Form in Entscheidungen
 * endet und von den Tests festgehalten wird.
 *
 * Sie ist KEINE Freigabe. Diese Uebersichtsseiten zeigen bei einer
 * gescheiterten Abfrage Nullen statt einer Meldung — genau der Schaden,
 * den der Dateikopf beschreibt. Sie sind eingefroren, damit die Zahl nur
 * noch sinken kann und NEUE Faelle den Lauf rot machen.
 *
 * Dass die Liste so lang ist, ist der Befund: die Form
 * `const [aRes, bRes] = await Promise.all([…])` stand bisher ausserhalb
 * der Regel, und deshalb ist sie in jeder zweiten Uebersichtsseite
 * gewachsen. Sie kommentarlos in einem Durchlauf abzuarbeiten waere
 * falsch — jede Seite braucht eine eigene Entscheidung, was sie statt der
 * Nullen zeigt.
 *
 * Wer eine davon anfasst: `.error` pruefen (auch gebuendelt ueber eine
 * Liste), im Render den Leerzustand nur ohne Fehler zeigen, und die Zeile
 * hier herausnehmen. Ein veralteter Eintrag macht den Lauf rot — siehe
 * `veraltet()`.
 *
 * `app/admin/dashboard/page.tsx` steht NICHT in dieser Liste: dort war der
 * Schaden am groessten (acht Abfragen, darunter beide Umsatzzahlen), und
 * die Seite ist mit Block 79 behoben.
 */
export const BESTAND_GEBUENDELT: { datei: string; variable: string }[] = [
  { datei: 'app/admin/bonuses/page.tsx', variable: 'boRes' },
  { datei: 'app/admin/bonuses/page.tsx', variable: 'cgRes' },
  { datei: 'app/admin/caregivers/page.tsx', variable: 'cgRes' },
  { datei: 'app/admin/clients/page.tsx', variable: 'budgetsRes' },
  { datei: 'app/admin/clients/page.tsx', variable: 'clientsRes' },
  { datei: 'app/admin/home/page.tsx', variable: 'bookingsRes' },
  { datei: 'app/admin/home/page.tsx', variable: 'profilesRes' },
  { datei: 'app/admin/home/page.tsx', variable: 'recentBookingsRes' },
  { datei: 'app/admin/home/page.tsx', variable: 'recentProfilesRes' },
  { datei: 'app/admin/partners/page.tsx', variable: 'pRes' },
  { datei: 'app/admin/partners/page.tsx', variable: 'vRes' },
  { datei: 'app/api/admin/krankenfahrten/route.ts', variable: 'providersRes' },
  { datei: 'app/api/admin/krankenfahrten/route.ts', variable: 'reviewsRes' },
  { datei: 'app/api/admin/krankenfahrten/route.ts', variable: 'ridesRes' },
  { datei: 'app/api/admin/pricing/route.ts', variable: 'audit' },
  { datei: 'app/api/admin/pricing/route.ts', variable: 'config' },
  { datei: 'app/api/admin/pricing/route.ts', variable: 'regions' },
  { datei: 'app/api/admin/pricing/route.ts', variable: 'surcharges' },
  { datei: 'app/api/admin/pricing/route.ts', variable: 'tiers' },
  { datei: 'app/api/ai-chat/route.ts', variable: 'bookingsRes' },
  { datei: 'app/api/ai-chat/route.ts', variable: 'usersRes' },
  { datei: 'app/api/ai-chat/route.ts', variable: 'visitorsRes' },
  { datei: 'app/mis/crm/page.tsx', variable: 'clientsRes' },
  { datei: 'app/mis/crm/page.tsx', variable: 'leadsRes' },
  { datei: 'app/mis/crm/page.tsx', variable: 'partnersRes' },
  { datei: 'app/mis/crm/page.tsx', variable: 'satisfactionRes' },
  { datei: 'app/mis/krankenfahrt-pricing/page.tsx', variable: 'configRes' },
  { datei: 'app/mis/krankenfahrt-pricing/page.tsx', variable: 'regionsRes' },
  { datei: 'app/mis/krankenfahrt-pricing/page.tsx', variable: 'surchargesRes' },
  { datei: 'app/mis/krankenfahrt-pricing/page.tsx', variable: 'tiersRes' },
  { datei: 'components/admin/AmpelSummaryWidget.tsx', variable: 'closingsRes' },
  { datei: 'components/admin/AmpelSummaryWidget.tsx', variable: 'recordsRes' },
]

export function imBestand(b: Befund): boolean {
  return BESTAND_GEBUENDELT.some(e => e.datei === b.datei && e.variable === b.variable)
}

/**
 * Eintraege, die keinen Befund mehr decken.
 *
 * Dieselbe Selbstpruefung wie in scripts/lint-stilles-update.ts (Block 68):
 * eine Ausnahmeliste, die ihre eigene Gueltigkeit nicht prueft, wird mit
 * jeder Behebung ein Stueck blinder — der behobene Fall bliebe fuer immer
 * von der Regel ausgenommen.
 */
export function veraltet(alle: Befund[], gescannt: string[]): typeof BESTAND_GEBUENDELT {
  // Nur Eintraege beurteilen, deren Datei ueberhaupt gescannt wurde: der
  // blockierende Lauf sieht nur app/ und components/, die Liste deckt auch
  // lib/ und app/api ab. Ohne diese Grenze saehe jeder Eintrag der anderen
  // Haelfte veraltet aus.
  const imUmfang = new Set(gescannt)
  return BESTAND_GEBUENDELT.filter(e => imUmfang.has(e.datei) && !alle.some(
    b => b.datei === e.datei && b.variable === e.variable,
  ))
}

function dateienSammeln(
  wurzel: string,
  treffer: string[] = [],
  muster: RegExp = /\.tsx$/,
): string[] {
  let eintraege: string[]
  try { eintraege = readdirSync(wurzel) } catch { return treffer }
  for (const e of eintraege) {
    if (UEBERSPRINGEN.includes(e)) continue
    const pfad = join(wurzel, e)
    if (statSync(pfad).isDirectory()) dateienSammeln(pfad, treffer, muster)
    else if (muster.test(pfad) && !/\.test\.tsx?$/.test(pfad)) treffer.push(pfad)
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

  const alle: Befund[] = []
  for (const d of dateien) {
    let quelle: string
    try { quelle = readFileSync(d, 'utf-8') } catch { continue }
    alle.push(...pruefeQuelle(quelle, d))
  }
  const befunde = alle.filter(b => !imBestand(b))

  // Der Veraltet-Riegel steht VOR der Entwarnung: stuende er danach,
  // meldete der Lauf bei sauberem Code gruen und erreichte die toten
  // Eintraege nie.
  //
  // Nur beim VOLLSCAN: `--staged` sieht nur die geaenderten Dateien, ein
  // Eintrag zu einer nicht gescannten Datei saehe dort faelschlich
  // veraltet aus.
  if (!nurStaged) {
    // Fuer die SELBSTPRUEFUNG auch lib/ und app/api mitlesen. Die Liste
    // deckt beide Bereiche ab; blockiert wird weiterhin nur in den
    // Renderdateien. Ohne diesen Zusatz waeren genau die Eintraege aus
    // lib/ und app/api dauerhaft unpruefbar — und ein dort behobener Fall
    // bliebe fuer immer von der Regel ausgenommen (Block 83).
    const weitereDateien = ['lib', 'app/api'].flatMap(w => dateienSammeln(w, [], /\.tsx?$/))
    const weitereBefunde = weitereDateien.flatMap(d => {
      try { return pruefeQuelle(readFileSync(d, 'utf-8'), d) } catch { return [] }
    })
    const tote = veraltet([...alle, ...weitereBefunde], [...dateien, ...weitereDateien])
    if (tote.length > 0) {
      console.error(`\n❌ lint-leerzustand: ${tote.length} Ausnahme(n) decken keinen Befund mehr:\n`)
      for (const e of tote) console.error(`  ${e.datei}  — ${e.variable}`)
      console.error(`
  Diese Zeilen gehoeren aus BESTAND_GEBUENDELT heraus. Solange sie stehen,
  wuerde ein Rueckfall an derselben Stelle als „im Bestand" durchgewunken.
`)
      process.exit(1)
    }
  }

  if (befunde.length === 0) {
    console.log(
      `✅ lint-leerzustand OK — ${dateien.length} Renderdateien gescannt${nurStaged ? ' (STAGED)' : ''}, `
      + '0 neue Leerzustaende aus verworfenen Fehlern'
      + (nurStaged ? '.' : ` (${BESTAND_GEBUENDELT.length} gebuendelte Stellen im Bestand).`),
    )
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
