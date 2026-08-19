/**
 * Tests für die Klassifizierung von Kassen-Fehlercodes.
 *
 * Die Klassifizierung entscheidet, was mit einer abgelehnten Rechnung
 * geschieht: korrigieren und erneut einreichen, oder abschreiben. Eine
 * falsche Einordnung führt entweder zu endlosen Wiedereinreichungen oder
 * zu abgeschriebenem Umsatz. Wo nichts belegt ist, muss deshalb
 * 'unbekannt' herauskommen — sichtbar auf dem Tisch statt still einsortiert.
 *
 * Läuft mit: npm run test:unit (node:test).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { klassifiziereHeuristisch, FEHLER_KATEGORIEN } from '../ruecklaeufer-fehlercodes'

// ── Katalog der Kategorien ──────────────────────────────────────

test('jede Kategorie beschreibt Bedeutung und Maßnahme', () => {
  for (const [id, k] of Object.entries(FEHLER_KATEGORIEN)) {
    assert.equal(k.kategorie, id, `Kategorie ${id} trägt einen abweichenden Schlüssel`)
    assert.ok(k.label.trim(), `Kategorie ${id} ohne Label`)
    assert.ok(k.bedeutung.trim(), `Kategorie ${id} ohne Bedeutung`)
    assert.ok(k.massnahme.trim(), `Kategorie ${id} ohne Maßnahme`)
    assert.equal(typeof k.korrigierbar, 'boolean')
  }
})

// ── Heuristik: eigene Konvention ────────────────────────────────

test('T-Präfix aus dem SLGA-Parser wird als Verarbeitungsfehler erkannt', () => {
  // Das T setzt slga-parser.ts selbst — die einzige Codekonvention, auf die
  // sich die Heuristik stützen darf.
  const k = klassifiziereHeuristisch('T9001', null)
  assert.equal(k.kategorie, 'verarbeitungsfehler')
  assert.equal(k.herkunft, 'heuristik')
})

test('ein fremder numerischer Code ohne Text bleibt unbekannt', () => {
  // Kein Raten über fremde Codeverzeichnisse.
  const k = klassifiziereHeuristisch('4711', null)
  assert.equal(k.kategorie, 'unbekannt')
  assert.equal(k.herkunft, 'unbekannt')
})

test('ohne Code und ohne Text bleibt es unbekannt', () => {
  for (const [code, text] of [[null, null], [undefined, undefined], ['', ''], ['   ', '  ']] as const) {
    assert.equal(klassifiziereHeuristisch(code, text).kategorie, 'unbekannt')
  }
})

// ── Heuristik: Freitext der Kasse ───────────────────────────────

test('Texte zum Versicherungsverhältnis ergeben "versicherter_unbekannt"', () => {
  for (const text of [
    'Kein Versicherungsschutz zum Leistungsdatum',
    'Versicherte Person nicht versichert',
    'Versichertennummer nicht auffindbar',
    'Unbekannter Versicherter',
    'Kein Mitglied unserer Kasse',
    'Kassenwechsel zum 01.07.2026',
  ]) {
    assert.equal(
      klassifiziereHeuristisch(null, text).kategorie, 'versicherter_unbekannt',
      `"${text}" falsch eingeordnet`,
    )
  }
})

test('Texte zu Preisen und Verträgen ergeben "tarifabweichung"', () => {
  for (const text of [
    'Tarif nicht vereinbart',
    'Vergütung überschreitet den Höchstsatz',
    'Preis weicht vom Vertrag ab',
    'Kürzung des Betrags auf den Vertragspreis',
    'Punktwert unzutreffend',
  ]) {
    assert.equal(klassifiziereHeuristisch(null, text).kategorie, 'tarifabweichung', `"${text}" falsch eingeordnet`)
  }
})

test('Texte zu Format und Übertragung ergeben "verarbeitungsfehler"', () => {
  for (const text of [
    'EDIFACT-Struktur ungültig',
    'Syntaxfehler im Segment ELS',
    'Datei nicht entschlüsselbar',
    'Zertifikat abgelaufen',
    'Übertragung abgebrochen',
  ]) {
    assert.equal(klassifiziereHeuristisch(null, text).kategorie, 'verarbeitungsfehler', `"${text}" falsch eingeordnet`)
  }
})

test('Texte zu einzelnen Feldern ergeben "datenfehler"', () => {
  for (const text of [
    'Pflegegrad unplausibel',
    'Geburtsdatum fehlt',
    'Pflichtfeld nicht gefüllt',
    'IK-Nummer ungültig',
  ]) {
    assert.equal(klassifiziereHeuristisch(null, text).kategorie, 'datenfehler', `"${text}" falsch eingeordnet`)
  }
})

test('ein nichtssagender Text bleibt unbekannt statt geraten', () => {
  for (const text of ['Bitte prüfen', 'Rückfrage', 'Siehe Anlage']) {
    const k = klassifiziereHeuristisch(null, text)
    assert.equal(k.kategorie, 'unbekannt', `"${text}" hätte unbekannt bleiben müssen`)
    assert.equal(k.herkunft, 'unbekannt')
  }
})

test('Groß-/Kleinschreibung der Kasse spielt keine Rolle', () => {
  assert.equal(klassifiziereHeuristisch(null, 'KEIN VERSICHERUNGSSCHUTZ').kategorie, 'versicherter_unbekannt')
  assert.equal(klassifiziereHeuristisch(null, 'Kein Versicherungsschutz').kategorie, 'versicherter_unbekannt')
})

test('der Code schlägt den Text: T-Präfix bleibt Verarbeitungsfehler', () => {
  const k = klassifiziereHeuristisch('T001', 'Pflegegrad unplausibel')
  assert.equal(k.kategorie, 'verarbeitungsfehler')
})

test('jede Heuristik liefert Beschreibung, Maßnahme und Korrigierbarkeit mit', () => {
  const k = klassifiziereHeuristisch(null, 'Tarif nicht vereinbart')
  assert.equal(k.beschreibung, FEHLER_KATEGORIEN.tarifabweichung.bedeutung)
  assert.equal(k.massnahme, FEHLER_KATEGORIEN.tarifabweichung.massnahme)
  assert.equal(k.korrigierbar, FEHLER_KATEGORIEN.tarifabweichung.korrigierbar)
  // Aus der Heuristik gibt es nie einen Katalogeintrag oder eine Quelle.
  assert.equal(k.katalogId, null)
  assert.equal(k.quelle, null)
})
