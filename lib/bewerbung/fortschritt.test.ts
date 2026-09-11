import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  berechneFortschritt, stufeFuer, erinnerungSinnvoll, FORTSCHRITT_STUFEN,
} from './fortschritt'
import type { BewerbungDaten } from './katalog'

const vollstaendig = {
  name: 'Aysel Demir',
  email: 'aysel@example.org',
  phone: '069 1234567',
  plz: '60311',
  daten: {
    qualifikation: 'Quereinsteigerin',
    verfuegbarkeit: ['vormittags'],
    stunden: '10-20',
    beschaeftigungsart: 'minijob',
    fuehrerschein: 'ja',
    sprachen: ['Deutsch', 'Türkisch'],
  } as unknown as BewerbungDaten,
}

test('Gewichte summieren sich auf 100', () => {
  // Stimmt das nicht, ist „Prozent" eine erfundene Zahl.
  const summe = berechneFortschritt({}).schritte.reduce((s, x) => s + x.gewicht, 0)
  assert.equal(summe, 100)
})

test('vollständige Angaben ergeben 100 Prozent und keine offenen Punkte', () => {
  const f = berechneFortschritt(vollstaendig)
  assert.equal(f.prozent, 100)
  assert.deepEqual(f.offen, [])
  assert.equal(f.kontaktierbar, true)
})

test('leere Bewerbung ergibt 0 Prozent und ist nicht kontaktierbar', () => {
  const f = berechneFortschritt({})
  assert.equal(f.prozent, 0)
  assert.equal(f.kontaktierbar, false)
  assert.equal(f.offen.length, f.schritte.length)
})

test('Gewichtung stellt Erreichbarkeit vor Nebenangaben', () => {
  // Der Grund für die Gewichtung: wer nur Nebenfelder ausfüllt, darf nicht
  // besser dastehen als wer erreichbar ist.
  const nurNebensachen = berechneFortschritt({
    daten: {
      stunden: '10-20', beschaeftigungsart: 'minijob',
      fuehrerschein: 'ja', sprachen: ['Deutsch'],
    } as unknown as BewerbungDaten,
  })
  const nurErreichbar = berechneFortschritt({
    name: 'Aysel Demir', email: 'aysel@example.org', phone: '069 1234567',
  })
  assert.ok(
    nurErreichbar.prozent > nurNebensachen.prozent,
    `erreichbar (${nurErreichbar.prozent} %) muss über Nebenangaben (${nurNebensachen.prozent} %) liegen`,
  )
})

test('offene Punkte stehen nach Gewicht, das Wichtigste zuerst', () => {
  const f = berechneFortschritt({ name: 'Aysel Demir' })
  const gewichte = f.offen.map(o => o.gewicht)
  assert.deepEqual(gewichte, [...gewichte].sort((a, b) => b - a))
  assert.ok(f.offen.every(o => o.hinweis), 'jeder offene Punkt braucht einen Hinweis')
})

test('Telefon allein macht kontaktierbar, E-Mail allein auch', () => {
  assert.equal(berechneFortschritt({ phone: '069 1234567' }).kontaktierbar, true)
  assert.equal(berechneFortschritt({ email: 'a@example.org' }).kontaktierbar, true)
  assert.equal(berechneFortschritt({ name: 'Aysel Demir' }).kontaktierbar, false)
})

test('Führungszeugnis ist kein Schritt', () => {
  // Es kommt als Papier in die Personalakte. Als Schritt stünde es
  // dauerhaft auf „fehlt" und verfälschte jede Anzeige.
  const keys = berechneFortschritt({}).schritte.map(s => s.key)
  assert.ok(!keys.some(k => k.includes('fuehrungszeugnis')))
})

test('stufeFuer deckt jede Stufe ab und kennt keine Lücke', () => {
  assert.equal(stufeFuer(100), 'vollstaendig')
  assert.equal(stufeFuer(70), 'gut')
  assert.equal(stufeFuer(69), 'luecken')
  assert.equal(stufeFuer(40), 'luecken')
  assert.equal(stufeFuer(39), 'duenn')
  assert.equal(stufeFuer(0), 'duenn')
  for (let p = 0; p <= 100; p++) {
    assert.ok(FORTSCHRITT_STUFEN[stufeFuer(p)], `keine Stufe für ${p} %`)
  }
})

test('erinnerungSinnvoll verlangt offenen Stand, Lücken UND eine E-Mail', () => {
  const luecken = { name: 'Aysel Demir', email: 'aysel@example.org' }

  assert.equal(erinnerungSinnvoll(luecken, 'new'), true)
  assert.equal(erinnerungSinnvoll(luecken, 'contacted'), true)

  // Endzustände: da ist nichts mehr nachzufassen.
  for (const status of ['qualified', 'converted', 'lost']) {
    assert.equal(erinnerungSinnvoll(luecken, status), false, `Status ${status}`)
  }

  // Ohne E-Mail kein Anschreiben — telefonisch entscheidet ein Mensch.
  assert.equal(erinnerungSinnvoll({ name: 'Aysel Demir', phone: '069 1234567' }, 'new'), false)

  // Wer vollständig ist, braucht keine Nachfrage.
  assert.equal(erinnerungSinnvoll(vollstaendig, 'new'), false)
})
