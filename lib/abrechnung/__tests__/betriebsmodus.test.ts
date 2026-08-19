/**
 * Tests für den Umschalter zwischen Testübertragung und Echtabrechnung.
 *
 * Der Dateiindikator im UNB entscheidet, ob die Annahmestelle eine Datei
 * folgenlos verarbeitet ('0') oder als Forderung ('2'). Eine versehentliche
 * '2' erzeugt eine Forderung bei einer Kasse — das ist der teure Fehler.
 * Diese Suite prüft deshalb vor allem, dass jeder Zweifelsfall bei '0'
 * landet und dass alle drei Sperren einzeln wirken.
 *
 * Läuft mit: npm run test:unit (node:test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  pruefeUmschaltung,
  DATEIINDIKATOR,
  BESTAETIGUNG_ECHTBETRIEB,
  KANAL_FREIGABE,
  KANAL_LABEL,
  BETRIEBS_KANAELE,
} from '../betriebsmodus'
import { EXTERNE_FREIGABEN } from '../externe-freigaben'

const VOLLSTAENDIG = {
  kanal: 'sftp_105' as const,
  zielModus: 'produktion' as const,
  begruendung: 'Testübertragung mit ITSCare abgeschlossen',
  bestaetigung: BESTAETIGUNG_ECHTBETRIEB,
  testuebertragungAm: '2026-08-15',
  testuebertragungReferenz: 'ITSCare Ticket 2026-4711',
}

// ── Zuordnungen ─────────────────────────────────────────────────

test('Testbetrieb ergibt Dateiindikator 0, Echtbetrieb 2', () => {
  assert.equal(DATEIINDIKATOR.test, '0')
  assert.equal(DATEIINDIKATOR.produktion, '2')
})

test('jeder Kanal hat ein Env-Gate und eine Beschriftung', () => {
  for (const kanal of BETRIEBS_KANAELE) {
    const freigabe = KANAL_FREIGABE[kanal]
    assert.ok(freigabe, `Kanal ${kanal} ohne Freigabe-Zuordnung`)
    assert.ok(EXTERNE_FREIGABEN[freigabe], `Freigabe ${freigabe} unbekannt`)
    assert.ok(KANAL_LABEL[kanal], `Kanal ${kanal} ohne Beschriftung`)
  }
})

test('§ 105 hängt am ITSG-Gate, § 302 an seinem eigenen', () => {
  assert.equal(EXTERNE_FREIGABEN[KANAL_FREIGABE.sftp_105].envVariable, 'ITSG_ZERTIFIZIERT')
  assert.equal(EXTERNE_FREIGABEN[KANAL_FREIGABE.sftp_302].envVariable, 'SGB_V_302_FREIGABE')
  assert.equal(EXTERNE_FREIGABEN[KANAL_FREIGABE.kim].envVariable, 'KIM_AKTIV')
})

// ── Rückweg in den Testbetrieb ──────────────────────────────────

test('Rückweg in den Testbetrieb braucht nur eine Begründung', () => {
  assert.equal(
    pruefeUmschaltung({ kanal: 'sftp_105', zielModus: 'test', begruendung: 'Formatfehler aufgetreten' }, true),
    null,
  )
})

test('Rückweg in den Testbetrieb ist auch bei geschlossenem Gate erlaubt', () => {
  // Eine Sperre auf dem Rückweg würde im Zweifel dazu führen, dass jemand
  // im Echtbetrieb bleibt.
  assert.equal(
    pruefeUmschaltung({ kanal: 'sftp_105', zielModus: 'test', begruendung: 'Sicherheitshalber zurück' }, false),
    null,
  )
})

test('auch der Rückweg verlangt eine Begründung', () => {
  const problem = pruefeUmschaltung({ kanal: 'sftp_105', zielModus: 'test', begruendung: '   ' }, true)
  assert.match(problem ?? '', /Begründung ist Pflicht/)
})

// ── Weg in den Echtbetrieb: alle drei Sperren ───────────────────

test('mit allen drei Nachweisen ist der Echtbetrieb erlaubt', () => {
  assert.equal(pruefeUmschaltung(VOLLSTAENDIG, true), null)
})

test('Sperre 1: geschlossenes Env-Gate blockiert den Echtbetrieb', () => {
  const problem = pruefeUmschaltung(VOLLSTAENDIG, false)
  assert.match(problem ?? '', /ITSG_ZERTIFIZIERT/)
  assert.match(problem ?? '', /Echtbetrieb nicht möglich/)
})

test('Sperre 2: fehlendes Bestätigungswort blockiert', () => {
  for (const bestaetigung of [undefined, '', 'ja', 'echtbetrieb', 'Echtbetrieb', ' ECHTBETRIEB ']) {
    const problem = pruefeUmschaltung({ ...VOLLSTAENDIG, bestaetigung }, true)
    if (bestaetigung === ' ECHTBETRIEB ') {
      // Umschließende Leerzeichen werden getrimmt — das ist ein Tippfehler,
      // keine andere Absicht.
      assert.equal(problem, null)
      continue
    }
    assert.match(problem ?? '', /Bestätigung fehlt/, `"${bestaetigung}" hätte blockieren müssen`)
  }
})

test('Sperre 3: Testübertragung ohne Datum blockiert', () => {
  const problem = pruefeUmschaltung({ ...VOLLSTAENDIG, testuebertragungAm: undefined }, true)
  assert.match(problem ?? '', /Testübertragung ist Pflicht/)
})

test('Sperre 3: unplausibles Datumsformat blockiert', () => {
  for (const datum of ['15.08.2026', '2026-8-15', 'gestern', '20260815']) {
    const problem = pruefeUmschaltung({ ...VOLLSTAENDIG, testuebertragungAm: datum }, true)
    assert.match(problem ?? '', /JJJJ-MM-TT/, `"${datum}" hätte blockieren müssen`)
  }
})

test('Sperre 3: Datum ohne Beleg der Annahmestelle blockiert', () => {
  // Ein Datum ohne Beleg ist eine Behauptung.
  for (const referenz of [undefined, '', '   ']) {
    const problem = pruefeUmschaltung({ ...VOLLSTAENDIG, testuebertragungReferenz: referenz }, true)
    assert.match(problem ?? '', /Beleg der Testübertragung ist Pflicht/)
  }
})

test('Begründung wird vor allen anderen Sperren geprüft', () => {
  const problem = pruefeUmschaltung({ ...VOLLSTAENDIG, begruendung: '' }, false)
  assert.match(problem ?? '', /Begründung ist Pflicht/)
})

test('das Gate wird vor Bestätigung und Nachweisen geprüft', () => {
  // Reihenfolge ist wichtig: wer das Gate nicht hat, soll nicht erst
  // Belege sammeln, die ohnehin nichts nützen.
  const problem = pruefeUmschaltung({
    ...VOLLSTAENDIG, bestaetigung: undefined, testuebertragungAm: undefined, testuebertragungReferenz: undefined,
  }, false)
  assert.match(problem ?? '', /Echtbetrieb nicht möglich/)
})

test('jeder Kanal nennt beim Blockieren seine eigene Env-Variable', () => {
  for (const kanal of BETRIEBS_KANAELE) {
    const problem = pruefeUmschaltung({ ...VOLLSTAENDIG, kanal }, false)
    assert.match(problem ?? '', new RegExp(EXTERNE_FREIGABEN[KANAL_FREIGABE[kanal]].envVariable))
  }
})
