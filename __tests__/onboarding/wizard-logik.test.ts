/**
 * Wizard-Logik
 *
 * Diese Tests sind die einzige Absicherung des Wizards: das Repo hat
 * keine DOM-Testumgebung, die Komponente selbst ist deshalb bewusst
 * entscheidungsfrei. Alles, was hier gruen ist, ist auch in der
 * Oberflaeche gruen — alles andere waere ungeprueft.
 *
 * Der wichtigste Fall steht in „Erst speichern, dann weiter": schaltet
 * der Wizard bei einem Fehlschlag trotzdem weiter, verliert eine Person
 * genau die Angaben, die sie gerade gemacht hat.
 */

import { describe, it, expect } from 'vitest'
import {
  abbruchstelle, auftragFuerSpaeter, beginneWeiter, darfWeiter, ersterZustand,
  fehlendeAngabenImSchritt, fortschrittProzent, istLetzterSchritt, schrittBeschriftung,
  setzeSchrittDaten, weiterBeschriftung, zurueck, zustandNachSpeichern,
  type WizardSchritt,
} from '@/lib/onboarding/wizard-logik'
import { SCHRITTFOLGEN } from '@/lib/onboarding/schritte'

const PFLICHT: WizardSchritt = {
  schluessel: 'kontakt',
  titel: 'Ihre Kontaktdaten',
  hinweis: 'Damit wir uns melden können.',
  ueberspringbar: false,
  erwarteteAngaben: ['vorname', 'nachname'],
}

const OPTIONAL: WizardSchritt = {
  schluessel: 'erfahrung',
  titel: 'Ihre Erfahrung',
  hinweis: 'Auch ohne Ausbildung möglich.',
  ueberspringbar: true,
  erwarteteAngaben: ['erfahrung'],
}

describe('Fortschritt', () => {
  it('zeigt beim ersten Schritt nicht 0 %', () => {
    // Ein leerer Balken sieht aus, als haette man nichts geschafft.
    expect(fortschrittProzent(1, 5)).toBeGreaterThan(0)
    expect(fortschrittProzent(1, 5)).toBe(10)
  })

  it('zeigt beim letzten Schritt nicht 100 %', () => {
    // Der Schritt ist noch nicht abgeschickt.
    expect(fortschrittProzent(5, 5)).toBe(90)
  })

  it('bleibt bei unsinnigen Werten im Rahmen', () => {
    expect(fortschrittProzent(0, 5)).toBe(10)
    expect(fortschrittProzent(99, 5)).toBe(90)
    expect(fortschrittProzent(1, 0)).toBeGreaterThanOrEqual(0)
  })

  it('beschriftet den Hauptknopf am Ende um', () => {
    expect(weiterBeschriftung(2, 5)).toBe('Weiter')
    expect(weiterBeschriftung(5, 5)).toBe('Abschließen')
    expect(istLetzterSchritt(5, 5)).toBe(true)
  })

  it('nennt den Schritt fuer Vorlesesoftware', () => {
    expect(schrittBeschriftung(2, 5)).toBe('Schritt 2 von 5')
  })
})

describe('ersterZustand', () => {
  it('haelt den Startschritt in der Folge', () => {
    expect(ersterZustand(5, 9).aktuellerSchritt).toBe(5)
    expect(ersterZustand(5, 0).aktuellerSchritt).toBe(1)
    expect(ersterZustand(0).gesamtSchritte).toBe(1)
  })

  it('uebernimmt bereits gegebene Antworten', () => {
    const z = ersterZustand(5, 3, { kontakt: { vorname: 'Erika' } })
    expect(z.daten.kontakt.vorname).toBe('Erika')
  })
})

describe('Pruefung', () => {
  it('erkennt leere Zeichenketten, null und leere Listen als fehlend', () => {
    expect(fehlendeAngabenImSchritt(PFLICHT, { vorname: '  ', nachname: null }))
      .toEqual(['vorname', 'nachname'])
    expect(fehlendeAngabenImSchritt(
      { ...PFLICHT, erwarteteAngaben: ['leistungen'] }, { leistungen: [] },
    )).toEqual(['leistungen'])
  })

  it('laesst 0 und false als gueltige Antworten gelten', () => {
    // Pflegegrad 0 oder „nein" ist eine Antwort, keine Luecke.
    expect(fehlendeAngabenImSchritt(
      { ...PFLICHT, erwarteteAngaben: ['grad', 'zusage'] }, { grad: 0, zusage: false },
    )).toEqual([])
  })

  it('blockiert Pflichtschritte, aber nie ueberspringbare', () => {
    expect(darfWeiter(PFLICHT, {})).toBe(false)
    expect(darfWeiter(PFLICHT, { vorname: 'Erika', nachname: 'Müller' })).toBe(true)
    expect(darfWeiter(OPTIONAL, {})).toBe(true)
  })
})

describe('beginneWeiter', () => {
  it('speichert nicht, wenn Pflichtangaben fehlen', () => {
    const z = ersterZustand(5, 1)
    const e = beginneWeiter(z, PFLICHT)
    expect(e.art).toBe('unvollstaendig')
    if (e.art === 'unvollstaendig') {
      expect(e.zustand.fehlendePflicht).toEqual(['vorname', 'nachname'])
      expect(e.zustand.aktuellerSchritt).toBe(1)
    }
  })

  it('liefert einen Speicherauftrag, wenn alles da ist', () => {
    const z = ersterZustand(5, 1, { kontakt: { vorname: 'Erika', nachname: 'Müller' } })
    const e = beginneWeiter(z, PFLICHT)
    expect(e.art).toBe('speichern')
    if (e.art === 'speichern') {
      expect(e.auftrag).toMatchObject({ schritt: 1, schluessel: 'kontakt', status: 'fertig' })
      expect(e.zustand.speichert).toBe(true)
    }
  })

  it('markiert einen leeren optionalen Schritt als uebersprungen', () => {
    // Sonst behauptet die Auswertung, jemand habe ihn beantwortet.
    const e = beginneWeiter(ersterZustand(5, 3), OPTIONAL)
    expect(e.art).toBe('speichern')
    if (e.art === 'speichern') expect(e.auftrag.status).toBe('uebersprungen')
  })

  it('markiert einen ausgefuellten optionalen Schritt als fertig', () => {
    const z = ersterZustand(5, 3, { erfahrung: { erfahrung: 'zwei Jahre' } })
    const e = beginneWeiter(z, OPTIONAL)
    if (e.art === 'speichern') expect(e.auftrag.status).toBe('fertig')
  })
})

describe('Erst speichern, dann weiter', () => {
  const bereit = ersterZustand(5, 2, { kontakt: { vorname: 'E', nachname: 'M' } })

  it('schaltet bei Erfolg genau einen Schritt weiter', () => {
    const z = zustandNachSpeichern({ ...bereit, speichert: true }, { ok: true })
    expect(z.aktuellerSchritt).toBe(3)
    expect(z.speichert).toBe(false)
    expect(z.fehler).toBeNull()
  })

  it('bleibt bei einem Fehlschlag stehen UND behaelt die Eingaben', () => {
    // Der Kern: sonst verliert eine Person ihre Angaben an einen Netzfehler.
    const z = zustandNachSpeichern(
      { ...bereit, speichert: true }, { ok: false, fehler: 'Netz weg' },
    )
    expect(z.aktuellerSchritt).toBe(2)
    expect(z.daten.kontakt).toEqual({ vorname: 'E', nachname: 'M' })
    expect(z.fehler).toBe('Netz weg')
    expect(z.speichert).toBe(false)
    expect(z.fertig).toBe(false)
  })

  it('hat auch ohne Fehlertext eine verstaendliche Meldung', () => {
    const z = zustandNachSpeichern({ ...bereit, speichert: true }, { ok: false, fehler: '' })
    expect(z.fehler).toMatch(/Eingaben sind noch da/)
  })

  it('setzt am letzten Schritt fertig statt weiterzuschalten', () => {
    const z = zustandNachSpeichern(
      { ...ersterZustand(5, 5), speichert: true }, { ok: true },
    )
    expect(z.fertig).toBe(true)
    expect(z.aktuellerSchritt).toBe(5)
  })
})

describe('Navigation und Eingaben', () => {
  it('geht zurueck, ohne Daten zu verlieren', () => {
    const z = zurueck(ersterZustand(5, 3, { kontakt: { vorname: 'Erika' } }))
    expect(z.aktuellerSchritt).toBe(2)
    expect(z.daten.kontakt.vorname).toBe('Erika')
  })

  it('geht nicht vor den ersten Schritt zurueck', () => {
    expect(zurueck(ersterZustand(5, 1)).aktuellerSchritt).toBe(1)
  })

  it('fuehrt Teileingaben zusammen, statt sie zu ersetzen', () => {
    let z = setzeSchrittDaten(ersterZustand(5, 1), 'kontakt', { vorname: 'Erika' })
    z = setzeSchrittDaten(z, 'kontakt', { nachname: 'Müller' })
    expect(z.daten.kontakt).toEqual({ vorname: 'Erika', nachname: 'Müller' })
  })

  it('raeumt die Fehlermeldung weg, sobald jemand tippt', () => {
    const mitFehler = { ...ersterZustand(5, 1), fehler: 'Bitte ausfüllen' }
    expect(setzeSchrittDaten(mitFehler, 'kontakt', { vorname: 'E' }).fehler).toBeNull()
  })
})

describe('Später fortsetzen', () => {
  it('speichert ohne Pruefung, auch bei leeren Pflichtfeldern', () => {
    // Wer aussteigen will, soll nicht erst ein Formular ausfuellen muessen.
    const auftrag = auftragFuerSpaeter(ersterZustand(5, 1), PFLICHT)
    expect(auftrag.schluessel).toBe('kontakt')
    expect(auftrag.status).toBe('uebersprungen')
  })

  it('meldet fertig, wenn zufaellig doch alles da ist', () => {
    const z = ersterZustand(5, 1, { kontakt: { vorname: 'E', nachname: 'M' } })
    expect(auftragFuerSpaeter(z, PFLICHT).status).toBe('fertig')
  })

  it('bildet eine auswertbare Abbruchstelle', () => {
    expect(abbruchstelle(ersterZustand(5, 3), PFLICHT)).toBe('schritt_3_kontakt')
  })
})

describe('Zusammenspiel mit den echten Schrittfolgen', () => {
  it('laesst sich mit jeder hinterlegten Folge betreiben', () => {
    for (const folge of Object.values(SCHRITTFOLGEN)) {
      const z = ersterZustand(folge.length, 1)
      expect(z.gesamtSchritte).toBe(folge.length)

      // Jeder Ablauf hat mindestens einen Pflicht-Formularschritt, und der
      // haelt ohne Eingaben auf. (Frueher stand hier `folge[0]` — seit der
      // Bewerberablauf mit einem Begruessungsschritt beginnt, ist der
      // erste Schritt nicht mehr zwingend ein Formular.)
      const erstesPflichtformular = folge.find(s => s.art === 'formular' && !s.ueberspringbar)
      expect(erstesPflichtformular).toBeDefined()
      expect(beginneWeiter(z, erstesPflichtformular!).art).toBe('unvollstaendig')
    }
  })

  it('laesst Hinweis- und Pruefschritte ohne Eingaben durch', () => {
    // Begruessung, Zusammenfassung und Absenden sammeln nichts. Wuerden
    // sie blockieren, kaeme niemand ueber den ersten Bildschirm hinaus.
    const ohneAngaben = SCHRITTFOLGEN.bewerber.filter(s => s.art !== 'formular')
    expect(ohneAngaben.length).toBeGreaterThan(0)
    for (const schritt of ohneAngaben) {
      const e = beginneWeiter(ersterZustand(12, 1), schritt)
      expect(e.art).toBe('speichern')
      if (e.art === 'speichern') expect(e.auftrag.status).toBe('fertig')
    }
  })
})
