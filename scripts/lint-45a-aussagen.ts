/**
 * §45a-Lint: keine Anerkennungs- oder Abrechnungszusage im Quelltext.
 *
 *   npm run lint:45a
 *
 * WOZU NEBEN DEM TEST
 * `__tests__/seo/45a-versprechen.test.ts` rendert Seiten und prüft das
 * Ergebnis. Er sieht damit alles, was eine Seite ausgibt — aber nichts, was
 * nie gerendert wird: System-Prompts der Chats, E-Mail-Rümpfe, Vorlagen,
 * Konstanten, JSON-Bausteine. Genau dort standen am 11.09.2026 die
 * hartnäckigsten Zusagen. Dieser Lauf liest den Quelltext selbst.
 *
 * Solange `ANERKENNUNG_45A_LIEGT_VOR` false ist, sind Sätze verboten, die
 * eine bestehende Anerkennung oder eine sichere Abrechnung behaupten.
 * Erlaubt bleibt die Beschreibung des Rechts („Anspruch auf 131 €") und
 * jede Aussage mit Vorbehalt („setzt die Anerkennung voraus").
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { ANERKENNUNG_45A_LIEGT_VOR } from '../lib/marketing/vorlagen'
import { ENTLASTUNG_MONATLICH_EUR } from '../lib/config/budget-constants'

interface Regel {
  id: string
  muster: RegExp
  grund: string
  /** Trifft das hier zu, ist der Treffer kein Befund. */
  ausnahme?: RegExp
}

const REGELN: Regel[] = [
  {
    id: 'bereits-anerkannt',
    muster: /(sind|ist|wir sind)\s+(bereits\s+)?(in\s+[^.]{0,40})?(nach\s+)?§?\s?45a[^.]{0,30}anerkannt|bereits anerkannt|anerkannter Anbieter wie Alltagsengel|Alltagsengel[^.]{0,30}ist anerkannt/i,
    grund: 'Behauptet eine bestehende §45a-Anerkennung. Richtig: „im Anerkennungsverfahren".',
    // Eine Aufklärung über den Markt ist keine Behauptung über uns:
    // „Nicht jeder Anbieter ist nach § 45a anerkannt" stimmt und muss stehen bleiben.
    ausnahme: /nicht jeder|nur anerkannte|nicht anerkannt|ob der Anbieter|muss.{0,20}anerkannt sein|anerkannt sein/i,
  },
  {
    id: 'garantierte-abrechnung',
    muster: /garantiert[^.]{0,25}abrechen|sicher[^.]{0,15}abrechenbar|in jedem Fall[^.]{0,25}(abgerechnet|Kasse)|100 ?% (abgerechnet|Kostenübernahme)/i,
    grund: 'Sagt eine Abrechnung zu, die vor der Anerkennung niemand zusagen kann.',
  },
  {
    id: 'kassenabrechnung-zusage',
    muster: /(wir|Alltagsengel)\s+rechnen?[^.<]{0,40}direkt mit (der|Ihrer) (Pflege)?[Kk]asse|Abrechnung mit der Pflegekasse übernehmen wir|nichts aus eigener Tasche/i,
    grund: 'Zusage der Direktabrechnung durch Alltagsengel.',
  },
  {
    id: 'veralteter-betrag',
    muster: /125\s?(€|EUR|Euro)/i,
    grund: `Veralteter Entlastungsbetrag. Gültig sind ${ENTLASTUNG_MONATLICH_EUR} €.`,
    // In einer `keywords`-Liste stehen Suchbegriffe, die Menschen eingeben —
    // keine Aussage der Seite. Wer nach „125 Euro" sucht, soll den Artikel
    // finden, der erklärt, dass es 131 € sind.
    ausnahme: /keywords:/,
  },
]

/** Vorbehalt im selben Satz macht die Aussage zulässig. */
const VORBEHALT = /Anerkennungsverfahren|im Verfahren|setzt die Anerkennung|nach der Anerkennung|noch nicht anerkannt|zuvor|vorher|veraltet|angehoben|erhöht|bis 2024/i

/**
 * Andere Rechtsgrundlage, andere Frage: Die Pflegebox (§ 40 SGB XI) und
 * Krankenfahrten (§ 60 SGB V) hängen nicht an der §45a-Anerkennung. Dort
 * ist „wir rechnen direkt mit der Kasse ab" eine zulässige Aussage — sie
 * betrifft einen anderen Vertrag und wird hier nicht geprüft.
 */
const ANDERE_GRUNDLAGE = /Pflege-?[Bb]ox|Pflegehilfsmittel|Hygienebox|§ ?40|42 ?€|Krankenfahrt|§ ?60|Fahrdienst|Verhinderungspflege|§ ?39/i

/** Was der Lauf liest: ausgelieferter Code, keine Berichte über Fehler. */
const DATEIEN = execSync(
  "git ls-files app components lib | grep -E '\\.(ts|tsx)$' | grep -v '__tests__' | grep -v '\\.test\\.'",
  { encoding: 'utf8' },
).trim().split('\n')

/** Diese Datei definiert die Muster selbst. */
const AUSNAHMEN = new Set(['scripts/lint-45a-aussagen.ts', 'lib/marketing/vorlagen.ts'])

/**
 * Ganze Strecken, die auf einer anderen Rechtsgrundlage stehen: die
 * Pflegebox läuft über § 40 SGB XI, Krankenfahrten über § 60 SGB V. Dort
 * ist die Direktabrechnung zulässig — die Anerkennungs- und Betragsregeln
 * gelten aber weiter, deshalb nur für diese eine Regel.
 */
const ANDERE_STRECKE = /(hygienebox|pflegebox|krankenfahrt)/i

interface Befund { datei: string; zeile: number; regel: string; text: string; grund: string }

const befunde: Befund[] = []
for (const datei of DATEIEN) {
  if (AUSNAHMEN.has(datei)) continue
  const zeilen = readFileSync(datei, 'utf8').split('\n')
  zeilen.forEach((z, i) => {
    // Ein Satz mit Vorbehalt ist in Ordnung; ebenso der Kontext der
    // Nachbarzeile, weil Fließtext im Code oft umbrochen ist.
    const fenster = `${zeilen[i - 1] ?? ''} ${z} ${zeilen[i + 1] ?? ''}`
    // Für die Rechtsgrundlage ein größeres Fenster: „Pflegebox" steht oft
    // in der Überschrift des Absatzes, nicht in der Zeile daneben.
    const absatz = zeilen.slice(Math.max(0, i - 6), i + 4).join(' ')
    if (VORBEHALT.test(fenster) || ANDERE_GRUNDLAGE.test(absatz)) return
    for (const r of REGELN) {
      if (r.ausnahme?.test(fenster)) continue
      if (r.id === 'kassenabrechnung-zusage' && ANDERE_STRECKE.test(datei)) continue
      const t = z.match(r.muster)
      if (t) befunde.push({ datei, zeile: i + 1, regel: r.id, text: t[0].trim().slice(0, 90), grund: r.grund })
    }
  })
}

console.log('── §45a-Aussagen im Quelltext ──────────────────────────────')
console.log(`   geprüfte Dateien:              ${DATEIEN.length}`)
console.log(`   ANERKENNUNG_45A_LIEGT_VOR:     ${ANERKENNUNG_45A_LIEGT_VOR}`)
console.log(`   Entlastungsbetrag (Konstante): ${ENTLASTUNG_MONATLICH_EUR} €`)

if (ANERKENNUNG_45A_LIEGT_VOR) {
  console.log('\n⚠  Die Anerkennung ist als erteilt hinterlegt — die Anerkennungs-Regeln')
  console.log('   greifen nicht mehr. Nur der Betrag wird weiter geprüft.')
}

const scharf = befunde.filter(b => ANERKENNUNG_45A_LIEGT_VOR ? b.regel === 'veralteter-betrag' : true)

if (scharf.length === 0) {
  console.log('\n✓ Kein Befund.')
  process.exit(0)
}

console.log(`\n❌ ${scharf.length} Befund(e):\n`)
for (const b of scharf) {
  console.log(`   ${b.datei}:${b.zeile}  [${b.regel}]`)
  console.log(`      „${b.text}"`)
  console.log(`      ${b.grund}\n`)
}
console.log('   Abhilfe: Aussage mit Vorbehalt formulieren („setzt die Anerkennung nach')
console.log('   § 45a SGB XI voraus — Alltagsengel befindet sich derzeit im Anerkennungs-')
console.log('   verfahren") oder streichen. Nach dem Bescheid: ANERKENNUNG_45A_LIEGT_VOR.')
process.exit(1)
