// PflegeCoach Preise und Verkaufssperre — node:test
// Ausführen: npx tsx --test lib/coach/pricing.test.ts
//
// Der wichtigste Test dieser Datei ist der erste: dass der Verkauf im
// Vorgabezustand GESPERRT ist. Die Beträge in pricing.ts sind
// Platzhalter — würde die Sperre je versehentlich wegfallen, würden
// erfundene Beträge tatsächlich abgebucht.

import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  alleTarife, COACH_TARIF_KEYS, formatiereCent, istTarifKey, istVerkaufBereit,
  jahresErsparnis, KLEINUNTERNEHMER_HINWEIS, preiseFreigegeben, proMonatCent,
  steuerEinstellung, tarif, verkaufMoeglich,
} from './pricing'

/** Env-Zustand je Test wiederherstellen — sonst färben Tests aufeinander ab. */
const GESICHERT = [
  'COACH_PREISE_FREIGEGEBEN', 'COACH_PREIS_MONATLICH_CENT', 'COACH_PREIS_JAEHRLICH_CENT',
  'COACH_STRIPE_PRICE_MONATLICH', 'COACH_STRIPE_PRICE_JAEHRLICH', 'STRIPE_SECRET_KEY',
  'COACH_UST_KLEINUNTERNEHMER', 'COACH_UST_SATZ', 'COACH_TESTPHASE_MONATLICH_TAGE',
]
let sicherung: Record<string, string | undefined> = {}

beforeEach(() => {
  sicherung = Object.fromEntries(GESICHERT.map(k => [k, process.env[k]]))
  for (const k of GESICHERT) delete process.env[k]
})

afterEach(() => {
  for (const [k, v] of Object.entries(sicherung)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

/** Alle vier Voraussetzungen für einen verkäuflichen Tarif setzen. */
function machVerkaufsbereit(): void {
  process.env.COACH_PREISE_FREIGEGEBEN = 'true'
  process.env.STRIPE_SECRET_KEY = 'sk_test_beispiel'
  process.env.COACH_STRIPE_PRICE_MONATLICH = 'price_monatlich'
  process.env.COACH_STRIPE_PRICE_JAEHRLICH = 'price_jaehrlich'
}

// ─── Verkaufssperre (fail-closed) ──────────────────────────────

test('Verkauf ist im Vorgabezustand gesperrt', () => {
  // DER zentrale Test: Ohne ausdrückliche Freigabe wird nichts verkauft.
  assert.equal(preiseFreigegeben(), false)
  assert.equal(verkaufMoeglich(), false)
})

test('Freigabe gilt nur bei exakt "true"', () => {
  for (const wert of ['TRUE', '1', 'ja', 'yes', '']) {
    process.env.COACH_PREISE_FREIGEGEBEN = wert
    assert.equal(preiseFreigegeben(), false, wert)
  }
})

test('fehlende Preisfreigabe wird als Sperrgrund benannt', () => {
  const p = istVerkaufBereit(tarif('monatlich'))
  assert.equal(p.bereit, false)
  if (!p.bereit) assert.equal(p.code, 'PREISE_NICHT_FREIGEGEBEN')
})

test('ohne Stripe-Schlüssel bleibt gesperrt — auch bei freigegebenen Preisen', () => {
  process.env.COACH_PREISE_FREIGEGEBEN = 'true'
  process.env.COACH_STRIPE_PRICE_MONATLICH = 'price_x'
  const p = istVerkaufBereit(tarif('monatlich'))
  assert.equal(p.bereit, false)
  if (!p.bereit) assert.equal(p.code, 'STRIPE_NICHT_KONFIGURIERT')
})

test('fehlende Price-ID sperrt nur den betroffenen Tarif', () => {
  // Kein stiller Fallback auf den anderen Tarif: Wer monatlich bestellen
  // will, darf nicht unbemerkt ein Jahresabo bekommen.
  machVerkaufsbereit()
  delete process.env.COACH_STRIPE_PRICE_MONATLICH

  const monatlich = istVerkaufBereit(tarif('monatlich'))
  assert.equal(monatlich.bereit, false)
  if (!monatlich.bereit) assert.equal(monatlich.code, 'PREIS_ID_FEHLT')

  assert.equal(istVerkaufBereit(tarif('jaehrlich')).bereit, true)
  // Ein bestellbarer Tarif genügt, damit der Verkaufsweg offen ist.
  assert.equal(verkaufMoeglich(), true)
})

test('Betrag 0 sperrt den Tarif', () => {
  machVerkaufsbereit()
  process.env.COACH_PREIS_MONATLICH_CENT = '0'
  const p = istVerkaufBereit(tarif('monatlich'))
  assert.equal(p.bereit, false)
  if (!p.bereit) assert.equal(p.code, 'BETRAG_UNGUELTIG')
})

test('mit allen vier Voraussetzungen ist der Verkauf frei', () => {
  machVerkaufsbereit()
  assert.equal(verkaufMoeglich(), true)
  for (const key of COACH_TARIF_KEYS) {
    assert.equal(istVerkaufBereit(tarif(key)).bereit, true, key)
  }
})

// ─── Preis-Konfiguration ───────────────────────────────────────

test('Beträge kommen aus der Umgebung', () => {
  process.env.COACH_PREIS_MONATLICH_CENT = '2490'
  assert.equal(tarif('monatlich').betragCent, 2490)
})

test('unbrauchbare Beträge fallen auf die Vorgabe zurück statt NaN zu führen', () => {
  // Ein NaN im Betrag würde bis in die Rechnung durchschlagen.
  const vorgabe = tarif('monatlich').betragCent
  for (const muell of ['abc', '19,90', '-500', '19.5']) {
    process.env.COACH_PREIS_MONATLICH_CENT = muell
    assert.equal(tarif('monatlich').betragCent, vorgabe, muell)
  }
})

test('Testphase ist konfigurierbar, 0 bleibt 0', () => {
  process.env.COACH_TESTPHASE_MONATLICH_TAGE = '14'
  assert.equal(tarif('monatlich').testphaseTage, 14)
  process.env.COACH_TESTPHASE_MONATLICH_TAGE = '0'
  assert.equal(tarif('monatlich').testphaseTage, 0)
})

test('genau zwei Tarife mit passendem Intervall', () => {
  assert.equal(alleTarife().length, 2)
  assert.equal(tarif('monatlich').intervallMonate, 1)
  assert.equal(tarif('jaehrlich').intervallMonate, 12)
})

test('istTarifKey erkennt gültige Schlüssel und weist andere ab', () => {
  assert.equal(istTarifKey('monatlich'), true)
  assert.equal(istTarifKey('jaehrlich'), true)
  for (const falsch of ['woechentlich', '', null, undefined, 42, {}]) {
    assert.equal(istTarifKey(falsch), false, String(falsch))
  }
})

// ─── Ersparnis-Darstellung ─────────────────────────────────────

test('Ersparnis wird nur genannt, wenn der Jahrestarif wirklich günstiger ist', () => {
  process.env.COACH_PREIS_MONATLICH_CENT = '2000'
  process.env.COACH_PREIS_JAEHRLICH_CENT = '20000'
  const e = jahresErsparnis()
  assert.notEqual(e, null)
  assert.equal(e?.betragCent, 4000)
  assert.equal(e?.prozent, 17)
})

test('keine Ersparnis-Behauptung, wenn der Jahrestarif nicht günstiger ist', () => {
  // Sonst stünde auf der Verkaufsseite ein Vorteil, den es nicht gibt.
  process.env.COACH_PREIS_MONATLICH_CENT = '2000'
  process.env.COACH_PREIS_JAEHRLICH_CENT = '24000'
  assert.equal(jahresErsparnis(), null)
  process.env.COACH_PREIS_JAEHRLICH_CENT = '30000'
  assert.equal(jahresErsparnis(), null)
})

test('proMonatCent rechnet den Vergleichswert', () => {
  process.env.COACH_PREIS_JAEHRLICH_CENT = '24000'
  assert.equal(proMonatCent(tarif('jaehrlich')), 2000)
})

// ─── Umsatzsteuer ──────────────────────────────────────────────

test('Vorgabe ist Kleinunternehmer mit Pflichthinweis', () => {
  // Konservativ mit Absicht: lieber keine Steuer ausweisen als eine falsche.
  const s = steuerEinstellung()
  assert.equal(s.kleinunternehmer, true)
  assert.equal(s.satzProzent, 0)
  assert.equal(s.hinweis, KLEINUNTERNEHMER_HINWEIS)
  assert.ok(s.hinweis?.includes('§ 19 UStG'))
})

test('Regelbesteuerung nutzt den konfigurierten Satz ohne Hinweis', () => {
  process.env.COACH_UST_KLEINUNTERNEHMER = 'false'
  process.env.COACH_UST_SATZ = '7'
  const s = steuerEinstellung()
  assert.equal(s.kleinunternehmer, false)
  assert.equal(s.satzProzent, 7)
  assert.equal(s.hinweis, null)
})

test('Regelbesteuerung ohne brauchbaren Satz nimmt 19 %', () => {
  process.env.COACH_UST_KLEINUNTERNEHMER = 'false'
  process.env.COACH_UST_SATZ = 'abc'
  assert.equal(steuerEinstellung().satzProzent, 19)
})

// ─── Formatierung ──────────────────────────────────────────────

test('formatiereCent gibt deutsche Euro-Beträge ohne Centverlust aus', () => {
  // Intl setzt ein schmales geschütztes Leerzeichen vor das €-Zeichen;
  // der direkte Vergleich mit einem normalen Leerzeichen schlüge fehl.
  const norm = (s: string) => s.replace(/ | /g, ' ')
  assert.equal(norm(formatiereCent(1900)), '19,00 €')
  assert.equal(norm(formatiereCent(19000)), '190,00 €')
  assert.equal(norm(formatiereCent(1999)), '19,99 €')
  assert.equal(norm(formatiereCent(0)), '0,00 €')
})
