/**
 * Der Bereitschaftsbericht: dieselbe Logik, kein zweites Urteil.
 * @see scripts/verify-einsatzbereitschaft-live.ts
 *
 * ── WAS HIER GEPRÜFT WIRD — UND WAS NICHT ─────────────────────────
 * Die Freigabelogik selbst ist abgedeckt: `pruefeEinsatzfreigabe` und
 * `pruefeClientFreigabe` tragen über sechs Dateien mehr als hundert
 * Tests. Die werden hier nicht wiederholt.
 *
 * Geprüft werden die zwei Eigenschaften, die dem BERICHT zukommen und
 * die man beim nächsten Umbau verlieren kann:
 *
 *   1. Er ruft die echten Funktionen auf. Ein Bericht, der die Regeln
 *      nachbildet, beantwortet, was die Nachbildung meint — und läuft
 *      still von der Freigabe weg, an der die Tourenplanung entscheidet.
 *   2. Er endet mit Exit 0, auch wenn niemand bereit ist. Dass keine
 *      Nachweise erfasst sind, ist Erfassungsarbeit des Betriebs, kein
 *      Programmfehler. Ein rotes Tor gäbe eine Betriebsentscheidung als
 *      Fehler aus — und wäre nach einer Woche abgeschaltet.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const quelle = readFileSync(
  join(process.cwd(), 'scripts/verify-einsatzbereitschaft-live.ts'), 'utf8')

describe('Der Bericht urteilt nicht selbst', () => {
  it('ruft pruefeEinsatzfreigabe und pruefeClientFreigabe auf', () => {
    expect(quelle).toMatch(/pruefeEinsatzfreigabe/)
    expect(quelle).toMatch(/pruefeClientFreigabe/)
    expect(quelle).toMatch(/import\('\.\.\/lib\/personal\/einsatzfreigabe'\)/)
  })

  it('bildet die Pflichtqualifikationen NICHT als Code nach', () => {
    // Stünde die Liste hier ein zweites Mal, liefe sie von der
    // Freigabeprüfung weg, sobald eine Qualifikation dazukommt. Im
    // Erklärtext dürfen die Nachweise vorkommen — geprüft wird der
    // Code, nicht die Prosa.
    const ohneKommentare = quelle
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(ohneKommentare).not.toMatch(/führungszeugnis/i)
    expect(ohneKommentare).not.toMatch(/erste[- ]hilfe/i)
    expect(ohneKommentare).not.toMatch(/PFLICHT_QUALIFIKATIONEN/)
  })

  it('prüft den Klienten MIT Einsatzdatum', () => {
    // Ohne Datum bliebe die Vertragsprüfung aus: `pruefeClientFreigabe`
    // sieht nur dann nach akten_vertraege, wenn ein Datum vorliegt. Der
    // Bericht meldete sonst „betreubar" für jemanden ohne Vertrag.
    expect(quelle).toMatch(/pruefeClientFreigabe\(sb, String\(k\.id\), orgId, heute\)/)
  })
})

describe('Ein leerer Bestand ist kein Fehler', () => {
  it('endet ohne process.exit(1)', () => {
    // Der Lauf darf nicht rot werden, nur weil noch keine Nachweise
    // erfasst sind. Einziges erlaubtes exit(1): der unerwartete Absturz.
    const ohneFehlerpfad = quelle.replace(/main\(\)\.catch[\s\S]*$/, '')
    expect(ohneFehlerpfad).not.toMatch(/process\.exit\(1\)/)
  })

  it('sagt ausdrücklich, dass die offenen Punkte Erfassungsarbeit sind', () => {
    expect(quelle).toMatch(/kein Programmfehler/)
  })

  it('benennt die Folge, statt sie dem Leser zu überlassen', () => {
    // „0 von 2" allein sagt nicht, was daran hängt.
    expect(quelle).toMatch(/Tour → Nachweis →/)
  })
})

describe('Der Lauf schreibt nicht', () => {
  it('enthält keinen Schreibvorgang', () => {
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(quelle, `Bestandsaufnahme enthält ${verb}`).not.toContain(verb)
    }
  })

  it('sagt das auch im Kopf', () => {
    expect(quelle).toMatch(/Es wird NICHTS geschrieben/)
  })
})
