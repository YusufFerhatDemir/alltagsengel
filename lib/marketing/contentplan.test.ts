import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ladeContentKatalog, frequenzProWoche, wochenStart, ZIEL_PRO_WOCHE,
} from './contentplan'

// ═══════════════════════════════════════════════════════════════════════
// Geprüft wird gegen die ECHTEN Pläne in docs/marketing/.
//
// Warum nicht gegen eine Fixture: der Parser soll nicht beweisen, dass er
// ein erfundenes Format versteht, sondern dass er die vorhandenen Pläne
// vollständig liest. Führt jemand dort ein viertes Format ein, muss dieser
// Test rot werden — das ist sein Zweck.
//
// Deshalb stehen hier fast keine festen Zahlen: sie würden bei jedem neuen
// Post brechen und jemanden dazu bringen, die Zahl nachzuziehen statt
// hinzusehen. Geprüft werden Eigenschaften, die immer gelten müssen.
// ═══════════════════════════════════════════════════════════════════════

const katalog = ladeContentKatalog()

test('findet Stücke in jeder gelesenen Plandatei', () => {
  assert.ok(katalog.stuecke.length > 0, 'kein einziges Stück erkannt')
  for (const datei of katalog.dateien) {
    const treffer = katalog.stuecke.filter(s => s.quelle === datei)
    assert.ok(
      treffer.length > 0,
      `${datei} wurde gelesen, lieferte aber kein Stück — Format vermutlich nicht erkannt`,
    )
  }
})

test('übersprungene Abschnitte bleiben die Ausnahme', () => {
  // Ein neues, unerkanntes Format würde hier auffallen, statt sich als
  // stille Lücke im Dashboard zu verstecken.
  const gesamt = katalog.stuecke.length + katalog.uebersprungen
  assert.ok(
    katalog.uebersprungen <= gesamt * 0.15,
    `${katalog.uebersprungen} von ${gesamt} Abschnitten übersprungen — zu viele für „Ausnahme"`,
  )
})

test('jedes Stück ist eindeutig und vollständig genug zum Posten', () => {
  const gesehen = new Set<string>()
  for (const s of katalog.stuecke) {
    assert.ok(!gesehen.has(s.id), `doppelte ID: ${s.id}`)
    gesehen.add(s.id)
    assert.ok(s.titel.trim().length > 0, `${s.id}: kein Titel`)
    assert.ok(s.text.trim().length > 0, `${s.id}: kein Text`)
    assert.ok(s.plattform, `${s.id}: keine Plattform — wohin soll es gepostet werden?`)
  }
})

test('Markdown-Auszeichnung steht nicht im Posttext', () => {
  for (const s of katalog.stuecke) {
    assert.doesNotMatch(s.text, /^\s*>/m, `${s.id}: Blockquote-Zeichen im Text`)
    assert.doesNotMatch(
      s.text, /#[\wÄÖÜäöüß]+\s*$/,
      `${s.id}: Hashtags stehen noch im Text statt im eigenen Feld`,
    )
  }
})

test('Redaktionshinweise stehen nicht im Posttext', () => {
  // Ein kursiver Hinweis („nur nach schriftlicher Einwilligung") ist eine
  // Bedingung fürs Posten. Im Text würde er mitveröffentlicht.
  for (const s of katalog.stuecke) {
    assert.doesNotMatch(
      s.text, /^\*[^*].*\*$/m,
      `${s.id}: kursiver Redaktionshinweis steht im Text statt im Feld hinweis`,
    )
  }
  const mitHinweis = katalog.stuecke.filter(s => s.hinweis)
  assert.ok(
    mitHinweis.length > 0,
    'kein einziger Redaktionshinweis erkannt — die Extraktion greift nicht mehr',
  )
})

test('Datumsangaben sind sortierbares ISO', () => {
  for (const s of katalog.stuecke) {
    if (!s.datum) continue
    assert.ok(
      s.datumIso, `${s.id}: „${s.datum}" wurde nicht in ein ISO-Datum übersetzt`,
    )
    assert.match(s.datumIso!, /^\d{4}-\d{2}-\d{2}$/, `${s.id}: ${s.datumIso}`)
  }
})

/**
 * Der eigentliche Regressionstest.
 *
 * Ein früherer Fehler (`$` unter dem m-Flag = Zeilenende) kürzte jedes
 * mehrzeilige Feld auf seine erste Zeile. Im Dashboard sah das vollständig
 * aus: Titel, Datum, Plattform, Hashtags — alles da, nur der Text war ein
 * Satz lang. Niemandem wäre das als Fehler aufgefallen.
 *
 * Geprüft wird deshalb am Quelltext: Hinter der letzten erkannten Textzeile
 * darf bis zum nächsten Abschnittsmarker nichts Inhaltliches mehr stehen.
 */
test('kein Text endet vor dem Ende seines Quellabschnitts', () => {
  const abschnittsMarker =
    /^(?:#{2,4}\s|---|\*\*[A-Za-zÄÖÜäöü/ .()-]+:\*\*|#[\wÄÖÜäöüß]|\*[^*].*\*$)/

  for (const s of katalog.stuecke) {
    const quelle = readFileSync(join(process.cwd(), 'docs', 'marketing', s.quelle), 'utf-8')
    // Quote-Präfixe sind beim Parsen entfernt worden — für den Vergleich
    // wird die Datei auf dieselbe Weise entblättert.
    const zeilen = quelle.split('\n').map(z => z.replace(/^\s*>\s?/, '').replace(/\s+$/, ''))

    // Die Suche muss im eigenen Abschnitt bleiben: Zeilen wie „Ihr Team von
    // Alltagsengel" stehen in fünf Posts. Ein dateiweites Suchen fände die
    // letzte davon und prüfte den falschen Abschnitt.
    const kopfZeile = zeilen.findIndex(z =>
      new RegExp(`^#{2,3}\\s+${s.nummer.replace(' ', '\\s+')}\\b`).test(z))
    assert.notEqual(kopfZeile, -1, `${s.id}: Abschnittskopf „${s.nummer}" nicht gefunden`)

    const textZeilen = s.text.split('\n').filter(z => z.trim())
    const letzte = textZeilen[textZeilen.length - 1]
    const pos = zeilen.indexOf(letzte, kopfZeile)
    assert.notEqual(pos, -1, `${s.id}: letzte Textzeile nicht in ${s.quelle} wiedergefunden`)

    for (let i = pos + 1; i < zeilen.length; i++) {
      const z = zeilen[i].trim()
      if (!z) continue
      assert.match(
        z, abschnittsMarker,
        `${s.id}: nach dem erkannten Text folgt noch Inhalt („${z.slice(0, 60)}") `
        + '— der Abschnitt wurde abgeschnitten',
      )
      break
    }
  }
})

test('wochenStart liefert immer den Montag', () => {
  // 2026-09-10 ist ein Donnerstag, 2026-09-07 der Montag davor.
  assert.equal(wochenStart('2026-09-10'), '2026-09-07')
  assert.equal(wochenStart('2026-09-07'), '2026-09-07', 'Montag bleibt Montag')
  assert.equal(wochenStart('2026-09-13'), '2026-09-07', 'Sonntag gehört zur Woche davor')
})

test('frequenzProWoche zählt je Kalenderwoche und misst am Ziel', () => {
  const stueck = (datumIso: string | null) => ({ datumIso }) as never
  const frequenz = frequenzProWoche([
    ...Array.from({ length: ZIEL_PRO_WOCHE }, () => stueck('2026-09-10')),
    stueck('2026-09-17'),
    stueck(null), // undatiert: zählt in keiner Woche
  ])

  assert.deepEqual(frequenz.map(w => w.woche), ['2026-09-07', '2026-09-14'])
  assert.deepEqual(frequenz.map(w => w.anzahl), [ZIEL_PRO_WOCHE, 1])
  assert.deepEqual(frequenz.map(w => w.erfuellt), [true, false])
})
