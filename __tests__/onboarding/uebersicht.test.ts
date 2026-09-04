/**
 * Onboarding — Betriebssicht
 *
 * „Seit X Tagen inaktiv" ist genau die Art Regel, die man sonst nie
 * testet und die dann still das Falsche zählt: eine Grenze knapp daneben,
 * und die Liste, nach der jemand sucht, ist leer.
 */

import { describe, it, expect } from 'vitest'
import {
  FILTER, FILTER_LABEL, kennzahlen, sucheNachName, tageSeit, wendeFilterAn, werteAus,
  type UebersichtsZeile,
} from '@/lib/onboarding/uebersicht'
import { SCHRITTFOLGEN, gesamtSchritte } from '@/lib/onboarding/schritte'

const JETZT = new Date('2026-09-20T12:00:00Z')
const vorTagen = (n: number) => new Date(JETZT.getTime() - n * 86_400_000).toISOString()

const FOLGE = SCHRITTFOLGEN.kunde

function zeile(ueber: Partial<UebersichtsZeile> = {}): UebersichtsZeile {
  return {
    id: 'z1', userId: 'u1', typ: 'kunde', name: 'Erika Müller',
    aktuellerSchritt: 2, gesamtSchritte: gesamtSchritte('kunde'),
    schritteDaten: {}, fehlendeAngaben: [], dokumentStatus: {},
    letzteAutoNachricht: null, abbruchstelle: null, abgeschlossenAm: null,
    createdAt: vorTagen(20), updatedAt: vorTagen(1),
    ...ueber,
  }
}

const fertig = (...schluessel: string[]) => Object.fromEntries(
  schluessel.map(s => [s, { status: 'fertig' as const, daten: {}, zeitpunkt: 'x' }]),
)

describe('werteAus', () => {
  it('rechnet Fortschritt aus den erledigten Schritten', () => {
    const a = werteAus(zeile({ schritteDaten: fertig(FOLGE[0].schluessel, FOLGE[1].schluessel) }), JETZT)
    expect(a.erledigteSchritte).toBe(2)
    expect(a.prozent).toBe(Math.round((2 / FOLGE.length) * 100))
  })

  it('zählt Übersprungenes als erledigt', () => {
    const a = werteAus(zeile({
      schritteDaten: { [FOLGE[0].schluessel]: { status: 'uebersprungen', daten: {}, zeitpunkt: 'x' } },
    }), JETZT)
    expect(a.erledigteSchritte).toBe(1)
  })

  it('nennt den Titel des aktuellen Schritts', () => {
    expect(werteAus(zeile({ aktuellerSchritt: 3 }), JETZT).letzterSchrittTitel)
      .toBe(FOLGE[2].titel)
  })

  it('zählt vermerkte Unterlagen', () => {
    expect(werteAus(zeile({ dokumentStatus: { a: {}, b: {} } }), JETZT).dokumenteVermerkt).toBe(2)
  })

  it('meldet „bereit zur Prüfung" erst, wenn alle Pflichtschritte fertig sind', () => {
    const pflicht = FOLGE.filter(s => !s.ueberspringbar).map(s => s.schluessel)
    expect(werteAus(zeile({ schritteDaten: fertig(...pflicht) }), JETZT).bereitZurPruefung).toBe(true)
    expect(werteAus(zeile({ schritteDaten: fertig(pflicht[0]) }), JETZT).bereitZurPruefung).toBe(false)
  })

  it('meldet einen abgeschlossenen Ablauf NICHT als bereit', () => {
    const pflicht = FOLGE.filter(s => !s.ueberspringbar).map(s => s.schluessel)
    expect(werteAus(zeile({
      schritteDaten: fertig(...pflicht), abgeschlossenAm: vorTagen(1),
    }), JETZT).bereitZurPruefung).toBe(false)
  })

  it('lässt eine Zeile mit unbekannter Ablaufart sichtbar', () => {
    // Sonst wartet jemand, den niemand mehr sieht.
    const a = werteAus(zeile({ typ: 'unbekannt' as never }), JETZT)
    expect(a.name).toBe('Erika Müller')
    expect(a.letzterSchrittTitel).toMatch(/Schritt 2/)
  })
})

describe('tageSeit', () => {
  it('rechnet ganze Tage', () => {
    expect(tageSeit(vorTagen(7), JETZT)).toBe(7)
    expect(tageSeit(JETZT.toISOString(), JETZT)).toBe(0)
  })

  it('behandelt Fehlendes als unendlich lange her', () => {
    expect(tageSeit(null, JETZT)).toBe(Number.POSITIVE_INFINITY)
    expect(tageSeit('unsinn', JETZT)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('Filter', () => {
  const alle = [
    werteAus(zeile({ id: 'offen', updatedAt: vorTagen(1) }), JETZT),
    werteAus(zeile({ id: 'inaktiv', updatedAt: vorTagen(10) }), JETZT),
    werteAus(zeile({ id: 'fertig', abgeschlossenAm: vorTagen(2), updatedAt: vorTagen(30) }), JETZT),
    werteAus(zeile({ id: 'mit_doku', dokumentStatus: { lebenslauf: {} }, updatedAt: vorTagen(9) }), JETZT),
  ]

  it('hat für jeden Filter eine Beschriftung', () => {
    for (const f of FILTER) expect(FILTER_LABEL[f].length).toBeGreaterThan(0)
  })

  it('unvollstaendig lässt Abgeschlossene weg', () => {
    expect(wendeFilterAn(alle, 'unvollstaendig').map(z => z.id)).not.toContain('fertig')
  })

  it('vollstaendig zeigt nur Abgeschlossene', () => {
    expect(wendeFilterAn(alle, 'vollstaendig').map(z => z.id)).toEqual(['fertig'])
  })

  it('inaktiv zählt den Grenztag MIT', () => {
    // „seit 10 Tagen inaktiv" muss die Zeile mit genau 10 Tagen finden —
    // sonst fällt die Menge heraus, nach der jemand gerade sucht.
    expect(wendeFilterAn(alle, 'inaktiv', 10).map(z => z.id)).toContain('inaktiv')
    expect(wendeFilterAn(alle, 'inaktiv', 11).map(z => z.id)).not.toContain('inaktiv')
  })

  it('inaktiv zählt Abgeschlossene NICHT mit', () => {
    // Die sind fertig, nicht liegengeblieben — auch wenn sie 30 Tage alt sind.
    expect(wendeFilterAn(alle, 'inaktiv', 7).map(z => z.id)).not.toContain('fertig')
  })

  it('dokument_fehlt findet nur Zeilen ohne Vermerk', () => {
    const treffer = wendeFilterAn(alle, 'dokument_fehlt').map(z => z.id)
    expect(treffer).toContain('offen')
    expect(treffer).not.toContain('mit_doku')
    expect(treffer).not.toContain('fertig')
  })

  it('alle gibt eine Kopie zurück, nicht das Original', () => {
    const ergebnis = wendeFilterAn(alle, 'alle')
    expect(ergebnis).toHaveLength(alle.length)
    expect(ergebnis).not.toBe(alle)
  })
})

describe('Suche und Kennzahlen', () => {
  const alle = [
    werteAus(zeile({ id: '1', name: 'Erika Müller' }), JETZT),
    werteAus(zeile({ id: '2', name: 'Hans Schmidt', abgeschlossenAm: vorTagen(1) }), JETZT),
  ]

  it('sucht ohne Rücksicht auf Groß- und Kleinschreibung', () => {
    expect(sucheNachName(alle, 'müller').map(z => z.id)).toEqual(['1'])
    expect(sucheNachName(alle, 'SCHMIDT').map(z => z.id)).toEqual(['2'])
  })

  it('gibt bei leerem Begriff alles zurück', () => {
    expect(sucheNachName(alle, '   ')).toHaveLength(2)
  })

  it('zählt die Kennzahlen konsistent', () => {
    const k = kennzahlen(alle)
    expect(k.gesamt).toBe(2)
    expect(k.offen + k.abgeschlossen).toBe(k.gesamt)
  })
})
