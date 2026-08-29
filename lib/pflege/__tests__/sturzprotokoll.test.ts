// ═══════════════════════════════════════════════════════════════
// Tests: Sturzprotokoll — Format-/Plausibilitätsvalidierung
// Ausführen: npm run test:unit
// ═══════════════════════════════════════════════════════════════

import { test, mock } from 'node:test'
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
  // FRUEHER WACKELIG, jetzt fest: der Test rechnete "jetzt + 15 Minuten"
  // aus der echten Uhr und nahm ausdruecklich ein „vernachlaessigbares
  // Zeitfenster" in Kauf. Am 29.08.2026 um 23:54 Berlin war es genau das
  // nicht mehr: 15 Minuten spaeter ist der naechste Tag, die berechnete
  // „Zukunftszeit" lautete 00:09 und liegt am HEUTIGEN Datum in der
  // Vergangenheit — der Fall wurde rot, ohne dass an der Fachlogik etwas
  // falsch war.
  //
  // Der Lauf hat dabei einen echten Fehler aufgedeckt (siehe den Fall
  // darunter). Damit das nicht vom Zufall der Uhrzeit abhaengt, steht die
  // Uhr hier still.
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-29T12:00:00Z') })
  try {
    const heute = heuteBerlin()          // 2026-08-29
    const jetzt = berlinParts(new Date()) // 14:00 (MESZ)
    const zukunft = `${String(Number(jetzt.hour) + 1).padStart(2, '0')}:${jetzt.minute}`
    assert.throws(
      () => validiereSturzZeitpunkt({ sturzDatum: heute, sturzUhrzeit: zukunft }),
      /Sturzuhrzeit darf nicht in der Zukunft/,
    )
  } finally {
    mock.timers.reset()
  }
})

test('validiereSturzZeitpunkt nimmt kurz vor Mitternacht noch einen Nachtrag an', () => {
  // BEFUND 29.08.2026: Der 5-Minuten-Puffer wurde als
  // `berlinParts(now + 5min)` gebildet. In den letzten fuenf Minuten des
  // Tages kippt das ueber Mitternacht: `puffer.hour` ist '00', die
  // Obergrenze also '00:03' — und JEDE Uhrzeit dieses Tages ist groesser.
  // Ein Sturz von 14:30, um 23:57 nachgetragen, wurde mit
  // „Sturzuhrzeit darf nicht in der Zukunft liegen" abgewiesen.
  //
  // Fuenf Minuten am Tag, in denen das Sturzprotokoll nicht erfassbar ist
  // — und ausgerechnet ein Sturz wird oft am Ende der Spaetschicht
  // nachgetragen.
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-29T21:57:00Z') }) // 23:57 MESZ
  try {
    const heute = heuteBerlin()
    assert.equal(berlinParts(new Date()).hour, '23', 'Vorbedingung: es ist 23 Uhr in Berlin')
    // Am alten Stand warf dieser Aufruf.
    const iso = validiereSturzZeitpunkt({ sturzDatum: heute, sturzUhrzeit: '14:30' })
    assert.match(iso, /T/)
  } finally {
    mock.timers.reset()
  }
})

test('validiereSturzZeitpunkt weist kurz vor Mitternacht trotzdem den naechsten Tag ab', () => {
  // Die Ausnahme oben darf nicht zur Hintertuer werden: das Tagesende ist
  // die Obergrenze, nicht die Aufhebung der Pruefung.
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-29T21:57:00Z') })
  try {
    assert.throws(
      () => validiereSturzZeitpunkt({ sturzDatum: '2026-08-30', sturzUhrzeit: '00:30' }),
      /Sturzdatum darf nicht in der Zukunft/,
    )
  } finally {
    mock.timers.reset()
  }
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
