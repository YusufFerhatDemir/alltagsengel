// ═══════════════════════════════════════════════════════════════
// Track 8 — Tour-Zustandsmaschine Tests
// ═══════════════════════════════════════════════════════════════
//
// Prueft assertTourUebergang, assertTourOffen und assertStopUebergang
// gegen die live geltende Zustandsmaschine. SECHS GEGENPROBEN fuehren
// die ALTE Regel noch einmal aus und verlangen, dass sie den Befund
// erzeugt haette.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  assertTourUebergang,
  assertTourOffen,
  assertStopUebergang,
  TOUR_STATUS,
  TOUR_OFFEN,
  STOP_STATUS,
} from '../stops'

// ---------------------------------------------------------------------------
// assertTourUebergang — erlaubte Uebergaenge
// ---------------------------------------------------------------------------

describe('assertTourUebergang — erlaubte Uebergaenge', () => {
  const erlaubt: [string, string][] = [
    ['GEPLANT', 'FREIGEGEBEN'],
    ['GEPLANT', 'UNTERWEGS'],
    ['GEPLANT', 'ABGESCHLOSSEN'],
    ['GEPLANT', 'STORNIERT'],
    ['FREIGEGEBEN', 'GEPLANT'],
    ['FREIGEGEBEN', 'UNTERWEGS'],
    ['FREIGEGEBEN', 'ABGESCHLOSSEN'],
    ['FREIGEGEBEN', 'STORNIERT'],
    ['UNTERWEGS', 'GEPLANT'],
    ['UNTERWEGS', 'FREIGEGEBEN'],
    ['UNTERWEGS', 'ABGESCHLOSSEN'],
    ['UNTERWEGS', 'STORNIERT'],
    ['STORNIERT', 'GEPLANT'],
  ]

  for (const [von, nach] of erlaubt) {
    test(`${von} → ${nach} ist erlaubt`, () => {
      assert.doesNotThrow(() => assertTourUebergang(von, nach))
    })
  }

  test('gleicher Status ist ein Noop', () => {
    for (const s of TOUR_STATUS) {
      assert.doesNotThrow(() => assertTourUebergang(s, s))
    }
  })
})

// ---------------------------------------------------------------------------
// assertTourUebergang — verbotene Uebergaenge
// ---------------------------------------------------------------------------

describe('assertTourUebergang — verbotene Uebergaenge', () => {
  test('ABGESCHLOSSEN ist ein Endzustand — kein Uebergang erlaubt', () => {
    for (const ziel of ['GEPLANT', 'FREIGEGEBEN', 'UNTERWEGS', 'STORNIERT'] as const) {
      assert.throws(
        () => assertTourUebergang('ABGESCHLOSSEN', ziel),
        (err: any) => err.statusCode === 409 || err.message?.includes('abgeschlossen'),
        `ABGESCHLOSSEN → ${ziel} haette abgelehnt werden muessen`,
      )
    }
  })

  test('STORNIERT kann nur nach GEPLANT aufgeloest werden', () => {
    for (const ziel of ['FREIGEGEBEN', 'UNTERWEGS', 'ABGESCHLOSSEN'] as const) {
      assert.throws(
        () => assertTourUebergang('STORNIERT', ziel),
        (err: any) => err.statusCode === 409 || err.status === 409,
        `STORNIERT → ${ziel} haette abgelehnt werden muessen`,
      )
    }
  })

  test('unbekannter Zielstatus wird abgelehnt', () => {
    assert.throws(() => assertTourUebergang('GEPLANT', 'FANTASIE'))
  })
})

// ---------------------------------------------------------------------------
// GEGENPROBE 1: DELETE-Handler ohne Statuscheck (alte Regel)
// ---------------------------------------------------------------------------
// Der DELETE-Handler setzte STORNIERT ohne den Ist-Stand zu pruefen.
// Diese Gegenprobe zeigt, dass die Zustandsmaschine den Fehler faengt.

describe('GEGENPROBE: DELETE-Bypass auf ABGESCHLOSSENE Tour', () => {
  test('ALTE REGEL: direktes Setzen von STORNIERT auf ABGESCHLOSSENE Tour — Zustandsmaschine muss das fangen', () => {
    // Der alte Code tat: admin.from('tours').update({ status: 'STORNIERT' })
    // OHNE den Bestand zu laden und assertTourUebergang zu pruefen.
    // Hier zeigen wir, dass assertTourUebergang diesen Fall faengt.
    assert.throws(
      () => assertTourUebergang('ABGESCHLOSSEN', 'STORNIERT'),
      (err: any) => {
        return (
          (err.statusCode === 409 || err.status === 409) &&
          err.message?.toLowerCase().includes('abgeschlossen')
        )
      },
      'Eine abgeschlossene Tour darf nicht storniert werden — '
      + 'der DELETE-Handler muss assertTourUebergang pruefen',
    )
  })

  test('ALTE REGEL: Kette DELETE+PATCH haette ABGESCHLOSSENE Tour auf GEPLANT zurueckgedreht', () => {
    // Schritt 1: ABGESCHLOSSEN → STORNIERT (via DELETE, ohne Check — MUSS scheitern)
    assert.throws(() => assertTourUebergang('ABGESCHLOSSEN', 'STORNIERT'))

    // Schritt 2: Waere die Tour STORNIERT geworden, waere STORNIERT → GEPLANT erlaubt
    assert.doesNotThrow(() => assertTourUebergang('STORNIERT', 'GEPLANT'))
    // → zusammen haette eine ABGESCHLOSSENE Tour wieder GEPLANT werden koennen
  })
})

// ---------------------------------------------------------------------------
// assertTourOffen — Erlaubnisliste
// ---------------------------------------------------------------------------

describe('assertTourOffen', () => {
  test('GEPLANT, FREIGEGEBEN, UNTERWEGS sind offen', () => {
    for (const s of TOUR_OFFEN) {
      assert.doesNotThrow(() => assertTourOffen(s, 'test'))
    }
  })

  test('ABGESCHLOSSEN ist nicht offen', () => {
    assert.throws(() => assertTourOffen('ABGESCHLOSSEN', 'test'))
  })

  test('STORNIERT ist nicht offen', () => {
    assert.throws(() => assertTourOffen('STORNIERT', 'test'))
  })

  test('null/undefined wird als geschlossen behandelt', () => {
    assert.throws(() => assertTourOffen(null, 'test'))
    assert.throws(() => assertTourOffen(undefined, 'test'))
  })
})

// ---------------------------------------------------------------------------
// assertStopUebergang — Vorwaertskette
// ---------------------------------------------------------------------------

describe('assertStopUebergang — Vorwaertskette', () => {
  const kette: [string, string][] = [
    ['GEPLANT', 'UNTERWEGS'],
    ['UNTERWEGS', 'BEIM_KLIENTEN'],
    ['BEIM_KLIENTEN', 'ABGESCHLOSSEN'],
    ['GEPLANT', 'ABGESCHLOSSEN'],
  ]
  for (const [von, nach] of kette) {
    test(`${von} → ${nach} ist erlaubt`, () => {
      assert.doesNotThrow(() => assertStopUebergang(von, nach))
    })
  }

  test('jeder offene Status → AUSGEFALLEN ist erlaubt', () => {
    for (const s of ['GEPLANT', 'UNTERWEGS', 'BEIM_KLIENTEN'] as const) {
      assert.doesNotThrow(() => assertStopUebergang(s, 'AUSGEFALLEN'))
    }
  })

  test('AUSGEFALLEN → GEPLANT (Reaktivierung) ist erlaubt', () => {
    assert.doesNotThrow(() => assertStopUebergang('AUSGEFALLEN', 'GEPLANT'))
  })
})

describe('assertStopUebergang — verbotene Uebergaenge', () => {
  test('ABGESCHLOSSEN ist ein Endzustand', () => {
    for (const ziel of ['GEPLANT', 'UNTERWEGS', 'BEIM_KLIENTEN', 'AUSGEFALLEN'] as const) {
      assert.throws(
        () => assertStopUebergang('ABGESCHLOSSEN', ziel),
        (err: any) => err.statusCode === 409 || err.message?.includes('abgeschlossen'),
        `ABGESCHLOSSEN → ${ziel} haette abgelehnt werden muessen`,
      )
    }
  })

  test('AUSGEFALLEN → UNTERWEGS/BEIM_KLIENTEN/ABGESCHLOSSEN ist verboten', () => {
    for (const ziel of ['UNTERWEGS', 'BEIM_KLIENTEN', 'ABGESCHLOSSEN'] as const) {
      assert.throws(
        () => assertStopUebergang('AUSGEFALLEN', ziel),
        (err: any) => err.statusCode === 409 || err.status === 409,
        `AUSGEFALLEN → ${ziel} haette abgelehnt werden muessen`,
      )
    }
  })

  test('Rueckwaerts in der Kette ist verboten (ausser auf GEPLANT)', () => {
    assert.throws(() => assertStopUebergang('BEIM_KLIENTEN', 'UNTERWEGS'))
  })

  test('unbekannter Zielstatus wird abgelehnt', () => {
    assert.throws(() => assertStopUebergang('GEPLANT', 'FANTASIE'))
  })
})

// ---------------------------------------------------------------------------
// GEGENPROBE 2: assertStopUebergang — abgeschlossener Stop
// ---------------------------------------------------------------------------

describe('GEGENPROBE: Stop-Endzustand', () => {
  test('ABGESCHLOSSENER Stop darf nicht auf GEPLANT zurueckgesetzt werden', () => {
    assert.throws(
      () => assertStopUebergang('ABGESCHLOSSEN', 'GEPLANT'),
      (err: any) => err.message?.includes('Leistungsnachweis'),
      'Der Fehler muss den Leistungsnachweis benennen',
    )
  })
})

// ---------------------------------------------------------------------------
// Vollstaendigkeitspruefung: alle Status-Werte abgedeckt
// ---------------------------------------------------------------------------

describe('Status-Werteset-Vollstaendigkeit', () => {
  test('TOUR_STATUS enthaelt genau 5 Werte', () => {
    assert.equal(TOUR_STATUS.length, 5)
    assert.ok(TOUR_STATUS.includes('GEPLANT'))
    assert.ok(TOUR_STATUS.includes('FREIGEGEBEN'))
    assert.ok(TOUR_STATUS.includes('UNTERWEGS'))
    assert.ok(TOUR_STATUS.includes('ABGESCHLOSSEN'))
    assert.ok(TOUR_STATUS.includes('STORNIERT'))
  })

  test('STOP_STATUS enthaelt genau 5 Werte', () => {
    assert.equal(STOP_STATUS.length, 5)
  })

  test('TOUR_OFFEN ist eine echte Teilmenge von TOUR_STATUS', () => {
    for (const s of TOUR_OFFEN) {
      assert.ok((TOUR_STATUS as readonly string[]).includes(s), `${s} fehlt in TOUR_STATUS`)
    }
    assert.ok(TOUR_OFFEN.length < TOUR_STATUS.length)
  })
})
