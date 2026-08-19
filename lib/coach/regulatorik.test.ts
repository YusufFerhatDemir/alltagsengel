// PflegeCoach Regulatorik — node:test
// Ausführen: npx tsx --test lib/coach/regulatorik.test.ts  (oder npm run test:unit)
//
// ═══════════════════════════════════════════════════════════════
// Dieser Test prüft KEINE Rechtslage — das kann er nicht. Er prüft, dass
// die einmal gegen den Originaltext geprüften Werte nicht unbemerkt
// zurückfallen. Alle drei Fehler, die dieses Dossier tatsächlich hatte
// (falsche Norm bei REG-04, erfundener 70-€-Topf, tote DiPAV-Dokument-ID),
// wären hier aufgefallen.
//
// Der zweite Teil ist wichtiger als der erste: Er prüft nicht die
// Konstanten gegen sich selbst, sondern den ÜBRIGEN Quelltext gegen die
// Konstanten. Eine Zahl kann hier richtig stehen und in einer UI-Datei
// trotzdem falsch — genau so ist der 70-€-Topf entstanden.
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  AUFTRAGSVERARBEITUNG, CLOUD_ATTESTIERUNG, DIPAV_DOKUMENT_ID, EINGANGSBLOCKER,
  HERSTELLERVERGUETUNG, LEISTUNGSANSPRUCH, RECHTSQUELLEN, REGULATORIK_STAND,
  WIDERLEGTE_ANNAHMEN,
} from './regulatorik'
import { ANFORDERUNGSKATALOG } from './anforderungskatalog'

const WURZEL = fileURLToPath(new URL('../../', import.meta.url))

// ── 1. REG-04: Norm und Beträge ────────────────────────────────

test('REG-04: Anspruchsnorm ist § 40b Abs. 1 SGB XI, nicht § 40a', () => {
  assert.equal(LEISTUNGSANSPRUCH.norm, '§ 40b Abs. 1 SGB XI')
  assert.ok(
    !/§\s*40a\s*Abs\.\s*1a/.test(LEISTUNGSANSPRUCH.norm),
    '§ 40a Abs. 1a war die frühere Falschangabe und darf nicht zurückkehren'
  )
})

test('REG-04: 40 € DiPA und 30 € eUL, getrennt und ohne gemeinsamen Deckel', () => {
  assert.equal(LEISTUNGSANSPRUCH.dipaEuroProMonat, 40)
  assert.equal(LEISTUNGSANSPRUCH.eulEuroProMonat, 30)
  assert.equal(LEISTUNGSANSPRUCH.getrennteToepfe, true)
  assert.equal(
    LEISTUNGSANSPRUCH.gemeinsamerDeckelEuro, null,
    'Ein 70-€-Deckel existiert im Gesetz nicht — die Summe ist eine Rechnung, kein Anspruch'
  )
})

test('Für den PflegeCoach ist kein Vergütungsbetrag hinterlegt', () => {
  assert.equal(
    HERSTELLERVERGUETUNG.vereinbarterBetragEuro, null,
    'Ein Vergütungsbetrag entstünde erst aus einer Vereinbarung nach § 78a Abs. 1 SGB XI. ' +
    'Solange keine vorliegt, darf hier keine Zahl stehen.'
  )
})

// ── 2. Fundstellen ─────────────────────────────────────────────

test('DiPAV wird unter der gültigen Dokument-ID geführt', () => {
  assert.equal(DIPAV_DOKUMENT_ID, 'BJNR156800022')
  const dipav = RECHTSQUELLEN.find(q => q.kurz === 'DiPAV')
  assert.ok(dipav, 'DiPAV fehlt in den Rechtsquellen')
  assert.equal(dipav.fundstelle, DIPAV_DOKUMENT_ID)
  assert.ok(
    dipav.url.includes(DIPAV_DOKUMENT_ID),
    'Die URL muss dieselbe Dokument-ID tragen wie die Fundstelle'
  )
})

test('jede Rechtsquelle nennt Fundstelle, URL und Prüfdatum', () => {
  for (const q of RECHTSQUELLEN) {
    assert.ok(q.fundstelle.trim(), `${q.kurz}: Fundstelle fehlt`)
    assert.match(q.url, /^https:\/\//, `${q.kurz}: URL fehlt oder ist nicht https`)
    assert.match(q.geprueftAm, /^\d{4}-\d{2}-\d{2}$/, `${q.kurz}: Prüfdatum fehlt`)
  }
})

test('Regulatorik-Stand ist ein gültiges Datum und nicht in der Zukunft datiert', () => {
  assert.match(REGULATORIK_STAND, /^\d{4}-\d{2}-\d{2}$/)
  for (const q of RECHTSQUELLEN) {
    assert.ok(
      Date.parse(q.geprueftAm) <= Date.parse(REGULATORIK_STAND),
      `${q.kurz}: geprueftAm liegt nach dem Gesamtstand — dann ist der Stand nicht gepflegt`
    )
  }
})

// ── 3. Eingangsblocker ─────────────────────────────────────────

test('die drei Eingangsblocker sind SEC-01, SEC-05 und NN-01', () => {
  assert.deepEqual(
    EINGANGSBLOCKER.map(b => b.katalogId).sort(),
    ['AK-NN-01', 'AK-SEC-01', 'AK-SEC-05']
  )
})

test('jeder Eingangsblocker verweist auf einen existierenden Katalogeintrag', () => {
  const ids = new Set(ANFORDERUNGSKATALOG.map(e => e.id))
  for (const b of EINGANGSBLOCKER) {
    assert.ok(ids.has(b.katalogId), `${b.katalogId} steht nicht im Anforderungskatalog`)
  }
})

test('kein Eingangsblocker ist im Katalog als erfüllt gemeldet', () => {
  // Die Gegenprobe zum vorigen Test: Ein Eingangsblocker, der im Katalog
  // plötzlich „erfuellt" trägt, ohne dass ein Zertifikat vorliegt, wäre
  // die folgenschwerste stille Falschaussage in diesem Dossier.
  for (const b of EINGANGSBLOCKER) {
    const eintrag = ANFORDERUNGSKATALOG.find(e => e.id === b.katalogId)
    assert.ok(eintrag)
    assert.notEqual(
      eintrag.stand, 'erfuellt',
      `${b.katalogId} ist als erfüllt gemeldet. Wenn das Zertifikat tatsächlich vorliegt, ` +
      'gehört es in nachweisDateien und dieser Test angepasst — sonst ist es ein Fehler.'
    )
  }
})

test('jeder Eingangsblocker nennt eine externe ausstellende Stelle', () => {
  for (const b of EINGANGSBLOCKER) {
    assert.ok(b.ausstellendeStelle.trim(), `${b.katalogId}: ausstellende Stelle fehlt`)
    assert.ok(b.fundstelle.trim(), `${b.katalogId}: Fundstelle fehlt`)
  }
})

// ── 4. Datenschutz- und Cloud-Sonderregeln ─────────────────────

test('Standardvertragsklauseln sind für DiPA nicht zulässig', () => {
  assert.equal(
    AUFTRAGSVERARBEITUNG.standardvertragsklauselnZulaessig, false,
    'DiPAV § 5 Abs. 4 lässt den SCC-Weg nicht zu. Ein Umschalten auf true wäre eine ' +
    'Rechtsänderung, keine Codeänderung.'
  )
  assert.ok(AUFTRAGSVERARBEITUNG.zulaessigeOrte.length >= 4)
})

test('C5: SOC 2 gilt nicht als gleichwertig, und das eigene Testat fehlt', () => {
  assert.equal(CLOUD_ATTESTIERUNG.soc2Gleichwertig, false)
  assert.ok(!CLOUD_ATTESTIERUNG.gleichwertigeNachweise.some(n => /SOC\s*2/i.test(n)))
  assert.equal(
    CLOUD_ATTESTIERUNG.testatVorhanden, false,
    'Solange kein C5-Testat der Betriebsdienstleister vorliegt, muss die Lücke offen stehen'
  )
})

// ── 5. Widerlegte Annahmen ─────────────────────────────────────

test('jede widerlegte Annahme ist vollständig dokumentiert', () => {
  assert.ok(WIDERLEGTE_ANNAHMEN.length >= 8, 'Einträge dürfen nicht stillschweigend entfallen')
  const ids = new Set<string>()
  for (const a of WIDERLEGTE_ANNAHMEN) {
    assert.ok(!ids.has(a.id), `Doppelte Kennung: ${a.id}`)
    ids.add(a.id)
    assert.ok(a.falsch.trim() && a.richtig.trim(), `${a.id}: falsch/richtig unvollständig`)
    assert.ok(a.quelle.trim(), `${a.id}: Quelle fehlt`)
    assert.match(a.korrigiertAm, /^\d{4}-\d{2}-\d{2}$/, `${a.id}: Korrekturdatum fehlt`)
  }
})

test('die vier tragenden Korrekturen sind namentlich erfasst', () => {
  const ids = WIDERLEGTE_ANNAHMEN.map(a => a.id)
  for (const pflicht of ['REG-04-norm', 'REG-04-deckel', 'DIPAV-dokument-id', 'DS-04-scc']) {
    assert.ok(ids.includes(pflicht), `Regressionsschutz ${pflicht} wurde entfernt`)
  }
})

// ── 6. Gegenprobe gegen den übrigen Quelltext ──────────────────

function dateienUnter(verzeichnis: string, endungen: string[]): string[] {
  const treffer: string[] = []
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag)
    if (statSync(pfad).isDirectory()) treffer.push(...dateienUnter(pfad, endungen))
    else if (endungen.some(e => eintrag.endsWith(e))) treffer.push(pfad)
  }
  return treffer
}

/**
 * Der Produktcode — nicht die Dokumentation. Die Dokumente unter
 * docs/dipa/** zitieren die alten Falschwerte absichtlich, um die
 * Korrektur zu belegen; sie hier mitzuprüfen würde genau die Belege
 * verbieten, die den Fehler erklären.
 */
const PRODUKTCODE = [
  ...dateienUnter(join(WURZEL, 'lib/coach'), ['.ts', '.tsx']),
  ...dateienUnter(join(WURZEL, 'app/pflegecoach'), ['.ts', '.tsx']),
  ...dateienUnter(join(WURZEL, 'app/api/coach'), ['.ts']),
  ...dateienUnter(join(WURZEL, 'app/api/dipa'), ['.ts']),
].filter(p => !p.endsWith('anforderungskatalog.ts')) // führt die Korrekturhistorie in Prosa

const relativ = (pfad: string) => pfad.slice(WURZEL.length)

/**
 * Für die Textsuche zusätzlich ohne regulatorik.ts selbst: Diese Datei
 * BENENNT die widerlegten Werte, um vor ihnen zu warnen — sie dafür zu
 * bestrafen hieße, den Regressionsschutz abzuschaffen, um ihn zu
 * erfüllen. Ihre eigenen Werte prüfen stattdessen die Abschnitte 1–5
 * direkt am Datentyp, was schärfer ist als jede Textsuche.
 */
const ZU_DURCHSUCHEN = PRODUKTCODE.filter(p => relativ(p) !== 'lib/coach/regulatorik.ts')

test('kein Produktcode zitiert die tote DiPAV-Dokument-ID', () => {
  const falsch = 'BJNR6228000' + '23'
  const funde = ZU_DURCHSUCHEN.filter(p => readFileSync(p, 'utf8').includes(falsch))
  assert.deepEqual(funde.map(relativ), [], `Tote Fundstelle (404) zitiert in:\n${funde.map(relativ).join('\n')}`)
})

test('kein Produktcode behauptet einen 70-€-Deckel', () => {
  // Eng gefasst auf die Kombination Betrag + Zeitraum: „70" allein kann
  // in jedem beliebigen Zusammenhang legitim vorkommen.
  const muster = /70\s*(€|Euro)\s*(im|pro|je)\s*(Monat|Kalendermonat)/i
  const funde: string[] = []
  for (const pfad of ZU_DURCHSUCHEN) {
    const treffer = readFileSync(pfad, 'utf8').match(muster)
    if (treffer) funde.push(`${relativ(pfad)}: „${treffer[0]}"`)
  }
  assert.deepEqual(
    funde, [],
    `Der 70-€-Topf existiert nicht (§ 40b Abs. 1 SGB XI: 40 € + 30 € getrennt):\n${funde.join('\n')}`
  )
})

test('wo im Produktcode ein DiPA-Erstattungsbetrag steht, ist es 40 € oder 30 €', () => {
  // Fängt den Fall, dass jemand die Beträge in einer UI-Datei hart
  // hinschreibt und dabei danebenliegt — die häufigste Art, wie eine
  // korrigierte Konstante wirkungslos wird.
  const muster = /(\d{1,3})\s*(?:€|Euro)\s*(?:im|pro|je)\s*(?:Monat|Kalendermonat)/gi
  const erlaubt = new Set([
    String(LEISTUNGSANSPRUCH.dipaEuroProMonat),
    String(LEISTUNGSANSPRUCH.eulEuroProMonat),
    '131', // Entlastungsbetrag § 45b SGB XI — andere Leistung, legitim
  ])
  const funde: string[] = []
  for (const pfad of ZU_DURCHSUCHEN) {
    const text = readFileSync(pfad, 'utf8')
    for (const treffer of text.matchAll(muster)) {
      if (!erlaubt.has(treffer[1])) funde.push(`${relativ(pfad)}: „${treffer[0]}"`)
    }
  }
  assert.deepEqual(
    funde, [],
    `Unerwarteter Monatsbetrag. Zulässig sind ${[...erlaubt].join(', ')} €:\n${funde.join('\n')}`
  )
})
