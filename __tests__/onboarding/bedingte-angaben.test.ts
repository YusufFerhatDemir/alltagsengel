/**
 * Bedingte Pflichtangaben
 *
 * Der Fall: „Für wen suchen Sie Unterstützung?". Bei „für mich selbst"
 * ist die Frage nach dem Namen der pflegebedürftigen Person sinnlos, bei
 * „für meine Mutter" unverzichtbar. Beide Angaben fest zu verlangen,
 * hielte die Hälfte der Menschen an einer unbeantwortbaren Frage auf.
 *
 * Geprüft wird vor allem, dass Wizard, Fortschritt und Zusammenfassung
 * DIESELBE Auflösung benutzen — läuft eine davon anders, hält die
 * Oberfläche jemanden auf, den der Service längst für vollständig hält.
 */

import { describe, it, expect } from 'vitest'
import {
  SCHRITTFOLGEN, erwarteteAngabenFuer, schrittNummer,
} from '@/lib/onboarding/schritte'
import {
  beginneWeiter, darfWeiter, ersterZustand, fehlendeAngabenImSchritt,
} from '@/lib/onboarding/wizard-logik'
import { ermittleFehlendeAngaben } from '@/lib/onboarding/service'
import { offenePflichtangaben } from '@/components/onboarding/kunde/zusammenfassung'

const FUER_WEN = schrittNummer('kunde', 1)

describe('erwarteteAngabenFuer', () => {
  it('verlangt bei „für mich selbst" nur die Grundangabe', () => {
    expect(erwarteteAngabenFuer(FUER_WEN, { fuer_wen: 'selbst' })).toEqual(['fuer_wen'])
  })

  it('verlangt bei einer angehörigen Person die Personenangaben dazu', () => {
    expect(erwarteteAngabenFuer(FUER_WEN, { fuer_wen: 'angehoeriger' })).toEqual([
      'fuer_wen', 'person_vorname', 'person_nachname', 'beziehung',
    ])
  })

  it('gilt genauso für „jemand anderen"', () => {
    expect(erwarteteAngabenFuer(FUER_WEN, { fuer_wen: 'andere' }))
      .toContain('person_nachname')
  })

  it('verlangt ohne Antwort noch nichts Zusätzliches', () => {
    // Wer die erste Frage noch nicht beantwortet hat, soll nicht schon
    // drei rote Felder sehen.
    expect(erwarteteAngabenFuer(FUER_WEN, {})).toEqual(['fuer_wen'])
    expect(erwarteteAngabenFuer(FUER_WEN, undefined)).toEqual(['fuer_wen'])
  })

  it('nimmt eine Angabe nicht doppelt auf', () => {
    const schritt = {
      ...FUER_WEN,
      bedingteAngaben: [{ feld: 'fuer_wen', werte: ['selbst'], dannErwartet: ['fuer_wen'] }],
    }
    expect(erwarteteAngabenFuer(schritt, { fuer_wen: 'selbst' })).toEqual(['fuer_wen'])
  })

  it('lässt Schritte ohne Bedingung unverändert', () => {
    const adresse = schrittNummer('kunde', 2)
    expect(erwarteteAngabenFuer(adresse, {})).toEqual([...adresse.erwarteteAngaben])
  })
})

describe('Der Wizard hält an — aber nur wenn nötig', () => {
  it('lässt „für mich selbst" sofort weiter', () => {
    expect(darfWeiter(FUER_WEN, { fuer_wen: 'selbst' })).toBe(true)
    const e = beginneWeiter(
      ersterZustand(10, 1, { fuer_wen: { fuer_wen: 'selbst' } }), FUER_WEN,
    )
    expect(e.art).toBe('speichern')
  })

  it('hält bei einer angehörigen Person ohne deren Namen an', () => {
    expect(darfWeiter(FUER_WEN, { fuer_wen: 'angehoeriger' })).toBe(false)
    const e = beginneWeiter(
      ersterZustand(10, 1, { fuer_wen: { fuer_wen: 'angehoeriger' } }), FUER_WEN,
    )
    expect(e.art).toBe('unvollstaendig')
    if (e.art === 'unvollstaendig') {
      expect(e.zustand.fehlendePflicht).toEqual(['person_vorname', 'person_nachname', 'beziehung'])
    }
  })

  it('lässt weiter, sobald die Zusatzangaben da sind', () => {
    const daten = {
      fuer_wen: 'angehoeriger', person_vorname: 'Anna',
      person_nachname: 'Müller', beziehung: 'elternteil',
    }
    expect(darfWeiter(FUER_WEN, daten)).toBe(true)
    expect(fehlendeAngabenImSchritt(FUER_WEN, daten)).toEqual([])
  })
})

describe('Fortschritt und Zusammenfassung rechnen gleich', () => {
  it('meldet dieselben Lücken wie der Wizard', () => {
    const daten = { fuer_wen: { fuer_wen: 'angehoeriger' } }

    const imWizard = fehlendeAngabenImSchritt(FUER_WEN, daten.fuer_wen)
    const imFortschritt = ermittleFehlendeAngaben('kunde', {
      fuer_wen: { status: 'fertig', daten: daten.fuer_wen, zeitpunkt: 'x' },
    })

    for (const angabe of imWizard) expect(imFortschritt).toContain(angabe)
  })

  it('zählt die Zusatzangaben in der Prüfseite mit', () => {
    const offen = offenePflichtangaben({ fuer_wen: { fuer_wen: 'angehoeriger' } })
    expect(offen).toContain('Name der Person (Nachname)')
    expect(offen).toContain('Ihr Verhältnis zur Person')
  })

  it('zählt sie bei „für mich selbst" NICHT mit', () => {
    const offen = offenePflichtangaben({ fuer_wen: { fuer_wen: 'selbst' } })
    expect(offen).not.toContain('Name der Person (Nachname)')
    expect(offen).not.toContain('Ihr Verhältnis zur Person')
  })
})

describe('Angehörigen-Ablauf', () => {
  it('hat eine eigene, vollständige Schrittfolge', () => {
    expect(SCHRITTFOLGEN.angehoerige.map(s => s.schluessel)).toEqual([
      'kontakt', 'bezug', 'umfang', 'unterlagen', 'zusammenfassung', 'abschluss',
    ])
  })

  it('verlangt einen Nachweis nur bei Betreuung oder Vollmacht', () => {
    // „Angehörig" ist kein Rechtsverhältnis, das man belegen müsste.
    const bezug = SCHRITTFOLGEN.angehoerige.find(s => s.schluessel === 'bezug')!
    expect(erwarteteAngabenFuer(bezug, { beziehungsart: 'angehoeriger' }))
      .not.toContain('nachweis_art')
    expect(erwarteteAngabenFuer(bezug, { beziehungsart: 'betreuer' }))
      .toContain('nachweis_art')
    expect(erwarteteAngabenFuer(bezug, { beziehungsart: 'bevollmaechtigter' }))
      .toContain('nachweis_art')
  })

  it('macht das Hochladen des Nachweises freiwillig', () => {
    // Der Nachweis darf nachgereicht werden — sonst bricht der Ablauf an
    // einem Dokument ab, das im Ordner zu Hause liegt.
    expect(SCHRITTFOLGEN.angehoerige.find(s => s.schluessel === 'unterlagen')?.ueberspringbar)
      .toBe(true)
  })
})
