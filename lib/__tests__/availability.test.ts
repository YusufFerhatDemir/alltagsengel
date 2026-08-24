// ═══════════════════════════════════════════════════════════════
// Welle 5j — Verfügbarkeit (Zeitfenster-Logik) Tests
// ═══════════════════════════════════════════════════════════════
//
// 100 % reine Funktionen, kein Supabase, kein fetch.
// Geschäftskritisch: Engel-Matching hängt an korrekter Zeitfenster-Prüfung.
// ═══════════════════════════════════════════════════════════════

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  kuerzelZuWochentag,
  isoWochentag,
  zeitZuMinuten,
  minutenZuZeit,
  zeitAnzeige,
  passtInZeitfenster,
  istVerfuegbar,
  fensterProTag,
  fensterText,
  ueberschneidetSich,
  WOCHENTAGE,
  type Zeitfenster,
} from '../availability'

// ---------------------------------------------------------------------------
// WOCHENTAGE Konstante
// ---------------------------------------------------------------------------

describe('WOCHENTAGE', () => {
  test('exakt 7 Tage', () => {
    assert.equal(WOCHENTAGE.length, 7)
  })

  test('Montag = 1, Sonntag = 7 (ISO)', () => {
    assert.equal(WOCHENTAGE[0].nr, 1)
    assert.equal(WOCHENTAGE[0].kurz, 'Mo')
    assert.equal(WOCHENTAGE[6].nr, 7)
    assert.equal(WOCHENTAGE[6].kurz, 'So')
  })

  test('alle Kürzel sind 2 Zeichen', () => {
    for (const t of WOCHENTAGE) {
      assert.equal(t.kurz.length, 2, `${t.lang}: Kürzel "${t.kurz}" nicht 2 Zeichen`)
    }
  })

  test('nrs sind aufsteigend 1-7', () => {
    for (let i = 0; i < WOCHENTAGE.length; i++) {
      assert.equal(WOCHENTAGE[i].nr, i + 1)
    }
  })
})

// ---------------------------------------------------------------------------
// kuerzelZuWochentag
// ---------------------------------------------------------------------------

describe('kuerzelZuWochentag', () => {
  test('"Mo" → 1', () => assert.equal(kuerzelZuWochentag('Mo'), 1))
  test('"Di" → 2', () => assert.equal(kuerzelZuWochentag('Di'), 2))
  test('"Mi" → 3', () => assert.equal(kuerzelZuWochentag('Mi'), 3))
  test('"Do" → 4', () => assert.equal(kuerzelZuWochentag('Do'), 4))
  test('"Fr" → 5', () => assert.equal(kuerzelZuWochentag('Fr'), 5))
  test('"Sa" → 6', () => assert.equal(kuerzelZuWochentag('Sa'), 6))
  test('"So" → 7', () => assert.equal(kuerzelZuWochentag('So'), 7))

  test('case-insensitive: "mo" → 1', () => {
    assert.equal(kuerzelZuWochentag('mo'), 1)
  })

  test('case-insensitive: "MO" → 1', () => {
    assert.equal(kuerzelZuWochentag('MO'), 1)
  })

  test('längere Eingabe wird auf 2 Zeichen beschnitten: "Montag" → 1', () => {
    assert.equal(kuerzelZuWochentag('Montag'), 1)
  })

  test('Whitespace wird getrimmt', () => {
    assert.equal(kuerzelZuWochentag('  Mo  '), 1)
  })

  test('ungültiges Kürzel → null', () => {
    assert.equal(kuerzelZuWochentag('Xx'), null)
  })

  test('leerer String → null', () => {
    assert.equal(kuerzelZuWochentag(''), null)
  })
})

// ---------------------------------------------------------------------------
// isoWochentag
// ---------------------------------------------------------------------------

describe('isoWochentag', () => {
  // 2026-08-24 ist ein Montag
  test('2026-08-24 (Montag) → 1', () => {
    assert.equal(isoWochentag('2026-08-24'), 1)
  })

  // 2026-08-25 ist ein Dienstag
  test('2026-08-25 (Dienstag) → 2', () => {
    assert.equal(isoWochentag('2026-08-25'), 2)
  })

  // 2026-08-30 ist ein Sonntag
  test('2026-08-30 (Sonntag) → 7', () => {
    assert.equal(isoWochentag('2026-08-30'), 7)
  })

  test('ungültiges Format → null', () => {
    assert.equal(isoWochentag('24.08.2026'), null)
  })

  test('leerer String → null', () => {
    assert.equal(isoWochentag(''), null)
  })

  test('Datum mit Uhrzeit → funktioniert (nur Datumsteil wird gelesen)', () => {
    // Sollte trotzdem Montag (1) ergeben
    assert.equal(isoWochentag('2026-08-24T14:00:00'), 1)
  })
})

// ---------------------------------------------------------------------------
// zeitZuMinuten
// ---------------------------------------------------------------------------

describe('zeitZuMinuten', () => {
  test('"00:00" → 0', () => assert.equal(zeitZuMinuten('00:00'), 0))
  test('"09:30" → 570', () => assert.equal(zeitZuMinuten('09:30'), 570))
  test('"12:00" → 720', () => assert.equal(zeitZuMinuten('12:00'), 720))
  test('"23:59" → 1439', () => assert.equal(zeitZuMinuten('23:59'), 1439))

  test('"09:30:00" (mit Sekunden) → 570', () => {
    assert.equal(zeitZuMinuten('09:30:00'), 570)
  })

  test('Whitespace wird getrimmt', () => {
    assert.equal(zeitZuMinuten('  09:30  '), 570)
  })

  test('null → null', () => assert.equal(zeitZuMinuten(null), null))
  test('undefined → null', () => assert.equal(zeitZuMinuten(undefined), null))
  test('leerer String → null', () => assert.equal(zeitZuMinuten(''), null))
  test('ungültiges Format → null', () => assert.equal(zeitZuMinuten('abc'), null))

  test('Stunde > 23 → null', () => assert.equal(zeitZuMinuten('24:00'), null))
  test('Minute > 59 → null', () => assert.equal(zeitZuMinuten('12:60'), null))
})

// ---------------------------------------------------------------------------
// minutenZuZeit
// ---------------------------------------------------------------------------

describe('minutenZuZeit', () => {
  test('0 → "00:00"', () => assert.equal(minutenZuZeit(0), '00:00'))
  test('570 → "09:30"', () => assert.equal(minutenZuZeit(570), '09:30'))
  test('720 → "12:00"', () => assert.equal(minutenZuZeit(720), '12:00'))
  test('1439 → "23:59"', () => assert.equal(minutenZuZeit(1439), '23:59'))

  test('1440 (24:00) → "24:00" (gedeckelt)', () => {
    assert.equal(minutenZuZeit(1440), '24:00')
  })

  test('> 1440 → gedeckelt auf "24:00"', () => {
    assert.equal(minutenZuZeit(2000), '24:00')
  })

  test('negative → "00:00"', () => {
    assert.equal(minutenZuZeit(-10), '00:00')
  })

  test('Rundung: 570.4 → "09:30"', () => {
    assert.equal(minutenZuZeit(570.4), '09:30')
  })

  test('Rundung: 570.6 → "09:31"', () => {
    assert.equal(minutenZuZeit(570.6), '09:31')
  })
})

// ---------------------------------------------------------------------------
// zeitAnzeige
// ---------------------------------------------------------------------------

describe('zeitAnzeige', () => {
  test('"09:00:00" → "09:00"', () => {
    assert.equal(zeitAnzeige('09:00:00'), '09:00')
  })

  test('"14:30" → "14:30"', () => {
    assert.equal(zeitAnzeige('14:30'), '14:30')
  })

  test('ungültige Zeit → Durchreichung', () => {
    assert.equal(zeitAnzeige('ungueltig'), 'ungueltig')
  })
})

// ---------------------------------------------------------------------------
// passtInZeitfenster
// ---------------------------------------------------------------------------

describe('passtInZeitfenster', () => {
  const fenster: Zeitfenster[] = [
    { weekday: 1, start_time: '09:00', end_time: '14:00' }, // Mo 09-14
    { weekday: 1, start_time: '16:00', end_time: '18:00' }, // Mo 16-18
    { weekday: 3, start_time: '08:00', end_time: '12:00' }, // Mi 08-12
  ]

  test('Einsatz passt genau in Fenster', () => {
    assert.equal(passtInZeitfenster(fenster, 1, '09:00', 5), true) // Mo 09:00–14:00
  })

  test('Einsatz innerhalb Fenster (kürzer)', () => {
    assert.equal(passtInZeitfenster(fenster, 1, '10:00', 2), true) // Mo 10:00–12:00
  })

  test('Einsatz ragt über Fenster-Ende', () => {
    assert.equal(passtInZeitfenster(fenster, 1, '12:00', 3), false) // Mo 12:00–15:00 > 14:00
  })

  test('Einsatz beginnt vor Fenster-Start', () => {
    assert.equal(passtInZeitfenster(fenster, 1, '08:00', 2), false) // Mo 08:00–10:00
  })

  test('anderer Wochentag → false', () => {
    assert.equal(passtInZeitfenster(fenster, 2, '09:00', 2), false) // Dienstag: kein Fenster
  })

  test('passt in zweites Fenster desselben Tages', () => {
    assert.equal(passtInZeitfenster(fenster, 1, '16:00', 1.5), true) // Mo 16:00–17:30
  })

  test('leere Fensterliste → false', () => {
    assert.equal(passtInZeitfenster([], 1, '09:00', 2), false)
  })

  test('ungültige Startzeit → false', () => {
    assert.equal(passtInZeitfenster(fenster, 1, 'abc', 2), false)
  })
})

// ---------------------------------------------------------------------------
// istVerfuegbar — Business-Logik mit Fallback
// ---------------------------------------------------------------------------

describe('istVerfuegbar', () => {
  const fenster: Zeitfenster[] = [
    { weekday: 1, start_time: '09:00', end_time: '14:00' },
  ]

  test('mit Fenster + passt → true', () => {
    assert.equal(istVerfuegbar(fenster, null, '2026-08-24', '10:00', 2), true)
  })

  test('mit Fenster + passt nicht → false', () => {
    assert.equal(istVerfuegbar(fenster, null, '2026-08-24', '15:00', 2), false)
  })

  test('ohne Fenster, mit altTage + Tag passt → true', () => {
    assert.equal(istVerfuegbar([], ['Mo', 'Mi'], '2026-08-24', '10:00', 2), true)
  })

  test('ohne Fenster, mit altTage + Tag passt nicht → false', () => {
    assert.equal(istVerfuegbar([], ['Di', 'Mi'], '2026-08-24', '10:00', 2), false)
  })

  test('ohne Fenster, ohne altTage → true (fail-open)', () => {
    assert.equal(istVerfuegbar([], null, '2026-08-24', '10:00', 2), true)
  })

  test('ohne Fenster, leere altTage → true (fail-open)', () => {
    assert.equal(istVerfuegbar([], [], '2026-08-24', '10:00', 2), true)
  })

  test('ungültiges Datum → true (nicht filtern)', () => {
    assert.equal(istVerfuegbar(fenster, null, 'xxx', '10:00', 2), true)
  })

  test('Fenster hat Vorrang vor altTage', () => {
    // Montag 15:00 passt nicht ins Fenster (09-14), obwohl "Mo" in altTage
    assert.equal(istVerfuegbar(fenster, ['Mo'], '2026-08-24', '15:00', 2), false)
  })
})

// ---------------------------------------------------------------------------
// fensterProTag
// ---------------------------------------------------------------------------

describe('fensterProTag', () => {
  const fenster: Zeitfenster[] = [
    { weekday: 1, start_time: '16:00', end_time: '18:00' },
    { weekday: 3, start_time: '08:00', end_time: '12:00' },
    { weekday: 1, start_time: '09:00', end_time: '14:00' },
  ]

  test('filtert korrekt nach Wochentag', () => {
    const mo = fensterProTag(fenster, 1)
    assert.equal(mo.length, 2)
  })

  test('sortiert aufsteigend nach Startzeit', () => {
    const mo = fensterProTag(fenster, 1)
    assert.equal(mo[0].start_time, '09:00')
    assert.equal(mo[1].start_time, '16:00')
  })

  test('Tag ohne Fenster → leeres Array', () => {
    assert.deepEqual(fensterProTag(fenster, 5), [])
  })
})

// ---------------------------------------------------------------------------
// fensterText
// ---------------------------------------------------------------------------

describe('fensterText', () => {
  test('Formatierung', () => {
    const f: Zeitfenster = { weekday: 1, start_time: '09:00', end_time: '14:00' }
    assert.equal(fensterText(f), '09:00 – 14:00 Uhr')
  })

  test('Postgres-Format mit Sekunden', () => {
    const f: Zeitfenster = { weekday: 1, start_time: '09:00:00', end_time: '14:00:00' }
    assert.equal(fensterText(f), '09:00 – 14:00 Uhr')
  })
})

// ---------------------------------------------------------------------------
// ueberschneidetSich
// ---------------------------------------------------------------------------

describe('ueberschneidetSich', () => {
  const bestehende: Zeitfenster[] = [
    { weekday: 1, start_time: '09:00', end_time: '14:00' },
    { weekday: 1, start_time: '16:00', end_time: '18:00' },
  ]

  test('vollständig überlappend → true', () => {
    assert.equal(ueberschneidetSich(bestehende, 1, '10:00', '12:00'), true)
  })

  test('Beginn vor Ende eines Fensters → true', () => {
    assert.equal(ueberschneidetSich(bestehende, 1, '13:00', '15:00'), true)
  })

  test('direkt angrenzend → false (kein Overlap)', () => {
    // 14:00–16:00 — Ende = Anfang des zweiten Fensters → kein Overlap
    assert.equal(ueberschneidetSich(bestehende, 1, '14:00', '16:00'), false)
  })

  test('Lücke zwischen Fenstern → false', () => {
    assert.equal(ueberschneidetSich(bestehende, 1, '14:30', '15:30'), false)
  })

  test('anderer Wochentag → false', () => {
    assert.equal(ueberschneidetSich(bestehende, 2, '09:00', '14:00'), false)
  })

  test('leere Liste → false', () => {
    assert.equal(ueberschneidetSich([], 1, '09:00', '14:00'), false)
  })

  test('ungültige Zeiten → false', () => {
    assert.equal(ueberschneidetSich(bestehende, 1, 'abc', '14:00'), false)
  })
})
