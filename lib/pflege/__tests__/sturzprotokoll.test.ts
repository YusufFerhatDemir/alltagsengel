// ═══════════════════════════════════════════════════════════════
// Tests: Sturzprotokoll — Format-/Plausibilitätsvalidierung
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validiereSturzprotokollListen, validiereSturzZeitpunkt } from '../sturzprotokoll'
import { berlinParts, heuteBerlin } from '@/lib/utils/timezone'

test('validiereSturzZeitpunkt lehnt kaputtes Datums-/Uhrzeitformat ab, statt zu crashen', () => {
  assert.throws(
    () => validiereSturzZeitpunkt({ sturzDatum: '27.08.2026', sturzUhrzeit: '10:00' }),
    /Format JJJJ-MM-TT/,
  )
  assert.throws(
    () => validiereSturzZeitpunkt({ sturzDatum: '2026-08-27', sturzUhrzeit: '25:99' }),
    /Format SS:MM/,
  )
})

test('validiereSturzZeitpunkt lehnt ein Datum in der Zukunft ab', () => {
  assert.throws(
    () => validiereSturzZeitpunkt({ sturzDatum: '2099-01-01', sturzUhrzeit: '10:00' }),
    /Zukunft/,
  )
})

test('validiereSturzZeitpunkt lehnt eine Uhrzeit in der Zukunft (heute) ab', () => {
  const heute = heuteBerlin()
  // Statt eines festen "23:59" (flake-Risiko in den letzten Minuten vor
  // Mitternacht) eine Stunde weit hinter der aktuellen Berlin-Zeit wählen,
  // die garantiert noch am selben Kalendertag liegt.
  const jetzt = berlinParts(new Date())
  const stunde = Number(jetzt.hour)
  const zukunftsZeit = stunde < 23
    ? `${String(stunde + 1).padStart(2, '0')}:00`
    : `23:${String(Math.min(Number(jetzt.minute) + 10, 59)).padStart(2, '0')}`
  assert.throws(
    () => validiereSturzZeitpunkt({ sturzDatum: heute, sturzUhrzeit: zukunftsZeit }),
    /Sturzuhrzeit darf nicht in der Zukunft/,
  )
})

test('validiereSturzZeitpunkt akzeptiert einen plausiblen vergangenen Zeitpunkt und liefert ISO zurück', () => {
  const iso = validiereSturzZeitpunkt({ sturzDatum: '2026-01-15', sturzUhrzeit: '14:30' })
  assert.match(iso, /^2026-01-15T/)
})

test('validiereSturzprotokollListen lehnt unbekannten Sturzort ab', () => {
  assert.throws(
    () => validiereSturzprotokollListen({ sturzOrt: 'Garten', verletzungen: [], sturzrisikoFaktoren: [] }),
    /Ungültiger Sturzort/,
  )
})

test('validiereSturzprotokollListen lehnt Nicht-Listen und unbekannte Werte ab', () => {
  assert.throws(
    () => validiereSturzprotokollListen({ sturzOrt: 'Bad', verletzungen: 'prellungen', sturzrisikoFaktoren: [] }),
    /Verletzungen muss eine Liste sein/,
  )
  assert.throws(
    () => validiereSturzprotokollListen({ sturzOrt: 'Bad', verletzungen: ['amputation'], sturzrisikoFaktoren: [] }),
    /Verletzungen enthält einen ungültigen Wert/,
  )
  assert.throws(
    () => validiereSturzprotokollListen({ sturzOrt: 'Bad', verletzungen: [], sturzrisikoFaktoren: ['erdbeben'] }),
    /Sturzrisikofaktoren enthält einen ungültigen Wert/,
  )
})

test('validiereSturzprotokollListen akzeptiert gültige Werte', () => {
  assert.doesNotThrow(() => validiereSturzprotokollListen({
    sturzOrt: 'Bad', verletzungen: ['prellungen', 'schuerfen'], sturzrisikoFaktoren: ['schwindel'],
  }))
})
