// ═══════════════════════════════════════════════════════════════
// Welle 6 — Einsatz-Kette (lib/bookings/einsatz-kette.ts)
// ═══════════════════════════════════════════════════════════════
//
// Reine Funktionen der Buchung→Einsatz-Kette:
//   EinsatzKetteFehler, istEinsatzKetteFehler,
//   buchungsLeistungsart, aufloesbareBuchungsleistungen, endzeitAus
//
// Die Supabase-abhängigen Teile (erstelleEinsatzAusBuchung u. a.) sind
// hier bewusst NICHT geprüft — sie brauchen eine Datenbank.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  EinsatzKetteFehler,
  istEinsatzKetteFehler,
  buchungsLeistungsart,
  aufloesbareBuchungsleistungen,
  endzeitAus,
} from '../bookings/einsatz-kette'
import { TARIF_LEISTUNGSARTEN } from '../billing/leistungsarten'

// ───────────────────────────────────────────────────────────────
describe('EinsatzKetteFehler', () => {
  test('trägt Code, Details und Standard-HTTP-Status 422', () => {
    const f = new EinsatzKetteFehler('KEINE_TARIFZUORDNUNG', 'Text', { service: 'Apotheke' })
    assert.equal(f.code, 'KEINE_TARIFZUORDNUNG')
    assert.deepEqual(f.details, { service: 'Apotheke' })
    assert.equal(f.httpStatus, 422)
    assert.equal(f.name, 'EinsatzKetteFehler')
    assert.equal(f.message, 'Text')
    assert.ok(f instanceof Error)
  })

  test('HTTP-Status ist überschreibbar (409 Konflikt, 500 technisch)', () => {
    assert.equal(new EinsatzKetteFehler('X' as never, 'a', {}, 409).httpStatus, 409)
    assert.equal(new EinsatzKetteFehler('X' as never, 'a', {}, 500).httpStatus, 500)
  })

  test('ohne Details ist details ein leeres Objekt, nicht undefined', () => {
    assert.deepEqual(new EinsatzKetteFehler('X' as never, 'a').details, {})
  })
})

describe('istEinsatzKetteFehler', () => {
  test('erkennt den eigenen Fehlertyp', () => {
    assert.equal(istEinsatzKetteFehler(new EinsatzKetteFehler('X' as never, 'a')), true)
  })

  test('gewöhnliche Fehler und Fremdwerte sind es nicht', () => {
    assert.equal(istEinsatzKetteFehler(new Error('a')), false)
    assert.equal(istEinsatzKetteFehler(null), false)
    assert.equal(istEinsatzKetteFehler(undefined), false)
    assert.equal(istEinsatzKetteFehler('EinsatzKetteFehler'), false)
    assert.equal(istEinsatzKetteFehler({ code: 'X', httpStatus: 422 }), false)
  })
})

// ───────────────────────────────────────────────────────────────
describe('buchungsLeistungsart', () => {
  test('leere Eingaben lösen nichts auf', () => {
    assert.equal(buchungsLeistungsart(null), null)
    assert.equal(buchungsLeistungsart(undefined), null)
    assert.equal(buchungsLeistungsart(''), null)
  })

  test('kanonische Tarif-Schlüssel gehen unverändert durch', () => {
    for (const art of TARIF_LEISTUNGSARTEN) {
      assert.equal(buchungsLeistungsart(art), art, `${art} muss sich selbst auflösen`)
    }
  })

  test('Buchungsmasken-Schreibweisen lösen auf den fachlich entschiedenen Tarif auf', () => {
    assert.equal(buchungsLeistungsart('Haushalt'), 'hauswirtschaft')
    assert.equal(buchungsLeistungsart('Einkauf'), 'einkaufsservice')
    assert.equal(buchungsLeistungsart('Arztbesuch'), 'begleitservice')
    assert.equal(buchungsLeistungsart('Arztbesuch-Begleitung'), 'begleitservice')
    assert.equal(buchungsLeistungsart('Spazieren'), 'alltagsbegleitung')
  })

  test('Groß-/Kleinschreibung und Umlaute spielen keine Rolle', () => {
    assert.equal(buchungsLeistungsart('HAUSHALT'), 'hauswirtschaft')
    assert.equal(buchungsLeistungsart('haushalt'), 'hauswirtschaft')
    assert.equal(buchungsLeistungsart('Haushaltshilfe'), 'hauswirtschaft')
  })

  test('die Erfassungs-Aliasse gelten hier ebenfalls', () => {
    assert.equal(buchungsLeistungsart('Einkaufsbegleitung'), 'einkaufsservice')
    assert.equal(buchungsLeistungsart('Betreuung / Gesellschaft'), 'betreuung_45a')
  })

  test('Leistungen ohne Preisentscheidung bleiben fail-closed null', () => {
    // Diese fünf haben bewusst KEINE Zuordnung — sonst würde stillschweigend
    // ein fremder Tarif abgerechnet.
    for (const s of ['Freizeit', 'Freizeitbegleitung', 'Apotheke', 'Aktivitäten', 'Krankenfahrdienst', 'Hygienebox']) {
      assert.equal(buchungsLeistungsart(s), null, `${s} darf keinen Tarif erben`)
    }
  })

  test('unbekannte Schreibweise weicht NICHT auf „sonstige" aus', () => {
    assert.equal(buchungsLeistungsart('Gartenarbeit'), null)
    assert.equal(buchungsLeistungsart('Körperpflege'), null)
  })
})

describe('aufloesbareBuchungsleistungen', () => {
  test('liefert die Buchungs-Schreibweisen sortiert', () => {
    const liste = aufloesbareBuchungsleistungen()
    assert.deepEqual(liste, [...liste].sort())
  })

  test('jeder aufgeführte Eintrag löst tatsächlich auf', () => {
    for (const s of aufloesbareBuchungsleistungen()) {
      assert.notEqual(buchungsLeistungsart(s), null, `${s} steht in der Liste, löst aber nicht auf`)
    }
  })

  test('enthält die fünf Buchungsmasken-Sonderschreibweisen', () => {
    assert.deepEqual(aufloesbareBuchungsleistungen(), [
      'arztbesuch',
      'arztbesuch-begleitung',
      'einkauf',
      'haushalt',
      'spazieren',
    ])
  })
})

// ───────────────────────────────────────────────────────────────
describe('endzeitAus', () => {
  test('rechnet volle Stunden korrekt', () => {
    assert.equal(endzeitAus('08:00', 2), '10:00:00')
    assert.equal(endzeitAus('09:30', 1), '10:30:00')
  })

  test('rechnet Bruchteile in Minuten um', () => {
    assert.equal(endzeitAus('08:00', 1.5), '09:30:00')
    assert.equal(endzeitAus('08:00', 0.25), '08:15:00')
  })

  test('rundet krumme Minuten', () => {
    // 0,33 h = 19,8 min → 20 min
    assert.equal(endzeitAus('10:00', 0.33), '10:20:00')
  })

  test('akzeptiert Sekunden-Anteile im Startwert', () => {
    assert.equal(endzeitAus('08:00:00', 1), '09:00:00')
  })

  test('akzeptiert einstellige Angaben', () => {
    assert.equal(endzeitAus('8:5', 1), '09:05:00')
  })

  test('Ende exakt um Mitternacht ist zulässig', () => {
    assert.equal(endzeitAus('23:00', 1), '24:00:00')
  })

  test('über Mitternacht hinaus ist fail-closed', () => {
    assert.throws(
      () => endzeitAus('23:00', 2),
      (e: unknown) =>
        istEinsatzKetteFehler(e) && e.code === 'ZEITFENSTER_UNGUELTIG' && e.message.includes('Mitternacht'),
    )
  })

  test('leerer Startwert wirft, statt still auf 00:00 zu fallen', () => {
    // Number('') ist 0 — genau dieser Bug legte Einsätze auf Mitternacht.
    assert.throws(() => endzeitAus('', 1), (e: unknown) => istEinsatzKetteFehler(e))
  })

  test('halber oder unsinniger Zeitstring wirft', () => {
    for (const s of ['08:', ':30', 'acht', '08:xx', '--']) {
      assert.throws(() => endzeitAus(s, 1), (e: unknown) => istEinsatzKetteFehler(e), `„${s}" muss werfen`)
    }
  })

  test('nur Stunde und Minute werden geprüft — ein Sekunden-Rest wird ignoriert', () => {
    // Dokumentiert die tatsächliche Toleranz: alles ab dem dritten
    // Doppelpunkt-Teil fließt nicht in die Rechnung ein.
    assert.equal(endzeitAus('08:30:', 1), '09:30:00')
    assert.equal(endzeitAus('08:30:99', 1), '09:30:00')
  })

  test('Stunde > 23 oder Minute > 59 wirft', () => {
    assert.throws(() => endzeitAus('24:00', 1), (e: unknown) => istEinsatzKetteFehler(e))
    assert.throws(() => endzeitAus('08:60', 1), (e: unknown) => istEinsatzKetteFehler(e))
  })

  test('Dauer 0, negativ oder NaN wirft mit eigener Meldung', () => {
    for (const d of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(
        () => endzeitAus('08:00', d as number),
        (e: unknown) => istEinsatzKetteFehler(e) && e.code === 'ZEITFENSTER_UNGUELTIG',
        `Dauer ${String(d)} muss werfen`,
      )
    }
  })

  test('Ergebnis ist immer zweistellig mit Sekunden — Postgres-time-Format', () => {
    assert.match(endzeitAus('07:05', 1), /^\d{2}:\d{2}:00$/)
    assert.equal(endzeitAus('07:05', 1), '08:05:00')
  })
})
