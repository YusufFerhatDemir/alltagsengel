#!/usr/bin/env tsx
/**
 * lint-ladefehler.ts
 * ------------------
 * Prevention-Control gegen Weiterleitungen auf einen verworfenen Fehler.
 *
 * DAS PROBLEM, das diese Regel abfaengt (Befund 31.08.2026):
 *
 *   const { data: angel } = await supabase.from('angels')...single()
 *   if (!angel) return NextResponse.redirect(`${origin}/engel/register`)
 *
 * Der Fehler der Abfrage wird nicht destrukturiert, also verworfen.
 * Schlaegt sie fehl — RLS, Netz, Schema-Drift —, ist `angel` null, und die
 * Weiterleitung feuert, als gaebe es den Datensatz nicht. Ein laengst
 * registrierter Engel landete so bei jeder Stoerung erneut in der
 * Registrierung; im Anmelde-Callback wurde aus derselben Form eine
 * Pflegedienstleitung in die Kunden-App geschickt.
 *
 * „Kein Datensatz" und „nicht nachsehen koennen" sind verschiedene
 * Aussagen. Nur die erste rechtfertigt eine Weiterleitung. Wo der Code
 * beide gleich behandelt, trifft er ueber den Nutzer eine Entscheidung auf
 * einer Grundlage, die er gar nicht hat.
 *
 * DIE REGEL
 * Eine Supabase-Abfrage, die NUR `data` destrukturiert, und deren
 * Null-Pruefung im unmittelbaren Anschluss zu einer Weiterleitung fuehrt
 * (router.push/replace, redirect(), NextResponse.redirect,
 * window.location).
 *
 * Der Fix ist immer derselbe: `error` mitnehmen und ihn VOR der
 * Null-Pruefung getrennt behandeln — siehe lib/ui/ladelage.ts (`ladeZeile`
 * unterscheidet PGRST116 „keine Zeile" von einem echten Fehler).
 *
 * BEWUSSTE GRENZE:
 * Erkannt wird nur die Form „Abfrage, dann Null-Pruefung mit Weiterleitung"
 * innerhalb desselben Fensters. Wird das Ergebnis erst durch mehrere
 * Funktionen gereicht und woanders geprueft, sieht diese Regel es nicht.
 * Sie ist ein Tuersteher, kein Beweis.
 *
 * Aufruf:  tsx scripts/lint-ladefehler.ts
 *          tsx scripts/lint-ladefehler.ts --staged
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const WURZELN = ['app', 'components', 'lib']
const ENDUNGEN = ['.ts', '.tsx']
const UEBERSPRINGEN = ['node_modules', '.next', 'dist', 'out', '__tests__']

/** Nur `data` destrukturiert — `error` fehlt. */
const NUR_DATA = /const\s*\{\s*data(?:\s*:\s*(\w+))?\s*\}\s*=\s*await\s+supabase\b/g

/** Weiterleitungen, die auf eine Null-Pruefung folgen duerfen — aber nicht auf einen verworfenen Fehler. */
const WEITERLEITUNG = /router\.(push|replace)\s*\(|(?<!\w)redirect\s*\(|NextResponse\.redirect\s*\(|window\.location\s*(\.href\s*)?=/

export interface Befund {
  datei: string
  zeile: number
  variable: string
  ausschnitt: string
}

/** Fensterbreite hinter der Abfrage, in der die Null-Pruefung noch als „unmittelbar" gilt. */
const FENSTER = 600

export function pruefeQuelle(quelle: string, datei: string): Befund[] {
  const befunde: Befund[] = []
  NUR_DATA.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = NUR_DATA.exec(quelle)) !== null) {
    const variable = m[1] ?? 'data'
    // `auth.getUser()` liefert `{ data: { user } }`; dort ist null bereits
    // die Aussage „nicht angemeldet", und die Weiterleitung ist richtig.
    if (/^\s*\.?auth\b/.test(quelle.slice(m.index + m[0].length, m.index + m[0].length + 30))) continue

    const fenster = quelle.slice(m.index + m[0].length, m.index + m[0].length + FENSTER)
    const pruefung = new RegExp(`if\\s*\\(\\s*!${variable}\\b[^)]*\\)\\s*\\{?[^{}]{0,200}?(?=$|\\S)`).exec(fenster)
    if (!pruefung) continue
    const nachPruefung = fenster.slice(pruefung.index, pruefung.index + 260)
    if (!WEITERLEITUNG.test(nachPruefung)) continue

    befunde.push({
      datei,
      zeile: quelle.slice(0, m.index).split('\n').length,
      variable,
      ausschnitt: nachPruefung.split('\n').slice(0, 2).join(' ').trim().slice(0, 110),
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
    else if (ENDUNGEN.some(x => pfad.endsWith(x)) && !pfad.endsWith('.test.ts')) treffer.push(pfad)
  }
  return treffer
}

function main() {
  const nurStaged = process.argv.includes('--staged')
  let dateien: string[]
  if (nurStaged) {
    const aus = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf-8' })
    dateien = aus.split('\n').filter(Boolean)
      .filter(f => WURZELN.some(w => f.startsWith(w + '/')))
      .filter(f => ENDUNGEN.some(x => f.endsWith(x)) && !f.endsWith('.test.ts'))
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
    console.log(`✅ lint-ladefehler OK — ${dateien.length} Dateien gescannt${nurStaged ? ' (STAGED)' : ''}, 0 Weiterleitungen auf verworfene Fehler.`)
    return
  }

  console.error(`\n❌ lint-ladefehler: ${befunde.length} Weiterleitung(en) auf einen verworfenen Abfragefehler\n`)
  for (const b of befunde) {
    console.error(`  ${b.datei}:${b.zeile}  — \`${b.variable}\` ist null, wenn die Abfrage FEHLSCHLAEGT`)
    console.error(`      ${b.ausschnitt}`)
  }
  console.error(`
  Fix: den Fehler mitnehmen und VOR der Null-Pruefung getrennt behandeln.

      const { data: x, error } = await supabase...maybeSingle()
      if (error) { /* Fehler zeigen, NICHT weiterleiten */ }
      if (!x) { /* jetzt ist null wirklich \"kein Datensatz\" */ }

  Oder ladeZeile() aus lib/ui/ladelage.ts nutzen — die trennt PGRST116
  (\"keine Zeile\") von einem echten Fehler.
`)
  process.exit(1)
}

// Nur ausfuehren, wenn direkt aufgerufen — der Test importiert pruefeQuelle.
if (process.argv[1] && process.argv[1].includes('lint-ladefehler')) main()
