// PflegeCoach Abrechnungswege + Anforderungskatalog — node:test
// Ausführen: npx tsx --test lib/coach/abrechnung.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ABRECHNUNGSWEG_VORLAGEN, istAbrechnungsbereit, istSchluesselGueltig } from './abrechnung'
import { ANFORDERUNGSKATALOG, katalogFortschritt, katalogNachKategorie } from './anforderungskatalog'

test('ohne geklärte Vergütung ist keine Abrechnung möglich (fail-closed)', () => {
  const weg = { schluessel: 'direkt_pflegekasse', bezeichnung: 'Direkt', aktiv: true, verguetung_geklaert: false }
  const r = istAbrechnungsbereit(weg)
  assert.equal(r.bereit, false)
  assert.ok(r.bereit === false && r.grund.includes('Vergütungsvereinbarung'))
})

test('inaktiver Weg ist nicht abrechnungsbereit', () => {
  const weg = { schluessel: 'x', bezeichnung: 'X', aktiv: false, verguetung_geklaert: true }
  assert.equal(istAbrechnungsbereit(weg).bereit, false)
})

test('fehlender Weg ist nicht abrechnungsbereit', () => {
  assert.equal(istAbrechnungsbereit(null).bereit, false)
  assert.equal(istAbrechnungsbereit(undefined).bereit, false)
})

test('aktiv und Vergütung geklärt → bereit', () => {
  const weg = { schluessel: 'x', bezeichnung: 'X', aktiv: true, verguetung_geklaert: true }
  assert.deepEqual(istAbrechnungsbereit(weg), { bereit: true })
})

test('Vorlagen enthalten keine Beträge', () => {
  const text = JSON.stringify(ABRECHNUNGSWEG_VORLAGEN)
  assert.ok(!/€|EUR|\bEuro\b/i.test(text), 'Eine Vorlage nennt einen Betrag — das ist bewusst verboten.')
  assert.ok(!/\d+[,.]\d{2}/.test(text), 'Eine Vorlage enthält einen Geldbetrag.')
  for (const v of ABRECHNUNGSWEG_VORLAGEN) {
    assert.ok(v.voraussetzungen.length > 0)
    assert.ok(v.rechtsgrundlage.length > 0)
  }
})

test('Schlüsselformat', () => {
  assert.equal(istSchluesselGueltig('direkt_pflegekasse'), true)
  assert.equal(istSchluesselGueltig('AB'), false)
  assert.equal(istSchluesselGueltig('mit leerzeichen'), false)
  assert.equal(istSchluesselGueltig('Gross'), false)
})

test('Katalog: erfüllt zählt nur mit geprüftem Anforderungstext', () => {
  const f = katalogFortschritt([
    {
      id: 'T1', kategorie: 'datenschutz', formulierung: 'x', quelle: 'y',
      anforderungstextGeprueft: false, stand: 'erfuellt', nachweis: null, gapId: null,
      verantwortlich: 'technik',
    },
  ])
  assert.equal(f.erfuellt, 1)
  assert.equal(f.quote, 0)
  assert.equal(f.ungeprueft, 1)
})

test('Katalog: nicht anwendbare Einträge gehen nicht in die Quote ein', () => {
  const f = katalogFortschritt([
    {
      id: 'T1', kategorie: 'datenschutz', formulierung: 'x', quelle: 'y',
      anforderungstextGeprueft: true, stand: 'erfuellt', nachweis: null, gapId: null,
      verantwortlich: 'technik',
    },
    {
      id: 'T2', kategorie: 'datenschutz', formulierung: 'x', quelle: 'y',
      anforderungstextGeprueft: true, stand: 'nicht_anwendbar', nachweis: null, gapId: null,
      verantwortlich: 'technik',
    },
  ])
  assert.equal(f.quote, 1)
})

test('Katalog: jeder Eintrag hat eindeutige ID und eine Quelle', () => {
  const ids = new Set(ANFORDERUNGSKATALOG.map(e => e.id))
  assert.equal(ids.size, ANFORDERUNGSKATALOG.length)
  for (const e of ANFORDERUNGSKATALOG) {
    assert.ok(e.quelle.length > 0, `${e.id} ohne Quelle`)
    assert.ok(e.formulierung.length > 0)
  }
})

test('Katalog: offene Einträge verweisen auf einen Gap oder einen Nachweis', () => {
  for (const e of ANFORDERUNGSKATALOG) {
    if (e.stand === 'offen') {
      assert.ok(e.gapId || e.nachweis, `${e.id} ist offen, nennt aber weder Gap noch Nachweis`)
    }
  }
})

test('Katalog: Gruppierung verliert keine Einträge', () => {
  const summe = katalogNachKategorie().reduce((n, g) => n + g.eintraege.length, 0)
  assert.equal(summe, ANFORDERUNGSKATALOG.length)
})
