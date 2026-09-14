/**
 * lint-zeilendeckel — findet Auswertungen ueber eine ungedeckelte Abfrage
 * auf einer Tabelle, die ohne Obergrenze waechst.
 *
 * ── DAS MUSTER ────────────────────────────────────────────────────────
 * PostgREST deckelt die zurueckgegebene Darstellung. LIVE GEMESSEN am
 * 14.09.2026: ein `select` auf page_views (10 359 Zeilen) liefert ohne
 * `limit` genau 1000 — HTTP 200, kein Fehler, keine Warnung. Die Wahrheit
 * steht allein im Header:
 *
 *     Content-Range: 0-999/10359
 *
 * Wer darueber summiert, zaehlt, filtert oder eine Vollstaendigkeit
 * behauptet, rechnet ab der tausendsten Zeile falsch, ohne dass
 * irgendetwas rot wird.
 *
 *     const { data } = await supabase.from('service_records').select(…)
 *     const summe = (data ?? []).reduce(…)      // ← ab 1001 zu klein
 *
 * ── WARUM NUR EINE AUSWAHL VON TABELLEN ───────────────────────────────
 * Ein Lauf ueber ALLE Tabellen findet 265 Stellen. Die allermeisten davon
 * lesen etwas, das je Kunde, Monat oder Vorgang eine natuerliche
 * Obergrenze hat — die Rechnungen EINES Klienten in EINEM Jahr werden nie
 * tausend. Ein Tor, das dort rot wird, waere nach einer Woche
 * abgeschaltet.
 *
 * Beobachtet werden deshalb nur Tabellen, die je EREIGNIS wachsen und
 * keine solche Grenze haben. Die Liste steht unten, mit den live
 * gemessenen Zeilenzahlen.
 *
 * ── WAS ALS BEHOBEN GILT ──────────────────────────────────────────────
 * Entweder eine ausdrueckliche Begrenzung (`.limit()`, `.range()`), eine
 * Einzelzeile (`.single()`, `.maybeSingle()`), eine reine Zaehlung
 * (`count: 'exact'`) — oder der Seitenleser `leseAlle()` aus
 * lib/db/alle-zeilen.ts, wenn wirklich ALLE Zeilen gebraucht werden.
 *
 *     npm run lint:zeilendeckel
 */

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const REPO = process.cwd()
const WURZELN = ['lib', 'app']
const ENDUNGEN = ['.ts', '.tsx']
const AUS = new Set(['node_modules', '.next', 'dist', 'build', '__tests__', '__mocks__', 'out'])

/**
 * Tabellen, die je EREIGNIS wachsen — ohne Obergrenze je Kunde, Monat
 * oder Vorgang. Live-Zeilen am 14.09.2026, wo ueber 100.
 *
 * Wer hier eine Tabelle ergaenzt, verschaerft die Pruefung; wer eine
 * entfernt, muss begruenden, welche natuerliche Grenze sie hat.
 */
export const UNBEGRENZT: readonly string[] = [
  'page_views',               // 10 359
  'analytics_events',         //  8 690
  'visitor_locations',        //  4 222
  'visitors',                 //  3 763
  'api_rate_limits',          //  1 857
  'wf_audit_log',             //    348
  'mis_auth_log',             //    278
  'notifications',            //    269
  'zustellung_retry_laeufe',  //    224
  'wf_events',                //    171
  'state_settings_audit',     //    160
  'security_audit_log',       //    128
  'mis_audit_log',            //    127
  // Noch klein, aber wachsen je Einsatz bzw. je Zustellversuch:
  'service_records',
  'notification_delivery_log',
  'billing_audit_trail',
  'personal_audit_log',
  'mis_privacy_audit_log',
  'audit_logs',
  'geo_events',
  'offline_queue',
  'kf_pricing_audit',
  'dta_fehlerprotokoll',
  'dta_validierungen',
  'conversions',
]

export interface Befund {
  datei: string
  zeile: number
  tabelle: string
  variable: string
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
    else if (ENDUNGEN.some(x => e.endsWith(x)) && !e.includes('.test.')) raus.push(p)
  }
  return raus
}

const UNBEGRENZT_SATZ = new Set(UNBEGRENZT)

export function pruefeQuelle(text: string, datei: string): Befund[] {
  const befunde: Befund[] = []
  const muster =
    /const\s*\{\s*data:?\s*([\w]*)[^}]*\}\s*=\s*await\s+[\w.]*\s*\n?\s*\.from\(\s*['"`]([A-Za-z0-9_]+)['"`]\s*\)([\s\S]{0,700}?)(?:\n\n|;\n)/g
  let m: RegExpExecArray | null

  while ((m = muster.exec(text)) !== null) {
    const tabelle = m[2]
    if (!UNBEGRENZT_SATZ.has(tabelle)) continue

    const kette = m[3]
    // Ausdrueckliche Begrenzung, Einzelzeile oder reine Zaehlung: dann
    // ist die Menge eine Entscheidung und kein Zufall.
    if (/\.limit\(|\.range\(|\.single\(|\.maybeSingle\(|count:\s*['"]/.test(kette)) continue

    const name = m[1] || 'data'
    const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 1200)
    const esc = name.replace(/[.$]/g, '\\$&')
    const ausgewertet =
      new RegExp(`\\b${esc}\\b[^\\n]{0,200}?\\.(reduce|length|filter|map|some|every)\\b`).test(rest)
      || new RegExp(`\\(${esc}\\s*\\?\\?\\s*\\[\\]\\)`).test(rest)
      || new RegExp(`\\(${esc}\\s*\\|\\|\\s*\\[\\]\\)`).test(rest)
    if (!ausgewertet) continue

    befunde.push({
      datei,
      zeile: text.slice(0, m.index).split('\n').length,
      tabelle,
      variable: name,
    })
  }
  return befunde
}

export function pruefe(datei: string): Befund[] {
  return pruefeQuelle(readFileSync(datei, 'utf8'), relative(REPO, datei))
}

/**
 * Bestand vom 14.09.2026 — 13 Stellen.
 *
 * KEINE FREIGABE. Keine dieser Auswertungen ist gegen die Obergrenze
 * abgesichert; sie sind eingefroren, damit die Zahl nur noch sinken kann
 * und NEUE Faelle den Lauf rot machen.
 *
 * Dass keine davon HEUTE falsch rechnet, liegt allein an den
 * Bestandszahlen: `service_records` steht live bei 30 Zeilen. Die Grenze
 * ist nicht fern — ein Monat mit taeglicher Betreuung fuer die
 * 37 Klienten der Stamm-Organisation liegt darueber.
 *
 * Die Eintraege sind eng gefasst (Datei + Tabelle): ein neuer Fall in
 * derselben Datei auf eine andere beobachtete Tabelle macht den Lauf
 * trotzdem rot.
 */
export const BESTAND: { datei: string; tabelle: string }[] = [
  { datei: 'lib/abrechnung/korrekturlaeufe.ts', tabelle: 'dta_fehlerprotokoll' },
  { datei: 'lib/abrechnung/leistungsnachweis-pdf.ts', tabelle: 'service_records' },
  { datei: 'lib/abrechnung/sgb-v/leistungsnachweis-service.ts', tabelle: 'service_records' },
  { datei: 'lib/analytics/bonusEngine.ts', tabelle: 'service_records' },
  { datei: 'lib/automation/monatsabschluss-pruefung.ts', tabelle: 'service_records' },
  { datei: 'lib/billing/nachweis-beleg.ts', tabelle: 'service_records' },
  { datei: 'lib/billing/tarif-zuordnung.ts', tabelle: 'service_records' },
  { datei: 'lib/notifications/zustellrueckmeldung.ts', tabelle: 'notification_delivery_log' },
  { datei: 'lib/pilot/allocation-gate.ts', tabelle: 'billing_audit_trail' },
  { datei: 'lib/security/alarmspur.ts', tabelle: 'notification_delivery_log' },
  // Je Klient und Zeitraum — die natuerliche Grenze ist hoeher als
  // gedacht, aber vorhanden. Steht hier, weil die Tabelle beobachtet wird.
  { datei: 'app/api/billing/invoices/create/route.ts', tabelle: 'service_records' },
  { datei: 'app/api/tours/[id]/stops/route.ts', tabelle: 'service_records' },
]

export function imBestand(b: Befund): boolean {
  return BESTAND.some(e => e.datei === b.datei && e.tabelle === b.tabelle)
}

/**
 * Eintraege, die keinen Befund mehr decken.
 *
 * Ohne diese Gegenprobe bliebe eine aufgeraeumte Stelle als offene Tuer
 * in der Liste stehen. Dieselbe Regel wie in lint-stilles-update,
 * lint-leerzustand und lint-blinder-insert.
 */
export function veraltet(alle: Befund[]): typeof BESTAND {
  return BESTAND.filter(e => !alle.some(b => b.datei === e.datei && b.tabelle === e.tabelle))
}

function main() {
  const alle: Befund[] = []
  for (const w of WURZELN) {
    for (const d of dateien(join(REPO, w))) alle.push(...pruefe(d))
  }
  const neu = alle.filter(b => !imBestand(b))
  const tote = veraltet(alle)

  console.log('── Auswertung ueber eine ungedeckelte Abfrage ──────────────')
  console.log(`   beobachtete Tabellen: ${UNBEGRENZT.length}`)
  console.log(`   Treffer gesamt:       ${alle.length}`)
  console.log(`   im Bestand:           ${alle.length - neu.length}`)
  console.log(`   Ausnahmen:            ${BESTAND.length}${tote.length > 0 ? `, davon ${tote.length} veraltet` : ''}`)
  console.log('')

  if (tote.length > 0) {
    console.log(`❌ ${tote.length} Ausnahme(n) decken keinen Befund mehr:\n`)
    for (const e of tote) console.log(`   ${e.datei}  [${e.tabelle}]`)
    console.log('')
    console.log('   Diese Zeilen gehören aus BESTAND heraus. Solange sie stehen, käme')
    console.log('   ein Rückfall in derselben Datei auf dieselbe Tabelle als „im')
    console.log('   Bestand" durch — die Ausnahme wäre dann eine offene Tür.')
    console.log('')
    process.exit(1)
  }

  if (neu.length === 0) {
    console.log('✓ Kein Befund.')
    return
  }

  console.log(`❌ ${neu.length} Auswertung(en) ohne Obergrenze:\n`)
  for (const b of neu) {
    console.log(`   ${b.datei}:${b.zeile}  [${b.tabelle} → ${b.variable}]`)
  }
  console.log('')
  console.log('   PostgREST liefert ohne `limit` HÖCHSTENS 1000 Zeilen — ohne Fehler')
  console.log('   und ohne Warnung. Abhilfe: `.limit()`/`.range()` setzen, mit')
  console.log('   `count: \'exact\'` zählen statt Zeilen zu holen, oder — wenn wirklich')
  console.log('   ALLE Zeilen gebraucht werden — `leseAlle()` aus lib/db/alle-zeilen.ts.')
  process.exit(1)
}

// Nur als Lauf, nicht beim Import aus einem Test.
if (process.argv[1] && process.argv[1].endsWith('lint-zeilendeckel.ts')) main()
