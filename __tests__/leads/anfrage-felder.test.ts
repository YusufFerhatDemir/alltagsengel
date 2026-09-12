/**
 * Felder der Kundenanfrage — Prüfung der Katalogwerte.
 * @see lib/leads/anfrage-felder.ts
 *
 * Der Kern ist eine Regel, die dieses Projekt teuer gelernt hat: ein
 * unbekannter Wert wird ABGEWIESEN, nicht stillschweigend verworfen. Sonst
 * meldet das Formular „gespeichert" und die Angabe ist weg.
 */
import { describe, it, expect } from 'vitest'
import {
  ANLIEGEN, DRINGLICHKEIT, KONTAKTWEG, PFLEGEGRAD, ANFRAGE_FELDER,
  pruefeAnfrageDaten, istEmailPlausibel, anliegenPflichtFuer, optionen,
} from '@/lib/leads/anfrage-felder'

describe('pruefeAnfrageDaten', () => {
  it('nimmt bekannte Werte an', () => {
    const r = pruefeAnfrageDaten({
      anliegen: 'angehoeriger', dringlichkeit: 'sofort',
      kontaktweg: 'telefon', pflegegrad: '3',
    })
    expect(r.fehler).toBeNull()
    expect(r.daten).toEqual({
      anliegen: 'angehoeriger', dringlichkeit: 'sofort',
      kontaktweg: 'telefon', pflegegrad: '3',
    })
  })

  it('alles optional — ein leerer Körper ist kein Fehler', () => {
    expect(pruefeAnfrageDaten({})).toEqual({ daten: {}, fehler: null })
  })

  it('leere Zeichenkette, null und undefined zählen als „nicht angegeben"', () => {
    const r = pruefeAnfrageDaten({ anliegen: '', dringlichkeit: null, kontaktweg: undefined })
    expect(r.fehler).toBeNull()
    expect(r.daten).toEqual({})
  })

  it('ein unbekannter Wert wird ABGEWIESEN, nicht verworfen', () => {
    const r = pruefeAnfrageDaten({ pflegegrad: '7' })
    expect(r.fehler).toMatch(/pflegegrad/)
    expect(r.daten).toEqual({})
  })

  it('ein Nicht-String wird abgewiesen (kein Objekt-Schmuggel ins jsonb)', () => {
    expect(pruefeAnfrageDaten({ anliegen: { $ne: null } }).fehler).toMatch(/anliegen/)
    expect(pruefeAnfrageDaten({ dringlichkeit: 42 }).fehler).toMatch(/dringlichkeit/)
  })

  it('Fremdfelder im Körper landen NICHT im jsonb', () => {
    const r = pruefeAnfrageDaten({ anliegen: 'kunde', rolle: 'superadmin', organization_id: 'fremd' })
    expect(r.fehler).toBeNull()
    expect(r.daten).toEqual({ anliegen: 'kunde' })
  })

  it('deckt genau die vier dokumentierten Felder ab', () => {
    expect([...ANFRAGE_FELDER].sort()).toEqual(['anliegen', 'dringlichkeit', 'kontaktweg', 'pflegegrad'])
  })
})

describe('anliegenPflichtFuer', () => {
  it('gilt für den Rückrufweg', () => {
    expect(anliegenPflichtFuer('rueckruf')).toBe(true)
  })
  it('gilt nicht für die übrigen Wege — die haben andere Signale', () => {
    for (const q of ['website', 'alltagsbegleitung-darmstadt', 'terminbuchung', undefined]) {
      expect(anliegenPflichtFuer(q)).toBe(false)
    }
  })
})

describe('istEmailPlausibel', () => {
  it.each([
    'a@b.de', 'vorname.nachname@alltagsengel.care', 'x+tag@sub.domain.co.uk',
  ])('nimmt %s an', (wert) => {
    expect(istEmailPlausibel(wert)).toBe(true)
  })

  it.each([
    ['ohne At', 'keinatzeichen.de'],
    ['ohne Punkt-Domain', 'a@b'],
    ['Leerzeichen', 'a b@c.de'],
    ['leer', ''],
    ['zwei At', 'a@b@c.de'],
    ['Endung zu kurz', 'a@b.d'],
  ])('weist %s ab', (_fall, wert) => {
    expect(istEmailPlausibel(wert)).toBe(false)
  })

  it('weist über 254 Zeichen ab', () => {
    expect(istEmailPlausibel('a'.repeat(250) + '@b.de')).toBe(false)
  })
})

describe('Kataloge', () => {
  it('jede Option hat einen Anzeigetext — kein roher Schlüssel im Formular', () => {
    for (const katalog of [ANLIEGEN, DRINGLICHKEIT, KONTAKTWEG, PFLEGEGRAD]) {
      for (const [wert, text] of Object.entries(katalog)) {
        expect(text.length, `${wert} ohne Text`).toBeGreaterThan(3)
        expect(text).not.toBe(wert)
      }
    }
  })

  it('optionen() liefert Wert und Text in der Katalogreihenfolge', () => {
    expect(optionen(KONTAKTWEG)).toEqual([
      { wert: 'telefon', text: 'Telefon' },
      { wert: 'email', text: 'E-Mail' },
      { wert: 'whatsapp', text: 'WhatsApp' },
      { wert: 'egal', text: 'Egal' },
    ])
  })

  it('Pflegegrad trennt „kein" von „beantragt" — fachlich zwei Welten', () => {
    expect(PFLEGEGRAD).toHaveProperty('kein')
    expect(PFLEGEGRAD).toHaveProperty('beantragt')
    expect(PFLEGEGRAD.beantragt).not.toBe(PFLEGEGRAD.kein)
  })

  it('die vier Anliegen decken Kunde, Angehörige, Bewerber und Rest ab', () => {
    expect(Object.keys(ANLIEGEN)).toEqual(['kunde', 'angehoeriger', 'bewerber', 'sonstiges'])
  })
})
