// ═══════════════════════════════════════════════════════════════════════
// Block 29 — Pflichtnachweise der Einsatzfreigabe
//
// Ein Test je Befund. Der Ausgangspunkt: die Freigabe prüfte
// `q.title?.toLowerCase().includes('führungszeugnis') && q.pflicht` — eine
// getippte Zeile ohne Dokument und ohne Prüfvermerk reichte, um jemanden
// für den Einsatz bei pflegebedürftigen Menschen freizugeben. Genau das,
// was darfAlsVerifiziertGelten() eine Stufe vorher abweist.
// ═══════════════════════════════════════════════════════════════════════
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PFLICHT_QUALIFIKATIONEN,
  NACHWEIS_SPALTEN,
  passtZuPflicht,
  belegLuecke,
  pflichtProbleme,
  type NachweisZeile,
} from '../pflichtnachweis'

const HEUTE = '2026-09-14'
const BELEGT = {
  dokument_id: 'dok-1',
  verifiziert_am: '2026-09-01T09:00:00Z',
  verifiziert_von: 'pruefer-1',
}

function fz(extra: Partial<NachweisZeile> = {}): NachweisZeile {
  return {
    id: 'q-fz', title: 'Erweitertes Führungszeugnis', qualification_type: 'fuehrungszeugnis',
    valid_until: '2027-12-31', pflicht: true, einsatzrelevant: true, status: 'valid',
    ...BELEGT, ...extra,
  }
}
function eh(extra: Partial<NachweisZeile> = {}): NachweisZeile {
  return {
    id: 'q-eh', title: 'Erste Hilfe Kurs', qualification_type: 'erste_hilfe',
    valid_until: '2027-12-31', pflicht: true, einsatzrelevant: true, status: 'valid',
    ...BELEGT, ...extra,
  }
}

// ── Belegkette ───────────────────────────────────────────────────────

test('belegLuecke: vollständig belegter Nachweis hat keine Lücke', () => {
  assert.equal(belegLuecke(fz()), null)
})

test('belegLuecke: ohne Dokument ist der Nachweis nur eine Behauptung', () => {
  // DER Befund aus Block 29: genau diese Zeile passierte die Freigabe.
  assert.match(String(belegLuecke(fz({ dokument_id: null }))), /kein Dokument/)
})

test('belegLuecke: Dokument ohne Prüfvermerk zählt nicht', () => {
  assert.match(String(belegLuecke(fz({ verifiziert_am: null }))), /nicht geprüft/)
})

test('belegLuecke: Prüfzeitpunkt ohne Prüfer zählt nicht', () => {
  // Ein Vermerk, zu dem niemand steht, ist kein Vermerk.
  assert.match(String(belegLuecke(fz({ verifiziert_von: null }))), /nicht geprüft/)
})

test('belegLuecke: Status "pending" schlägt alles andere', () => {
  assert.match(String(belegLuecke(fz({ status: 'pending' }))), /steht noch aus/)
})

// ── Zuordnung über den Typ statt über Freitext ───────────────────────

test('passtZuPflicht: der kanonische Typ entscheidet', () => {
  const p = PFLICHT_QUALIFIKATIONEN[0]
  assert.equal(passtZuPflicht({ qualification_type: 'fuehrungszeugnis', title: 'Erw. FZ' }, p), true)
})

test('passtZuPflicht: ein anderer Typ zählt NICHT über seinen Titel', () => {
  // „Fortbildung: Auffrischung Führungszeugnis-Recht" schlug vorher als
  // Führungszeugnis durch, weil nur der Titel-Teilstring geprüft wurde.
  const p = PFLICHT_QUALIFIKATIONEN[0]
  assert.equal(
    passtZuPflicht({ qualification_type: 'fortbildung', title: 'Auffrischung Führungszeugnis-Recht' }, p),
    false,
  )
})

test('passtZuPflicht: ohne Typ greift der Titel als Rückfall für Altbestand', () => {
  const p = PFLICHT_QUALIFIKATIONEN[0]
  assert.equal(passtZuPflicht({ qualification_type: null, title: 'Erweitertes Führungszeugnis' }, p), true)
})

test('passtZuPflicht: leerer Typ wird wie kein Typ behandelt', () => {
  const p = PFLICHT_QUALIFIKATIONEN[1]
  assert.equal(passtZuPflicht({ qualification_type: '  ', title: 'Erste Hilfe Kurs' }, p), true)
})

// ── Gesamtprüfung ────────────────────────────────────────────────────

test('pflichtProbleme: beide Nachweise vollständig → keine Beanstandung', () => {
  assert.deepEqual(pflichtProbleme([fz(), eh()], HEUTE), [])
})

test('pflichtProbleme: leerer Bestand nennt BEIDE fehlenden Nachweise', () => {
  const p = pflichtProbleme([], HEUTE)
  assert.equal(p.length, 2)
  assert.ok(p.some(x => /Führungszeugnis/.test(x)))
  assert.ok(p.some(x => /Erste-Hilfe/.test(x)))
})

test('pflichtProbleme: getippte Zeile ohne Dokument wird beanstandet', () => {
  // Vor Block 29 war das eine gültige Freigabegrundlage.
  const p = pflichtProbleme([fz({ dokument_id: null }), eh()], HEUTE)
  assert.equal(p.length, 1)
  assert.match(p[0], /Führungszeugnis.*kein Dokument/)
})

test('pflichtProbleme: eine Zeile ohne pflicht=true zählt nicht als Pflichtnachweis', () => {
  const p = pflichtProbleme([fz({ pflicht: false }), eh()], HEUTE)
  assert.match(p[0], /Führungszeugnis" fehlt/)
})

test('pflichtProbleme: abgelaufen wird gemeldet, die Belegprüfung tritt zurück', () => {
  // Bei einem abgelaufenen Nachweis ist „abgelaufen" die nützlichere
  // Auskunft — nicht zusätzlich noch eine Belegbeanstandung.
  const p = pflichtProbleme([fz({ valid_until: '2020-01-01', dokument_id: null }), eh()], HEUTE)
  assert.equal(p.length, 1)
  assert.match(p[0], /ist am 2020-01-01 abgelaufen/)
})

test('pflichtProbleme: ein Nachweis ohne Ablaufdatum bleibt gültig', () => {
  assert.deepEqual(pflichtProbleme([fz({ valid_until: null }), eh()], HEUTE), [])
})

// ── Die Spaltenliste ist Teil der Regel ──────────────────────────────

test('NACHWEIS_SPALTEN enthält die Belegspalten', () => {
  // Der Befund entstand daran, dass die Abfrage diese drei Spalten nicht
  // selektierte: eine Prüfung, die ein Feld nicht liest, kann es nicht
  // verlangen. Diese Zusicherung hält das fest.
  for (const spalte of ['dokument_id', 'verifiziert_am', 'verifiziert_von', 'qualification_type']) {
    assert.ok(NACHWEIS_SPALTEN.includes(spalte), `${spalte} fehlt in NACHWEIS_SPALTEN`)
  }
})
