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
  pruefeNeuerLead, LEAD_MAX_LEN,
} from '@/lib/leads/anfrage-felder'
import { istBewerbung } from '@/lib/admin/ops'

describe('pruefeAnfrageDaten', () => {
  it('nimmt bekannte Werte an', () => {
    const r = pruefeAnfrageDaten({
      anliegen: 'angehoeriger', dringlichkeit: 'sofort',
      kontaktweg: 'telefon', pflegegrad: 'grad3',
    })
    expect(r.fehler).toBeNull()
    expect(r.daten).toEqual({
      anliegen: 'angehoeriger', dringlichkeit: 'sofort',
      kontaktweg: 'telefon', pflegegrad: 'grad3',
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
    const r = pruefeAnfrageDaten({ pflegegrad: 'grad7' })
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

  it('kein Pflegegrad-Schlüssel ist ganzzahlig — sonst sortiert JS ihn nach vorn', () => {
    // Der Fehler, den nur der Browser zeigte: mit '1'..'5' standen die Grade
    // im Auswahlfeld VOR „Weiß ich nicht".
    for (const k of Object.keys(PFLEGEGRAD)) {
      expect(String(Number(k)), `Schlüssel ${k} ist ganzzahlig`).not.toBe(k)
    }
    expect(optionen(PFLEGEGRAD).map(o => o.wert)).toEqual([
      'unbekannt', 'kein', 'beantragt', 'grad1', 'grad2', 'grad3', 'grad4', 'grad5',
    ])
  })

  it('die vier Anliegen decken Kunde, Angehörige, Bewerber und Rest ab', () => {
    expect(Object.keys(ANLIEGEN)).toEqual(['kunde', 'angehoeriger', 'bewerber', 'sonstiges'])
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Neu angelegte Anfragen (13.09.2026)
// ═══════════════════════════════════════════════════════════════════════

describe('pruefeNeuerLead', () => {
  const gut = { name: 'Erika Müller', phone: '06181 123456', source: 'telefon' }

  it('nimmt eine vollständige Anfrage an', () => {
    const r = pruefeNeuerLead({ ...gut, plz: '63450', message: 'Ruft zurück', service: 'Alltagsbegleitung' })
    expect(r.fehler).toBeNull()
    expect(r.lead).toMatchObject({ name: 'Erika Müller', plz: '63450' })
  })

  it('verlangt Name und Telefon', () => {
    expect(pruefeNeuerLead({ ...gut, name: '   ' }).fehler).toMatch(/Name/)
    expect(pruefeNeuerLead({ ...gut, phone: '' }).fehler).toMatch(/Telefon/)
  })

  it('verlangt eine Nummer, die nach einer Nummer aussieht', () => {
    expect(pruefeNeuerLead({ ...gut, phone: 'ruft an' }).fehler).toMatch(/Nummer/)
    expect(pruefeNeuerLead({ ...gut, phone: '12345' }).fehler).toMatch(/Nummer/)
    expect(pruefeNeuerLead({ ...gut, phone: '123456' }).fehler).toBeNull()
  })

  it('weist die Bewerbungs-Quelle ab — sonst entsteht still eine Bewerbung', () => {
    // Mit source='engel-bewerbung' waere die Zeile nach der Regel in
    // lib/admin/ops.ts eine Bewerbung: weg aus dem Anfragen-Posteingang,
    // auf in die Bewerberliste. Niemand hat das gewollt.
    const r = pruefeNeuerLead({ ...gut, source: 'engel-bewerbung' })
    expect(r.fehler).toMatch(/Bewerbung/)
    expect(r.lead).toBeNull()
    expect(istBewerbung({ art: 'anfrage', source: 'engel-bewerbung' })).toBe(true)   // der Grund
  })

  it('weist zu langen Text AB, statt ihn zu kürzen', () => {
    // Ein stillschweigend abgeschnittener Name ist ein falscher Name, und
    // wer ihn eingetippt hat, erfaehrt es nie.
    const r = pruefeNeuerLead({ ...gut, name: 'x'.repeat(LEAD_MAX_LEN.name + 1) })
    expect(r.fehler).toMatch(/zu lang/)
    expect(r.lead).toBeNull()
    expect(pruefeNeuerLead({ ...gut, name: 'x'.repeat(LEAD_MAX_LEN.name) }).fehler).toBeNull()
  })

  it('prüft die PLZ auf vier oder fünf Ziffern', () => {
    expect(pruefeNeuerLead({ ...gut, plz: '634' }).fehler).toMatch(/PLZ/)
    expect(pruefeNeuerLead({ ...gut, plz: 'ABCDE' }).fehler).toMatch(/PLZ/)
    expect(pruefeNeuerLead({ ...gut, plz: '63450' }).fehler).toBeNull()
    expect(pruefeNeuerLead({ ...gut, plz: '' }).fehler).toBeNull()
  })

  it('weist Nicht-Zeichenketten ab', () => {
    expect(pruefeNeuerLead({ ...gut, message: { $ne: null } }).fehler).toMatch(/Ungültige Angabe/)
    expect(pruefeNeuerLead({ ...gut, name: 42 }).fehler).toMatch(/Ungültige Angabe/)
  })

  it('setzt eine Ersatzquelle, statt leer zu lassen', () => {
    expect(pruefeNeuerLead({ ...gut, source: '' }).lead?.source).toBe('crm')
  })
})
