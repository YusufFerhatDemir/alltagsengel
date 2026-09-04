/**
 * Personalisierte Anleitung
 *
 * Der Kern ist die Unterscheidung dreier Zustände. „Erledigt / nicht
 * erledigt" wäre zu grob und in der Wirkung unfair: ein freiwilliger
 * offener Punkt sähe genauso aus wie eine fehlende Pflichtangabe, und wer
 * fünf rote Punkte sieht, macht gar nicht erst weiter — obwohl drei davon
 * niemanden aufhalten.
 */

import { describe, it, expect } from 'vitest'
import {
  PUNKT_ZUSTAENDE, ZUSTAND_DARSTELLUNG, baueAnleitung, erforderlichePunkte,
} from '@/lib/onboarding/anleitung'
import { SCHRITTFOLGEN, gesamtSchritte } from '@/lib/onboarding/schritte'
import { UnbekannterOnboardingTypError } from '@/lib/onboarding/schritte'

const FOLGE = SCHRITTFOLGEN.kunde
const fertig = (schluessel: string) => ({
  [schluessel]: { status: 'fertig' as const, daten: {}, zeitpunkt: 'x' },
})

describe('Zustände', () => {
  it('kennt genau drei', () => {
    expect(PUNKT_ZUSTAENDE).toEqual(['erledigt', 'erforderlich', 'offen'])
  })

  it('hat für jeden Zustand ein Zeichen UND ein Wort', () => {
    // Ein Symbol allein ist für Vorlesesoftware nichts.
    for (const z of PUNKT_ZUSTAENDE) {
      expect(ZUSTAND_DARSTELLUNG[z].zeichen.length).toBeGreaterThan(0)
      expect(ZUSTAND_DARSTELLUNG[z].text.length).toBeGreaterThan(0)
    }
  })

  it('markiert Pflichtschritte als erforderlich, freiwillige als offen', () => {
    const a = baueAnleitung({ typ: 'kunde', schritteDaten: {}, abgeschlossenAm: null })
    for (const punkt of a.punkte) {
      const schritt = FOLGE.find(s => s.schluessel === punkt.schluessel)!
      expect(punkt.zustand).toBe(schritt.ueberspringbar ? 'offen' : 'erforderlich')
    }
  })

  it('zählt bewusst Übersprungenes als erledigt', () => {
    // Die Person hat entschieden — das soll nicht als Mahnung zurückkommen.
    const freiwillig = FOLGE.find(s => s.ueberspringbar)!
    const a = baueAnleitung({
      typ: 'kunde',
      schritteDaten: { [freiwillig.schluessel]: { status: 'uebersprungen', daten: {}, zeitpunkt: 'x' } },
      abgeschlossenAm: null,
    })
    const punkt = a.punkte.find(p => p.schluessel === freiwillig.schluessel)!
    expect(punkt.zustand).toBe('erledigt')
    expect(punkt.uebersprungen).toBe(true)
  })
})

describe('Fortschritt', () => {
  it('rechnet erledigt, gesamt und Prozent', () => {
    const a = baueAnleitung({
      typ: 'kunde',
      schritteDaten: { ...fertig(FOLGE[0].schluessel), ...fertig(FOLGE[1].schluessel) },
      abgeschlossenAm: null,
    })
    expect(a.gesamt).toBe(gesamtSchritte('kunde'))
    expect(a.erledigt).toBe(2)
    expect(a.prozent).toBe(Math.round((2 / a.gesamt) * 100))
  })

  it('ist bei leerem Stand 0 %', () => {
    expect(baueAnleitung({ typ: 'kunde', schritteDaten: {}, abgeschlossenAm: null }).prozent).toBe(0)
  })

  it('nennt den nächsten Punkt, der aufhält', () => {
    const a = baueAnleitung({
      typ: 'kunde', schritteDaten: fertig(FOLGE[0].schluessel), abgeschlossenAm: null,
    })
    expect(a.naechsterPflichtpunkt?.schluessel).toBe(FOLGE[1].schluessel)
  })

  it('meldet keinen Pflichtpunkt mehr, wenn alle Pflichten erledigt sind', () => {
    const alle = Object.fromEntries(
      FOLGE.filter(s => !s.ueberspringbar)
        .map(s => [s.schluessel, { status: 'fertig' as const, daten: {}, zeitpunkt: 'x' }]),
    )
    const a = baueAnleitung({ typ: 'kunde', schritteDaten: alle, abgeschlossenAm: null })
    expect(a.naechsterPflichtpunkt).toBeNull()
    expect(erforderlichePunkte(a)).toEqual([])
  })
})

describe('Lagebeschreibung', () => {
  it('sagt beim leeren Stand, dass es schnell geht', () => {
    const a = baueAnleitung({ typ: 'kunde', schritteDaten: {}, abgeschlossenAm: null })
    expect(a.lage).toMatch(/noch nicht angefangen|wenige Minuten/)
  })

  it('nennt den nächsten Schritt beim Namen', () => {
    const a = baueAnleitung({
      typ: 'kunde', schritteDaten: fertig(FOLGE[0].schluessel), abgeschlossenAm: null,
    })
    expect(a.lage).toContain(FOLGE[1].titel)
  })

  it('macht aus offenen freiwilligen Punkten keinen Druck', () => {
    const alle = Object.fromEntries(
      FOLGE.filter(s => !s.ueberspringbar)
        .map(s => [s.schluessel, { status: 'fertig' as const, daten: {}, zeitpunkt: 'x' }]),
    )
    const a = baueAnleitung({ typ: 'kunde', schritteDaten: alle, abgeschlossenAm: null })
    expect(a.lage).toMatch(/freiwillig/i)
    expect(a.lage).toMatch(/nachreichen|weglassen/)
  })

  it('sagt bei Abschluss, dass nichts weiter zu tun ist', () => {
    const a = baueAnleitung({
      typ: 'kunde', schritteDaten: {}, abgeschlossenAm: '2026-09-20T10:00:00Z',
    })
    expect(a.abgeschlossen).toBe(true)
    expect(a.lage).toMatch(/nichts weiter tun/)
  })
})

describe('Fehlende Angaben je Punkt', () => {
  it('nennt sie in Klartext', () => {
    const adresse = FOLGE.find(s => s.schluessel === 'adresse')!
    const a = baueAnleitung({
      typ: 'kunde',
      schritteDaten: { adresse: { status: 'offen', daten: { plz: '60313' }, zeitpunkt: 'x' } },
      abgeschlossenAm: null,
    })
    const punkt = a.punkte.find(p => p.schluessel === 'adresse')!
    expect(punkt.fehlendeAngaben).toContain('Ort')
    expect(punkt.fehlendeAngaben).not.toContain('Postleitzahl')
    expect(adresse.erwarteteAngaben).toContain('ort')
  })

  it('nennt bei erledigten Punkten nichts', () => {
    const a = baueAnleitung({
      typ: 'kunde', schritteDaten: fertig('adresse'), abgeschlossenAm: null,
    })
    expect(a.punkte.find(p => p.schluessel === 'adresse')?.fehlendeAngaben).toEqual([])
  })
})

describe('Alle Ablaufarten', () => {
  it('haben eine eigene Überschrift und funktionieren', () => {
    const ueberschriften = new Set<string>()
    for (const typ of ['bewerber', 'kunde', 'angehoerige'] as const) {
      const a = baueAnleitung({ typ, schritteDaten: {}, abgeschlossenAm: null })
      expect(a.punkte.length).toBe(gesamtSchritte(typ))
      ueberschriften.add(a.ueberschrift)
    }
    expect(ueberschriften.size).toBe(3)
  })

  it('ist fail-closed bei unbekannter Ablaufart', () => {
    // Eine Anleitung für einen Ablauf, den es nicht gibt, sähe verbindlich aus.
    expect(() => baueAnleitung({
      typ: 'engel' as never, schritteDaten: {}, abgeschlossenAm: null,
    })).toThrow(UnbekannterOnboardingTypError)
  })
})
