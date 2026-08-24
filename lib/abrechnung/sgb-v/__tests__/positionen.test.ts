// ═══════════════════════════════════════════════════════════════
// Welle 4c — § 302 SGB V Positionen-Aufbereitung Tests
// ═══════════════════════════════════════════════════════════════
//
// Rein funktionales Modul: kein Supabase, keine Seiteneffekte.
// Testet die zentrale Logik, die entscheidet, ob eine Leistung
// in einen Abrechnungslauf darf oder abgelehnt wird.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  pruefePosition,
  gueltigBis,
  bereiteHkpVor,
  HKP_VERORDNUNG_TYPE,
  HKP_PROBLEM_TEXT,
  type HkpVerordnung,
  type HkpLeistung,
  type HkpKlient,
} from '../positionen'

// ---------------------------------------------------------------------------
// Testdaten-Helfer
// ---------------------------------------------------------------------------

function verordnung(overrides: Partial<HkpVerordnung> = {}): HkpVerordnung {
  return {
    id: 'v-1',
    client_id: 'k-1',
    verordnung_type: HKP_VERORDNUNG_TYPE,
    genehmigung_status: 'genehmigt',
    gueltig_von: '2026-01-01',
    gueltig_bis: '2026-12-31',
    genehmigung_bis: null,
    verordnung_nummer: 'HKP-2026-001',
    genehmigung_aktenzeichen: 'AZ-123',
    kostentraeger_ik_nummer: '104593971',
    kostentraeger_name: 'AOK Baden-Württemberg',
    ...overrides,
  }
}

function leistung(overrides: Partial<HkpLeistung> = {}): HkpLeistung {
  return {
    id: 'l-1',
    client_id: 'k-1',
    verordnung_id: 'v-1',
    date: '2026-06-15',
    duration_minutes: 60,
    service_type: 'behandlungspflege',
    amount: 30.00,
    ...overrides,
  }
}

function klient(overrides: Partial<HkpKlient> = {}): HkpKlient {
  return {
    id: 'k-1',
    first_name: 'Max',
    last_name: 'Mustermann',
    versichertennummer: 'A123456789',
    geburtsdatum: '1940-05-01',
    date_of_birth: '1940-05-01',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// gueltigBis — frühestes Ende
// ---------------------------------------------------------------------------

describe('gueltigBis', () => {
  test('nimmt gueltig_bis wenn genehmigung_bis fehlt', () => {
    assert.equal(gueltigBis(verordnung({ gueltig_bis: '2026-06-30', genehmigung_bis: null })), '2026-06-30')
  })

  test('nimmt genehmigung_bis wenn gueltig_bis fehlt', () => {
    assert.equal(gueltigBis(verordnung({ gueltig_bis: null, genehmigung_bis: '2026-09-30' })), '2026-09-30')
  })

  test('nimmt das fruehere von beiden', () => {
    assert.equal(
      gueltigBis(verordnung({ gueltig_bis: '2026-12-31', genehmigung_bis: '2026-06-30' })),
      '2026-06-30',
      'Genehmigung endet frueher — sie bestimmt das Ende',
    )
  })

  test('gibt null wenn beide fehlen', () => {
    assert.equal(gueltigBis(verordnung({ gueltig_bis: null, genehmigung_bis: null })), null)
  })
})

// ---------------------------------------------------------------------------
// pruefePosition — Einzelpruefung
// ---------------------------------------------------------------------------

describe('pruefePosition', () => {
  test('null bei gueltiger Kombination', () => {
    assert.equal(pruefePosition(leistung(), verordnung(), klient()), null)
  })

  test('keine_verordnung wenn undefined', () => {
    assert.equal(pruefePosition(leistung(), undefined, klient()), 'keine_verordnung')
  })

  test('keine_verordnung bei falschem Verordnungstyp', () => {
    assert.equal(
      pruefePosition(leistung(), verordnung({ verordnung_type: 'hauswirtschaft_45b' }), klient()),
      'keine_verordnung',
    )
  })

  test('verordnung_nicht_genehmigt', () => {
    assert.equal(
      pruefePosition(leistung(), verordnung({ genehmigung_status: 'beantragt' }), klient()),
      'verordnung_nicht_genehmigt',
    )
  })

  test('verordnung_vor_beginn', () => {
    assert.equal(
      pruefePosition(
        leistung({ date: '2025-12-31' }),
        verordnung({ gueltig_von: '2026-01-01' }),
        klient(),
      ),
      'verordnung_vor_beginn',
    )
  })

  test('verordnung_abgelaufen', () => {
    assert.equal(
      pruefePosition(
        leistung({ date: '2027-01-01' }),
        verordnung({ gueltig_bis: '2026-12-31' }),
        klient(),
      ),
      'verordnung_abgelaufen',
    )
  })

  test('verordnung_abgelaufen: genehmigung_bis ist enger als gueltig_bis', () => {
    assert.equal(
      pruefePosition(
        leistung({ date: '2026-07-15' }),
        verordnung({ gueltig_bis: '2026-12-31', genehmigung_bis: '2026-06-30' }),
        klient(),
      ),
      'verordnung_abgelaufen',
      'Leistung am 15.07. liegt nach dem Ende der Genehmigung (30.06.)',
    )
  })

  test('kein_kostentraeger_ik', () => {
    assert.equal(
      pruefePosition(leistung(), verordnung({ kostentraeger_ik_nummer: null }), klient()),
      'kein_kostentraeger_ik',
    )
  })

  test('kein_kostentraeger_ik bei ungueltigem Format', () => {
    assert.equal(
      pruefePosition(leistung(), verordnung({ kostentraeger_ik_nummer: '12345' }), klient()),
      'kein_kostentraeger_ik',
    )
  })

  test('keine_versichertennummer', () => {
    assert.equal(
      pruefePosition(leistung(), verordnung(), klient({ versichertennummer: null })),
      'keine_versichertennummer',
    )
  })

  test('kein_betrag bei null', () => {
    assert.equal(
      pruefePosition(leistung({ amount: null }), verordnung(), klient()),
      'kein_betrag',
    )
  })

  test('kein_betrag bei 0', () => {
    assert.equal(
      pruefePosition(leistung({ amount: 0 }), verordnung(), klient()),
      'kein_betrag',
    )
  })
})

// ---------------------------------------------------------------------------
// bereiteHkpVor — Aufbereitung
// ---------------------------------------------------------------------------

describe('bereiteHkpVor', () => {
  test('leere Eingabe → leere Aufbereitung', () => {
    const result = bereiteHkpVor([], [], [])
    assert.equal(result.faelle.length, 0)
    assert.equal(result.abgelehnt.length, 0)
    assert.equal(result.summe_cent, 0)
    assert.equal(result.anzahl_positionen, 0)
  })

  test('gueltige Leistung erzeugt einen Fall', () => {
    const result = bereiteHkpVor([leistung()], [verordnung()], [klient()])
    assert.equal(result.faelle.length, 1)
    assert.equal(result.abgelehnt.length, 0)
    assert.equal(result.faelle[0].positionen.length, 1)
    assert.equal(result.faelle[0].betrag_cent, 3000)
    assert.equal(result.summe_cent, 3000)
  })

  test('abgelehnte Leistung landet im abgelehnt-Array mit Begruendung', () => {
    const l = leistung({ verordnung_id: null })
    const result = bereiteHkpVor([l], [verordnung()], [klient()])
    assert.equal(result.faelle.length, 0)
    assert.equal(result.abgelehnt.length, 1)
    assert.equal(result.abgelehnt[0].problem, 'keine_verordnung')
    assert.equal(result.abgelehnt[0].hinweis, HKP_PROBLEM_TEXT['keine_verordnung'])
  })

  test('Gruppierung: zwei Leistungen beim selben Klient+Kasse = ein Fall', () => {
    const l1 = leistung({ id: 'l-1', amount: 30 })
    const l2 = leistung({ id: 'l-2', amount: 25 })
    const result = bereiteHkpVor([l1, l2], [verordnung()], [klient()])
    assert.equal(result.faelle.length, 1)
    assert.equal(result.faelle[0].positionen.length, 2)
    assert.equal(result.faelle[0].betrag_cent, 5500)
    assert.equal(result.summe_cent, 5500)
    assert.equal(result.anzahl_positionen, 2)
  })

  test('Gruppierung: verschiedene Kassen = verschiedene Faelle', () => {
    const v1 = verordnung({ id: 'v-1', kostentraeger_ik_nummer: '104593971' })
    const v2 = verordnung({ id: 'v-2', kostentraeger_ik_nummer: '109519005' })
    const l1 = leistung({ id: 'l-1', verordnung_id: 'v-1' })
    const l2 = leistung({ id: 'l-2', verordnung_id: 'v-2' })
    const result = bereiteHkpVor([l1, l2], [v1, v2], [klient()])
    assert.equal(result.faelle.length, 2, 'Zwei verschiedene Kassen → zwei Fälle')
  })

  test('Gruppierung: verschiedene Klienten bei gleicher Kasse = verschiedene Faelle', () => {
    const v1 = verordnung({ id: 'v-1', client_id: 'k-1' })
    const v2 = verordnung({ id: 'v-2', client_id: 'k-2' })
    const k1 = klient({ id: 'k-1', versichertennummer: 'A111' })
    const k2 = klient({ id: 'k-2', versichertennummer: 'B222' })
    const l1 = leistung({ id: 'l-1', client_id: 'k-1', verordnung_id: 'v-1' })
    const l2 = leistung({ id: 'l-2', client_id: 'k-2', verordnung_id: 'v-2' })
    const result = bereiteHkpVor([l1, l2], [v1, v2], [k1, k2])
    assert.equal(result.faelle.length, 2, 'Zwei Klienten → zwei Fälle')
  })

  test('Euro zu Cent Umrechnung ist korrekt', () => {
    const l = leistung({ amount: 8398.53 })
    const result = bereiteHkpVor([l], [verordnung()], [klient()])
    assert.equal(
      result.faelle[0].betrag_cent, 839853,
      'Math.round(8398.53 * 100) = 839853 — Gleitkomma darf keinen Cent kosten',
    )
  })

  test('Faelle sind sortiert nach IK dann Klientenname', () => {
    const v1 = verordnung({ id: 'v-1', kostentraeger_ik_nummer: '200000000', client_id: 'k-1' })
    const v2 = verordnung({ id: 'v-2', kostentraeger_ik_nummer: '100000000', client_id: 'k-2' })
    const k1 = klient({ id: 'k-1', first_name: 'Zara' })
    const k2 = klient({ id: 'k-2', first_name: 'Anna' })
    const l1 = leistung({ id: 'l-1', client_id: 'k-1', verordnung_id: 'v-1' })
    const l2 = leistung({ id: 'l-2', client_id: 'k-2', verordnung_id: 'v-2' })
    const result = bereiteHkpVor([l1, l2], [v1, v2], [k1, k2])
    assert.equal(result.faelle[0].kostentraeger_ik, '100000000', 'Kleinere IK zuerst')
  })
})

// ---------------------------------------------------------------------------
// HKP_PROBLEM_TEXT — Konsistenz
// ---------------------------------------------------------------------------

describe('HKP_PROBLEM_TEXT', () => {
  test('jeder Problem-Typ hat einen nicht-leeren Text', () => {
    const typen: Array<keyof typeof HKP_PROBLEM_TEXT> = [
      'keine_verordnung', 'verordnung_nicht_genehmigt', 'verordnung_abgelaufen',
      'verordnung_vor_beginn', 'kein_kostentraeger_ik', 'keine_versichertennummer', 'kein_betrag',
    ]
    for (const typ of typen) {
      assert.ok(HKP_PROBLEM_TEXT[typ].length > 0, `Text fehlt für ${typ}`)
    }
  })
})
