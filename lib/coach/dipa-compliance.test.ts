// PflegeCoach — DiPA-Compliance-Checks — node:test
// Ausführen: npx tsx --test lib/coach/dipa-compliance.test.ts (oder npm run test:unit)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  antragsreife, formatiereBlocker, pruefeDokumentStand, pruefeKritischeDokumente,
  KRITISCHE_DOKUMENTE, zeitklasseLabel,
} from './dipa-compliance'
import type { KatalogEintrag } from './anforderungskatalog'

const basisEintrag: KatalogEintrag = {
  id: 'AK-TEST-01', kategorie: 'produkt_zweckbestimmung',
  formulierung: 'Ein Testeintrag zur Prüfung der Blocker-Verdichtung, absichtlich mit einer Formulierung, die deutlich länger als 72 Zeichen ist.',
  quelle: 'Test', anforderungstextGeprueft: true, stand: 'offen', klasse: 'D',
  nachweis: null, nachweisDateien: [], gapId: null, verantwortlich: 'extern',
}

test('antragsreife: leerer Katalog ist bereit (keine Zeitklasse-A-Punkte)', () => {
  const bericht = antragsreife([])
  assert.equal(bericht.bereit, true)
  assert.deepEqual(bericht.blocker, [])
})

test('antragsreife: nicht erfüllter AK-SEC-01 (Zeitklasse A, Klasse D) zählt als externer Blocker', () => {
  const katalog: KatalogEintrag[] = [{ ...basisEintrag, id: 'AK-SEC-01' }]
  const bericht = antragsreife(katalog)
  assert.equal(bericht.bereit, false)
  assert.equal(bericht.blocker.length, 1)
  assert.equal(bericht.blockerExtern, 1)
  assert.equal(bericht.blockerIntern, 0)
})

test('antragsreife: nicht erfüllter AK-VS-02 (Zeitklasse A, Klasse C) zählt als interner Blocker', () => {
  const katalog: KatalogEintrag[] = [{ ...basisEintrag, id: 'AK-VS-02', klasse: 'C' }]
  const bericht = antragsreife(katalog)
  assert.equal(bericht.blockerIntern, 1)
  assert.equal(bericht.blockerExtern, 0)
})

test('antragsreife: erfüllter Zeitklasse-A-Punkt ist kein Blocker mehr', () => {
  const katalog: KatalogEintrag[] = [{ ...basisEintrag, id: 'AK-SEC-01', stand: 'erfuellt' }]
  assert.equal(antragsreife(katalog).bereit, true)
})

test('antragsreife: Punkt ohne Zeitklassen-Eintrag ist nie ein Blocker', () => {
  const katalog: KatalogEintrag[] = [{ ...basisEintrag, id: 'AK-NICHT-KLASSIFIZIERT' }]
  assert.equal(antragsreife(katalog).bereit, true)
})

test('formatiereBlocker: kürzt lange Formulierungen mit Ellipse', () => {
  const text = formatiereBlocker(basisEintrag)
  assert.ok(text.startsWith('AK-TEST-01 [D] '))
  assert.ok(text.endsWith('…'))
  assert.ok(text.length < basisEintrag.formulierung.length)
})

test('pruefeDokumentStand: findet Stand-Datum und bewertet Aktualität', () => {
  const inhalt = '# Titel\n\n**Stand:** 2026-08-01 · **Block:** 15b\n'
  const ergebnis = pruefeDokumentStand(inhalt, '2026-08-15', 180)
  assert.equal(ergebnis.gefunden, true)
  assert.equal(ergebnis.datum, '2026-08-01')
  assert.equal(ergebnis.tageAlt, 14)
  assert.equal(ergebnis.aktuell, true)
})

test('pruefeDokumentStand: Dokument älter als maxTageAlter gilt als nicht aktuell', () => {
  const inhalt = '**Stand:** 2025-01-01\n'
  const ergebnis = pruefeDokumentStand(inhalt, '2026-08-15', 180)
  assert.equal(ergebnis.aktuell, false)
  assert.ok((ergebnis.tageAlt ?? 0) > 180)
})

test('pruefeDokumentStand: fehlendes Stand-Feld wird als nicht gefunden gemeldet', () => {
  const ergebnis = pruefeDokumentStand('# Titel ohne Stand-Zeile', '2026-08-15', 180)
  assert.equal(ergebnis.gefunden, false)
  assert.equal(ergebnis.aktuell, false)
})

test('pruefeDokumentStand: Datum in der Zukunft ist nicht aktuell (keine negative Alterslogik)', () => {
  const ergebnis = pruefeDokumentStand('**Stand:** 2026-12-31', '2026-08-15', 180)
  assert.equal(ergebnis.aktuell, false)
})

test('pruefeKritischeDokumente: fehlende Datei wird als nicht gefunden markiert, kein Absturz', () => {
  const befunde = pruefeKritischeDokumente(() => null, '2026-08-15', [
    { pfad: 'nicht/vorhanden.md', deckt: ['AK-TEST'], maxTageAlter: 90 },
  ])
  assert.equal(befunde.length, 1)
  assert.equal(befunde[0].pruefung.gefunden, false)
})

test('pruefeKritischeDokumente: injizierter Leser bekommt den richtigen Pfad', () => {
  const angefragtePfade: string[] = []
  pruefeKritischeDokumente(
    pfad => { angefragtePfade.push(pfad); return '**Stand:** 2026-08-15' },
    '2026-08-15'
  )
  assert.deepEqual(angefragtePfade, KRITISCHE_DOKUMENTE.map(d => d.pfad))
})

test('zeitklasseLabel: bekannte Kennung liefert Klartext, unbekannte liefert Platzhalter', () => {
  assert.equal(zeitklasseLabel('AK-SEC-01'), 'Muss vor Antragstellung vorliegen')
  assert.equal(zeitklasseLabel('AK-UNBEKANNT'), '—')
})
