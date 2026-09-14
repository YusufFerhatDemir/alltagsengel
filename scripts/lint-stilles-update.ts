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
/**
 * Server Actions UND API-Routen.
 *
 * ── WARUM DIE ROUTEN DAZUGEKOMMEN SIND (14.09.2026) ──────────────────
 * Die Begrenzung auf `actions.ts` hatte einen guten Grund: sie trifft
 * dort, wo ein MENSCH eine Rueckmeldung bekommt. Genau das gilt aber fuer
 * die interaktiven API-Routen ebenso — `/api/tours/[id]/vertretung`,
 * `/api/bookings/cancel` und `/api/admin/manage-role` werden von einer
 * Oberflaeche aufgerufen, deren Antwort als „gespeichert" angezeigt wird.
 * Sie standen nur deshalb nicht unter Beobachtung, weil das Muster
 * `actions.ts` sie nicht traf.
 *
 * Der erste Lauf ueber `app/api/**\/route.ts` fand 31 Stellen, darunter
 * vier mit echtem Schaden: die Kontoloeschung meldete „geloescht" ohne
 * getroffene Zeile, das Storno liess die widerrufene Leistung
 * abrechenbar, der Rollenwechsel liess `profiles` und `app_metadata`
 * auseinanderlaufen, und die Tour-Vertretung meldete eine Ruecknahme, die
 * nichts zuruecknahm. Die vier sind behoben, der Rest steht im BESTAND.
 *
 * `lib/` bleibt weiterhin aussen vor: dort liegen die Stapellaeufe, bei
 * denen „keine Zeile betroffen" das normale Ergebnis ist.
 */
const NUR_DATEIEN = /(^|\/)(actions|route)\.tsx?$/
const ENDUNGEN = ['.ts', '.tsx']

/** Verzeichnisse, die kein Anwendungscode sind. */
const AUS = new Set(['node_modules', '.next', 'dist', 'build', '__tests__', '__mocks__'])

export interface Befund {
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
export function kette(text: string, start: number): string {
  const grenze = Math.min(text.length, start + 1200)
  const stueck = text.slice(start, grenze)
  const semikolon = stueck.indexOf('\n\n')
  return semikolon > 0 ? stueck.slice(0, semikolon) : stueck
}

export function pruefe(datei: string): Befund[] {
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
export const BESTAND: { datei: string; tabelle: string; operation: string }[] = [
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

  // BEGRUENDET (Block 66): loescht den Fehlversuchszaehler nach einer
  // erfolgreichen Anmeldung. NULL getroffene Zeilen heisst hier: es gab
  // keinen Zaehler, weil sich niemand vertippt hat — der Normalfall. Der
  // FEHLER wird seit Block 66 geprueft und protokolliert, die Trefferzahl
  // bewusst nicht; die Begruendung steht bei `deleteEntry` im Code.
  { datei: 'app/api/auth/check-rate-limit/route.ts', tabelle: 'login_rate_limits', operation: 'delete' },

  // ── API-Routen, aufgenommen am 14.09.2026 ──────────────────────────
  // KEINE FREIGABE. Diese Wege sind nicht geprueft; sie sind eingefroren,
  // damit die Zahl nur noch sinken kann und NEUE Faelle den Lauf rot
  // machen. Wer einen davon anfasst, haengt `.select('id')` an, prueft auf
  // eine leere Trefferliste und nimmt die Zeile hier heraus.
  //
  // Die vier Faelle mit belegtem Schaden sind NICHT in dieser Liste — sie
  // wurden behoben: /api/user/delete (Loeschung meldete Erfolg ohne
  // getroffene Zeile), /api/bookings/cancel (Storno blieb aus, die
  // widerrufene Leistung damit abrechenbar), /api/admin/manage-role
  // (profiles und app_metadata liefen auseinander) und
  // /api/tours/[id]/vertretung (Ruecknahme meldete Erfolg, ohne
  // zurueckzunehmen).
  { datei: 'app/api/admin/abrechnung/sftp-key/route.ts', tabelle: 'datenannahmestellen', operation: 'update' },
  { datei: 'app/api/admin/biografiebogen/[clientId]/route.ts', tabelle: 'biografiebogen', operation: 'update' },
  { datei: 'app/api/admin/clients/[id]/status/route.ts', tabelle: 'clients', operation: 'update' },
  { datei: 'app/api/admin/ocr/route.ts', tabelle: 'ocr_results', operation: 'delete' },
  { datei: 'app/api/coach/consents/route.ts', tabelle: 'coach_consents', operation: 'update' },
  { datei: 'app/api/coach/freigaben/[id]/route.ts', tabelle: 'coach_shares', operation: 'update' },
  { datei: 'app/api/coach/freigaben/route.ts', tabelle: 'coach_shares', operation: 'update' },
  { datei: 'app/api/coach/loeschung/route.ts', tabelle: 'coach_nutzungsereignisse', operation: 'delete' },
  { datei: 'app/api/email/send/route.ts', tabelle: 'email_entwuerfe', operation: 'update' },
  { datei: 'app/api/fhir/import/route.ts', tabelle: 'clients', operation: 'update' },
  { datei: 'app/api/organizations/zertifikat/route.ts', tabelle: 'organizations', operation: 'update' },
  { datei: 'app/api/pflege/sturzprotokoll/route.ts', tabelle: 'pflege_verlauf', operation: 'update' },
  { datei: 'app/api/tours/[id]/stops/route.ts', tabelle: 'tour_stops', operation: 'delete' },
  { datei: 'app/api/user/delete/undo/route.ts', tabelle: 'profiles', operation: 'update' },
]

function passtZumBestand(b: Befund): boolean {
  return BESTAND.some(e => e.datei === b.datei && e.tabelle === b.tabelle && e.operation === b.operation)
}

/**
 * Eintraege, die nichts mehr decken.
 *
 * BEFUND (Block 68): die Liste oben sagt seit jeher „wer einen davon
 * anfasst, haengt `.select('id')` an und nimmt die Zeile hier heraus". Der
 * erste Teil geschah in den Bloecken 60-67 achtmal, der zweite nie. Acht
 * Eintraege deckten damit einen Befund, den es nicht mehr gab — und jeder
 * von ihnen war eine offene Tuer: waere das `.select('id')` in einer jener
 * Dateien wieder herausgefallen, haette dieser Lauf den Rueckfall als
 * „im Bestand" durchgewunken.
 *
 * Eine Ausnahmeliste, die ihre eigene Gueltigkeit nicht prueft, wird mit
 * jeder Behebung ein Stueck blinder. Ab hier macht ein veralteter Eintrag
 * den Lauf rot — dasselbe Verfahren wie `ausnahmeGiltNoch()` in
 * scripts/lint-schreibrecht.ts.
 */
export function veraltet(alle: Befund[]): typeof BESTAND {
  return BESTAND.filter(e => !alle.some(
    b => b.datei === e.datei && b.tabelle === e.tabelle && b.operation === e.operation,
  ))
}

function main() {
  const alle: Befund[] = []
  for (const w of WURZELN) {
    for (const d of dateien(join(REPO, w))) alle.push(...pruefe(d))
  }
  const neu = alle.filter(b => !passtZumBestand(b))
  const tote = veraltet(alle)

  console.log('── Stille Schreibvorgänge in Server Actions und API-Routen ─')
  console.log(`   geprüft:           ${WURZELN.join(', ')}/**/{actions,route}.ts`)
  console.log(`   Treffer gesamt:    ${alle.length}`)
  console.log(`   im Bestand:        ${alle.length - neu.length}`)
  console.log(`   Ausnahmen:         ${BESTAND.length}${tote.length > 0 ? `, davon ${tote.length} veraltet` : ''}`)
  console.log('')

  if (tote.length > 0) {
    console.log(`❌ ${tote.length} Ausnahme(n) decken keinen Befund mehr:\n`)
    for (const e of tote) {
      console.log(`   ${e.datei}  [${e.operation} auf ${e.tabelle}]`)
    }
    console.log('')
    console.log('   Diese Zeilen gehören aus BESTAND heraus. Solange sie stehen, würde')
    console.log('   ein Rückfall in derselben Datei als „im Bestand“ durchgewunken —')
    console.log('   die Ausnahme wäre dann keine Ausnahme mehr, sondern eine offene Tür.')
    console.log('')
    process.exit(1)
  }

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

// Nur als Lauf, nicht beim Import aus einem Test: `main()` beendet den
// Prozess bei einem Befund, und das darf ein Testlauf nicht tun.
if (process.argv[1] && process.argv[1].endsWith('lint-stilles-update.ts')) main()
