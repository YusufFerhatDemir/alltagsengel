/**
 * Die zwei Bewerberquellen — und was eine leere Liste bedeutet.
 * @see lib/bewerbung/quellen.ts
 *
 * ── DER FEHLER, DEN DIESE TESTS FESTHALTEN ────────────────────────
 * /mis/recruiting liest `mis_applicants` (live 0 Zeilen) und zeigte
 * darauf „Keine Bewerber" plus eine KPI „Offene Bewerbungen: 0".
 * Gleichzeitig lagen in `lead_inquiries` 36 Bewerbungen, davon 35
 * unbearbeitet, die älteste vom 15.07.2026.
 *
 * Beide Zahlen waren für sich richtig — und wer im MIS nachsah, schloss
 * daraus, dass niemand sich beworben hat. Dasselbe Muster wie beim
 * Nachweisstand im Kundenportal (Block 15): zwei Ansichten, keine
 * falsch, der Schaden liegt dazwischen.
 *
 * Die Berechtigungsgrenze bleibt dabei unverändert: die Liste selbst
 * verlangt `marketing.verwalten`. Wer sie nicht hat, bekommt den Hinweis
 * OHNE Zahl — nicht die Zahl durch die Hintertür.
 */
import { describe, it, expect } from 'vitest'
import {
  bewerbungHinweis, tageSeit,
  BEWERBUNG_SICHT_BERECHTIGUNG, BEWERBUNG_VERWALTUNG_PFAD,
  type BewerbungUebersicht,
} from '@/lib/bewerbung/quellen'
import { istBewerbung, BEWERBUNG_FILTER } from '@/lib/admin/ops'

describe('Der Hinweis ersetzt die stille Null', () => {
  it('nennt die Zahl, wenn sie eingesehen werden darf', () => {
    const u: BewerbungUebersicht = { offen: 36, aeltesteTage: 61, darfSehen: true }
    const t = bewerbungHinweis(u)
    expect(t).toMatch(/36 Bewerbungen/)
    expect(t).toMatch(/61 Tagen/)
  })

  it('sagt ausdrücklich, dass diese Liste nur manuell Erfasste führt', () => {
    for (const u of [
      { offen: 36, aeltesteTage: 61, darfSehen: true },
      { offen: 0, aeltesteTage: null, darfSehen: true },
      { offen: null, aeltesteTage: null, darfSehen: false },
    ] as BewerbungUebersicht[]) {
      expect(bewerbungHinweis(u)).toMatch(/Arbeitsagentur, Indeed, Empfehlung/)
    }
  })

  it('ohne Berechtigung: Hinweis ja, Zahl nein', () => {
    const t = bewerbungHinweis({ offen: null, aeltesteTage: null, darfSehen: false })
    expect(t).toMatch(/in der Verwaltung geführt/)
    expect(t).not.toMatch(/\d+ Bewerbung/)
  })

  it('eine als darfSehen=false gelieferte Zahl wird trotzdem nicht verraten', () => {
    // Verteidigung gegen einen Fehler weiter oben: selbst wenn jemand
    // versehentlich eine Zahl mitgibt, darf sie ohne Recht nicht erscheinen.
    const t = bewerbungHinweis({ offen: 36, aeltesteTage: 61, darfSehen: false })
    expect(t).not.toMatch(/36/)
    expect(t).not.toMatch(/61/)
  })

  it('bei null offenen wird das gesagt, nicht verschwiegen', () => {
    const t = bewerbungHinweis({ offen: 0, aeltesteTage: null, darfSehen: true })
    expect(t).toMatch(/nichts offen/)
  })

  it('Einzahl und Mehrzahl stimmen', () => {
    expect(bewerbungHinweis({ offen: 1, aeltesteTage: null, darfSehen: true })).toMatch(/1 Bewerbung offen/)
    expect(bewerbungHinweis({ offen: 2, aeltesteTage: null, darfSehen: true })).toMatch(/2 Bewerbungen offen/)
  })

  it('ohne Altersangabe bleibt der Satz vollständig', () => {
    const t = bewerbungHinweis({ offen: 5, aeltesteTage: null, darfSehen: true })
    expect(t).toMatch(/5 Bewerbungen offen/)
    expect(t).not.toMatch(/seit\s+null/)
  })
})

describe('Die Berechtigungsgrenze steht fest', () => {
  it('die Sicht auf Bewerbungen hängt an marketing.verwalten', () => {
    // Nicht personal.lesen: /mis/recruiting öffnet auch die PDL, und auf
    // lead_inquiries steht live nur „Admin full access" mit is_admin().
    expect(BEWERBUNG_SICHT_BERECHTIGUNG).toBe('marketing.verwalten')
  })

  it('der Verweis zeigt auf die Seite, die die Bewerbungen wirklich führt', () => {
    expect(BEWERBUNG_VERWALTUNG_PFAD).toBe('/admin/applications')
  })
})

describe('tageSeit', () => {
  const jetzt = new Date('2026-09-14T12:00:00Z')

  it('rechnet volle Tage', () => {
    expect(tageSeit('2026-09-11T12:00:00Z', jetzt)).toBe(3)
  })

  it('wird nie negativ — ein Eingang in der Zukunft ist 0 Tage alt', () => {
    expect(tageSeit('2026-12-01T00:00:00Z', jetzt)).toBe(0)
  })

  it('null und Unsinn ergeben null, nicht NaN', () => {
    expect(tageSeit(null, jetzt)).toBeNull()
    expect(tageSeit('kein Datum', jetzt)).toBeNull()
  })
})

describe('REGRESSION: die 34 Altbestände tragen art=anfrage', () => {
  /**
   * Über /api/apply kommt eine Bewerbung mit art='bewerbung' herein. Die
   * 34 Zeilen aus dem früheren Kurzformular tragen art='anfrage' und sind
   * NUR an source='engel-bewerbung' erkennbar. Live am 14.09.2026: 36
   * Bewerbungen, davon genau 2 mit art='bewerbung'.
   *
   * Wer nur auf `art` prüft, sieht 2 von 36.
   */
  it('istBewerbung erkennt beide Formen', () => {
    expect(istBewerbung({ art: 'bewerbung', source: 'engel-bewerbung' })).toBe(true)
    expect(istBewerbung({ art: 'anfrage', source: 'engel-bewerbung' })).toBe(true)
    expect(istBewerbung({ art: 'bewerbung', source: null })).toBe(true)
  })

  it('eine echte Kundenanfrage bleibt draußen', () => {
    expect(istBewerbung({ art: 'anfrage', source: 'rueckruf' })).toBe(false)
    expect(istBewerbung({ art: 'anfrage', source: 'terminbuchung' })).toBe(false)
    expect(istBewerbung({ art: null, source: null })).toBe(false)
  })

  it('der PostgREST-Filter fragt dieselben beiden Spalten ab', () => {
    expect(BEWERBUNG_FILTER).toContain('art.eq.bewerbung')
    expect(BEWERBUNG_FILTER).toContain('source.eq.engel-bewerbung')
  })
})
