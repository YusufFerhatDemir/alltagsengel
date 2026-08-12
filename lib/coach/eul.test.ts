// Ergänzende Unterstützungsleistungen — node:test
// Ausführen: npx tsx --test lib/coach/eul.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ABGRENZUNG, EUL_DEFINITIONEN, EUL_LEISTUNGSARTEN, EUL_QUALITAETSKRITERIEN,
  istEulLeistungsart, pruefeEulFreigabe, pruefeNachweisVollstaendig,
} from './eul'

const HEUTE = '2026-08-12'

function alleErfuellt(gueltigBis: string | null = null) {
  return EUL_QUALITAETSKRITERIEN.filter(k => k.pflicht).map(k => ({
    kriterium_key: k.key,
    erfuellt: true,
    gueltig_bis: gueltigBis,
  }))
}

test('Freigabe nur bei vollständigen Pflichtnachweisen', () => {
  assert.deepEqual(pruefeEulFreigabe(alleErfuellt(), HEUTE), { freigegeben: true })
})

test('fehlender Nachweis blockiert den Einsatz', () => {
  const ohneEinen = alleErfuellt().slice(1)
  const r = pruefeEulFreigabe(ohneEinen, HEUTE)
  assert.equal(r.freigegeben, false)
  assert.ok(r.freigegeben === false && r.fehlend.length === 1)
})

test('abgelaufener Nachweis blockiert den Einsatz', () => {
  const r = pruefeEulFreigabe(alleErfuellt('2026-08-11'), HEUTE)
  assert.equal(r.freigegeben, false)
  assert.ok(r.freigegeben === false && r.fehlend.every(f => f.includes('abgelaufen')))
})

test('nicht erfüllter Nachweis zählt wie ein fehlender', () => {
  const zeilen = alleErfuellt().map((z, i) => (i === 0 ? { ...z, erfuellt: false } : z))
  assert.equal(pruefeEulFreigabe(zeilen, HEUTE).freigegeben, false)
})

test('ohne jeden Nachweis keine Freigabe (fail-closed)', () => {
  const r = pruefeEulFreigabe([], HEUTE)
  assert.equal(r.freigegeben, false)
  assert.ok(r.freigegeben === false && r.fehlend.length === EUL_QUALITAETSKRITERIEN.filter(k => k.pflicht).length)
})

test('Nachweis-Vollständigkeit prüft Inhalt, Dauer und Qualifikation', () => {
  const gut = {
    leistungsart: 'einweisung',
    datum: '2026-08-12',
    dauer_minuten: 60,
    inhalt: 'Zugang eingerichtet, Bedienung und Schriftgröße erklärt.',
    erbringer_name: 'Alltagsengel',
    qualifikation_geprueft: true,
  }
  assert.deepEqual(pruefeNachweisVollstaendig(gut), { vollstaendig: true })

  const ohneInhalt = pruefeNachweisVollstaendig({ ...gut, inhalt: 'kurz' })
  assert.equal(ohneInhalt.vollstaendig, false)

  const ohneQuali = pruefeNachweisVollstaendig({ ...gut, qualifikation_geprueft: false })
  assert.equal(ohneQuali.vollstaendig, false)

  const falscheDauer = pruefeNachweisVollstaendig({ ...gut, dauer_minuten: 0 })
  assert.equal(falscheDauer.vollstaendig, false)

  const falscheArt = pruefeNachweisVollstaendig({ ...gut, leistungsart: 'pflegeberatung' })
  assert.equal(falscheArt.vollstaendig, false)
})

test('istEulLeistungsart weist Unbekanntes ab', () => {
  assert.equal(istEulLeistungsart('einweisung'), true)
  assert.equal(istEulLeistungsart('pflegeberatung'), false)
  assert.equal(istEulLeistungsart(undefined), false)
})

test('jede Leistungsart hat eine Definition mit Nachweisinhalt', () => {
  for (const art of EUL_LEISTUNGSARTEN) {
    const d = EUL_DEFINITIONEN[art]
    assert.ok(d, `Definition fehlt für ${art}`)
    assert.ok(d.nachweisinhalt.length > 0)
    assert.ok(d.richtdauerMinuten > 0)
  }
})

test('Abgrenzung ordnet pflegefachliche Beratung ausdrücklich nicht als eUL ein', () => {
  const beratung = ABGRENZUNG.find(r => r.taetigkeit.includes('Pflegefachliche Beratung'))
  assert.ok(beratung)
  assert.equal(beratung.einordnung, 'weder_noch')
})
