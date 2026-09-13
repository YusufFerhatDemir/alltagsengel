/**
 * lint-stilles-update — findet Schreibwege, die bei NULL getroffenen Zeilen
 * „erfolgreich" melden.
 *
 * ── DAS MUSTER ────────────────────────────────────────────────────────
 * PostgREST liefert bei einem `update()` oder `delete()`, das keine Zeile
 * trifft, **kein Fehlerobjekt**. Wer nur `error` prüft, bekommt
 * `error === null` und meldet der Oberfläche Erfolg — während in der
 * Datenbank nichts geschehen ist.
 *
 *     const { error } = await supabase.from('x').update({…}).eq('id', id)
 *     if (error) return { ok: false, … }
 *     return { ok: true }          // ← auch wenn 0 Zeilen betroffen waren
 *
 * Das passiert genau dann, wenn die Zeile einer anderen Organisation
 * gehört, schon abgeschlossen ist oder gar nicht existiert — also in jedem
 * Fall, der einen Hinweis verdient hätte. Die Oberfläche zeigt danach den
 * neuen Zustand an, die Datenbank behält den alten.
 *
 * Am 13.09.2026 dreimal gefunden: `setApplicationWiedervorlage`,
 * `updateClientPipeline`, `updateLeadStatus`.
 *
 * ── WAS ALS BEHOBEN GILT ──────────────────────────────────────────────
 * Ein `.select(…)` in der Kette. Damit liefert PostgREST die betroffenen
 * Zeilen zurück, und der Aufrufer kann auf `length === 0` prüfen. Ob er
 * das auch tut, sieht dieses Skript nicht — dafür sind die Tests da. Es
 * findet die Fälle, in denen es gar nicht erst möglich ist.
 *
 *     npm run lint:stilles-update
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const REPO = process.cwd()
/**
 * NUR Server Actions.
 *
 * Ein erster Lauf über `app` und `lib` fand 299 Stellen — die meisten davon
 * sind Stapelläufe und Automatisierungsketten, bei denen „keine Zeile
 * betroffen" ein zulässiges Ergebnis ist (nichts war fällig). Ein Tor, das
 * dort rot wird, wäre nach einer Woche abgeschaltet.
 *
 * Es täuscht genau dort, wo ein MENSCH eine Rückmeldung bekommt: in den
 * Server Actions, die eine Oberfläche aufruft und deren Rückgabe als
 * „gespeichert" angezeigt wird. Darauf ist die Prüfung begrenzt.
 */
const WURZELN = ['app']
const NUR_DATEIEN = /(^|\/)actions\.tsx?$/
const ENDUNGEN = ['.ts', '.tsx']

/** Verzeichnisse, die kein Anwendungscode sind. */
const AUS = new Set(['node_modules', '.next', 'dist', 'build', '__tests__', '__mocks__'])

interface Befund {
  datei: string
  zeile: number
  tabelle: string
  operation: string
  ausschnitt: string
}

function dateien(verzeichnis: string, raus: string[] = []): string[] {
  let eintraege: string[]
  try {
    eintraege = readdirSync(verzeichnis)
  } catch {
    return raus
  }
  for (const e of eintraege) {
    if (AUS.has(e)) continue
    const p = join(verzeichnis, e)
    if (statSync(p).isDirectory()) dateien(p, raus)
    else if (ENDUNGEN.some(x => e.endsWith(x)) && !e.includes('.test.') && NUR_DATEIEN.test(p)) raus.push(p)
  }
  return raus
}

/**
 * Nimmt die Kette ab `.from('tabelle')` bis zum Ende des Ausdrucks.
 *
 * Grob, aber ausreichend: gesucht wird nur, ob zwischen `.update(`/`.delete(`
 * und dem Ende der Anweisung ein `.select(` steht. Die Kette endet am
 * ersten Semikolon oder an einer Zeile, die eine neue Anweisung beginnt.
 */
function kette(text: string, start: number): string {
  const grenze = Math.min(text.length, start + 1200)
  const stueck = text.slice(start, grenze)
  const semikolon = stueck.indexOf('\n\n')
  return semikolon > 0 ? stueck.slice(0, semikolon) : stueck
}

function pruefe(datei: string): Befund[] {
  const text = readFileSync(datei, 'utf8')
  const befunde: Befund[] = []
  const muster = /\.from\(\s*['"`]([A-Za-z0-9_]+)['"`]\s*\)/g
  let m: RegExpExecArray | null

  while ((m = muster.exec(text)) !== null) {
    const k = kette(text, m.index)
    const schreibt = /\.(update|delete)\s*\(/.exec(k)
    if (!schreibt) continue
    // `.select(` irgendwo in derselben Kette → der Aufrufer KANN prüfen.
    if (/\.select\s*\(/.test(k)) continue
    // Ein `.throwOnError()` wirft auch ohne Treffer nicht, ist aber ein
    // bewusster Umgang mit dem Ergebnis — nicht Gegenstand dieser Prüfung.
    const zeile = text.slice(0, m.index).split('\n').length
    befunde.push({
      datei: relative(REPO, datei),
      zeile,
      tabelle: m[1],
      operation: schreibt[1],
      ausschnitt: k.split('\n').slice(0, 3).map(z => z.trim()).join(' ').slice(0, 100),
    })
  }
  return befunde
}

/**
 * Bestand vom 13.09.2026 — 69 Stellen.
 *
 * ── WAS DIESE LISTE IST UND WAS NICHT ─────────────────────────────────
 * Sie ist KEINE Freigabe. Keiner dieser Schreibwege ist geprüft; sie sind
 * eingefroren, damit die Zahl nur noch sinken kann und **neue** Fälle den
 * Lauf rot machen. Wer einen davon anfasst, hängt `.select('id')` an und
 * nimmt die Zeile hier heraus.
 *
 * Dass die Liste so lang ist, ist der Befund — nicht ihr Inhalt. Sie
 * kommentarlos abzuarbeiten wäre falsch: bei manchen dieser Wege ist „keine
 * Zeile betroffen" ein zulässiges Ergebnis, bei anderen eine stille Lüge.
 * Das entscheidet man je Fall, nicht in einem Durchlauf.
 *
 * Die Einträge sind eng gefasst (Datei + Tabelle + Operation): ein neuer
 * Fall in derselben Datei macht den Lauf trotzdem rot.
 */
const BESTAND: { datei: string; tabelle: string; operation: string }[] = [
  // BEGRUENDET: schliesst den bisher offenen Handzeichen-Eintrag
  // (.is('valid_until', null)). Beim ERSTEN Handzeichen gibt es noch
  // keinen offenen Eintrag — NULL Zeilen sind dort der Normalfall. Der
  // Fehlerfall wird seit 13.09.2026 geprueft, die Trefferzahl bewusst nicht.
  { datei: 'app/admin/caregivers/[id]/actions.ts', tabelle: 'caregiver_initials_history', operation: 'update' },
  // BEGRUENDET: loescht nach `verordnung_id` als erster Schritt eines
  // Ersetzungsvorgangs (alle Positionen weg, dann die neuen rein). NULL
  // getroffene Zeilen heisst hier: es gab noch keine Positionen. Das ist
  // der Normalfall bei einer frisch angelegten Verordnung, kein Fehler.
  { datei: 'app/admin/verordnungen/actions.ts', tabelle: 'verordnung_leistungen', operation: 'delete' },
  // BEGRUENDET: markiert Nachrichten einer Buchung als gelesen. NULL
  // getroffene Zeilen heisst: es gab nichts zu markieren. Haeufigster
  // Fall, kein Fehler — wie in app/kunde/chat.
  { datei: 'app/engel/chat/[id]/actions.ts', tabelle: 'messages', operation: 'update' },
  // BEGRUENDET: markiert ungelesene Nachrichten als gelesen
  // (.eq('read', false)). NULL getroffene Zeilen heisst: es gab nichts
  // Ungelesenes. Das ist der haeufigste Fall ueberhaupt und kein Fehler —
  // eine Leerpruefung wuerde hier bei jedem zweiten Aufruf Alarm schlagen.
  { datei: 'app/kunde/chat/[id]/actions.ts', tabelle: 'messages', operation: 'update' },
]

function passtZumBestand(b: Befund): boolean {
  return BESTAND.some(e => e.datei === b.datei && e.tabelle === b.tabelle && e.operation === b.operation)
}

function main() {
  const alle: Befund[] = []
  for (const w of WURZELN) {
    for (const d of dateien(join(REPO, w))) alle.push(...pruefe(d))
  }
  const neu = alle.filter(b => !passtZumBestand(b))

  console.log('── Stille Schreibvorgänge in Server Actions ────────────────')
  console.log(`   geprüft:           ${WURZELN.join(', ')}/**/actions.ts`)
  console.log(`   Treffer gesamt:    ${alle.length}`)
  console.log(`   im Bestand:        ${alle.length - neu.length}`)
  console.log('')

  if (neu.length === 0) {
    console.log('✓ Kein Befund.')
    return
  }

  console.log(`❌ ${neu.length} Schreibweg(e) ohne Rückmeldung:\n`)
  for (const b of neu) {
    console.log(`   ${b.datei}:${b.zeile}  [${b.operation} auf ${b.tabelle}]`)
    console.log(`      ${b.ausschnitt}`)
  }
  console.log('')
  console.log('   Abhilfe: `.select(\'id\')` an die Kette hängen und auf eine leere')
  console.log('   Trefferliste prüfen. Ohne sie meldet PostgREST bei NULL getroffenen')
  console.log('   Zeilen keinen Fehler — die Oberfläche zeigt dann den neuen Zustand,')
  console.log('   während die Datenbank den alten behält.')
  process.exit(1)
}

main()
