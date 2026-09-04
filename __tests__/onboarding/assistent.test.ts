/**
 * Onboarding-Assistent
 *
 * Der Schwerpunkt liegt auf dem, was der Assistent NICHT sagen darf.
 * Eine erfundene Auskunft über einen Anspruch oder einen
 * Bearbeitungsstand richtet mehr Schaden an als ein ehrliches „das kann
 * ich nicht beantworten" — und sie fällt niemandem auf, weil sie
 * plausibel klingt.
 */

import { describe, it, expect } from 'vitest'
import {
  ABSICHTEN, beantworte, erkenneAbsicht, leistungAusFrage, offeneSchritte,
  vorschlaege, type AssistentLage,
} from '@/lib/onboarding/assistent'
import { SCHRITTFOLGEN, gesamtSchritte } from '@/lib/onboarding/schritte'

function lage(ueber: Partial<AssistentLage> = {}): AssistentLage {
  return {
    typ: 'kunde',
    aktuellerSchritt: 3,
    gesamtSchritte: gesamtSchritte('kunde'),
    schritteDaten: {},
    fehlendeAngaben: [],
    dokumentStatus: {},
    abgeschlossenAm: null,
    ...ueber,
  }
}

/** Alle Textbausteine einer Antwort. */
function text(frage: string, l: AssistentLage = lage()): string {
  const a = beantworte(frage, l)
  return `${a.text} ${a.aktionen.map(x => x.label).join(' ')}`
}

describe('Absichtserkennung', () => {
  it('erkennt die vier vereinbarten Fragen', () => {
    expect(erkenneAbsicht('Was muss ich noch machen?')).toBe('offene_schritte')
    expect(erkenneAbsicht('Ich finde meinen Pflegegrad nicht')).toBe('pflegegrad_finden')
    expect(erkenneAbsicht('Ich möchte Hilfe beim Einkaufen')).toBe('leistung_waehlen')
    expect(erkenneAbsicht('Ich möchte mich als Engel bewerben')).toBe('als_engel_bewerben')
  })

  it('versteht Umformulierungen', () => {
    for (const frage of ['Wie weit bin ich?', 'was fehlt noch', 'Was ist der nächste Schritt']) {
      expect(erkenneAbsicht(frage)).toBe('offene_schritte')
    }
  })

  it('rät NICHT bei unbekannten Fragen', () => {
    // Lieber keine Antwort als eine erfundene.
    expect(erkenneAbsicht('Wie ist das Wetter morgen in Frankfurt?')).toBeNull()
    expect(erkenneAbsicht('')).toBeNull()
    expect(erkenneAbsicht('   ')).toBeNull()
  })

  it('hat für jede Absicht eine Antwort', () => {
    for (const absicht of ABSICHTEN) {
      expect(absicht.length).toBeGreaterThan(0)
    }
  })
})

describe('Was der Assistent NICHT behauptet', () => {
  it('sagt bei Unbekanntem ausdrücklich, dass er es nicht weiß', () => {
    const a = beantworte('Wie ist das Wetter morgen?', lage())
    expect(a.quelle).toBe('keine')
    expect(a.text).toMatch(/nicht beantworten/)
    expect(a.aktionen.some(x => x.art === 'mensch')).toBe(true)
  })

  it('beantwortet Anspruchsfragen ausdrücklich NICHT', () => {
    // „Bekomme ich Pflegegrad 3?" enthält das Wort Pflegegrad und wäre
    // sonst als Frage nach dem Fundort beantwortet worden.
    for (const frage of [
      'Bekomme ich Pflegegrad 3?', 'Steht mir der Entlastungsbetrag zu?',
      'Werde ich eingestellt?', 'Zahlt die Kasse das?', 'Wird das genehmigt?',
    ]) {
      const a = beantworte(frage, lage())
      expect(a.quelle, frage).toBe('keine')
      expect(a.text, frage).toMatch(/nicht beantworten|nichts vermuten/)
      expect(a.aktionen.some(x => x.art === 'mensch'), frage).toBe(true)
    }
  })

  it('nennt bei Anspruchsfragen, wer entscheidet', () => {
    const a = beantworte('Steht mir das zu?', lage())
    expect(a.text).toMatch(/Pflegekasse/)
    expect(a.text).toMatch(/nicht wir/)
  })

  it('nennt bei fehlenden Unterlagen NICHT „fehlt", sondern „nicht vermerkt"', () => {
    // „Fehlt" wäre eine Behauptung über die Wirklichkeit. Vermerkt ist
    // nur, was in DIESEM Ablauf hochgeladen wurde.
    const a = beantworte('Ist mein Führungszeugnis angekommen?', lage({ dokumentStatus: {} }))
    expect(a.text).toMatch(/nicht vermerkt|keine Unterlage/i)
    expect(a.text).not.toMatch(/\bfehlt\b/)
  })

  it('sagt dazu, was er nicht sehen kann', () => {
    // Sonst läuft jemand ein zweites Mal zum Amt.
    const a = beantworte('Habt ihr meine Unterlagen?', lage({ dokumentStatus: {} }))
    expect(a.text).toMatch(/Post|E-Mail/)
    expect(a.text).toMatch(/erscheinen hier nicht|sehe nur/i)
  })

  it('zählt beim Pflegegrad nur auf, WO er steht — nicht was zusteht', () => {
    const a = beantworte('Ich finde meinen Pflegegrad nicht', lage())
    expect(a.quelle).toBe('wissen')
    expect(a.text).toMatch(/Bescheid|Pflegekasse/)
    expect(a.text).not.toMatch(/Ihnen steht|Sie bekommen|Sie haben Anspruch/i)
  })

  it('verspricht keine Bearbeitungszeit', () => {
    const a = beantworte('Wie lange dauert das?', lage())
    expect(a.text).toMatch(/kein festes Versprechen|nicht geben/i)
    expect(a.text).not.toMatch(/innerhalb von \d+ (Stunden|Tagen)/i)
  })

  it('schreibt keine Beträge ab', () => {
    // Die Zahlen stehen im Finanzierungsschritt und kommen dort aus den
    // gesetzlichen Werten. Hier wären sie beim nächsten Rechtsstand falsch.
    const a = beantworte('Was kostet das?', lage())
    expect(a.text).not.toMatch(/\d+\s*(€|EUR)/)
    expect(a.text).toMatch(/unverbindlich und kostenfrei/)
  })

  it('nennt auch bei der Kostenfrage, wer über den Anspruch entscheidet', () => {
    expect(beantworte('Was kostet das?', lage()).text)
      .toMatch(/Pflegekasse, nicht wir/i)
  })
})

describe('Was muss ich noch machen?', () => {
  it('nennt nur die offenen Schritte', () => {
    const fertig = Object.fromEntries(
      SCHRITTFOLGEN.kunde.slice(0, 3).map(s => [s.schluessel, { status: 'fertig', daten: {}, zeitpunkt: 'x' }]),
    )
    const a = beantworte('Was muss ich noch machen?', lage({ schritteDaten: fertig }))
    expect(a.quelle).toBe('stand')
    // Erledigte tauchen nicht auf.
    for (const s of SCHRITTFOLGEN.kunde.slice(0, 3)) {
      expect(a.text).not.toContain(s.titel)
    }
    expect(a.text).toContain(SCHRITTFOLGEN.kunde[3].titel)
  })

  it('trennt Pflicht von Freiwillig', () => {
    const a = beantworte('Was fehlt noch?', lage())
    expect(a.text).toMatch(/brauchen wir noch/)
    expect(a.text).toMatch(/Freiwillig/)
  })

  it('nennt einzelne fehlende Angaben beim Namen', () => {
    const a = beantworte('Was fehlt?', lage({ fehlendeAngaben: ['telefon', 'plz'] }))
    expect(a.text).toContain('Telefonnummer')
    expect(a.text).toContain('Postleitzahl')
  })

  it('bietet den nächsten Pflichtschritt als Sprung an', () => {
    const a = beantworte('Wie weit bin ich?', lage())
    const sprung = a.aktionen.find(x => x.art === 'gehe_zu_schritt')
    expect(sprung).toBeDefined()
    if (sprung?.art === 'gehe_zu_schritt') expect(sprung.schritt).toBe(1)
  })

  it('meldet einen abgeschlossenen Ablauf als fertig', () => {
    const a = beantworte('Was muss ich noch machen?', lage({ abgeschlossenAm: '2026-09-20T10:00:00Z' }))
    expect(a.text).toMatch(/durch|abgeschickt/)
    expect(a.aktionen.some(x => x.art === 'gehe_zu_schritt')).toBe(false)
  })
})

describe('Leistung direkt auswählen', () => {
  it('erkennt die Leistung aus der Alltagssprache', () => {
    expect(leistungAusFrage('Ich möchte Hilfe beim Einkaufen')?.wert).toBe('einkaufsservice')
    expect(leistungAusFrage('Wer hilft beim Putzen?')?.wert).toBe('hauswirtschaft')
    expect(leistungAusFrage('Begleitung zum Arzt')?.wert).toBe('begleitservice')
    expect(leistungAusFrage('Meine Mutter hat Demenz')?.wert).toBe('demenzbetreuung')
  })

  it('bietet sie als Aktion mit kanonischem Schlüssel an', () => {
    const a = beantworte('Ich möchte Hilfe beim Einkaufen', lage())
    const wahl = a.aktionen.find(x => x.art === 'waehle_leistung')
    expect(wahl).toBeDefined()
    if (wahl?.art === 'waehle_leistung') expect(wahl.wert).toBe('einkaufsservice')
  })

  it('verweist Bewerbende auf den richtigen Ablauf', () => {
    const a = beantworte('Ich möchte Hilfe beim Einkaufen', lage({ typ: 'bewerber' }))
    expect(a.aktionen.some(x => x.art === 'oeffne_ablauf')).toBe(true)
  })

  it('rät nichts, wenn die Leistung unklar bleibt', () => {
    expect(leistungAusFrage('Ich brauche Unterstützung bei irgendwas')).toBeNull()
  })
})

describe('Als Engel bewerben', () => {
  it('öffnet den Bewerberablauf', () => {
    const a = beantworte('Ich möchte mich als Engel bewerben', lage())
    const oeffnen = a.aktionen.find(x => x.art === 'oeffne_ablauf')
    expect(oeffnen).toBeDefined()
    if (oeffnen?.art === 'oeffne_ablauf') expect(oeffnen.typ).toBe('bewerber')
  })

  it('sagt Bewerbenden, dass sie schon drin sind', () => {
    const a = beantworte('Wie bewerbe ich mich?', lage({ typ: 'bewerber' }))
    expect(a.text).toMatch(/bereits in der Bewerbung/)
  })

  it('verspricht keine Einstellung', () => {
    expect(text('Ich möchte mich als Engel bewerben'))
      .not.toMatch(/Sie werden eingestellt|garantiert|sicher genommen/i)
  })
})

describe('Hilfsfunktionen', () => {
  it('offeneSchritte zählt nur, was nicht fertig ist', () => {
    const fertig = { [SCHRITTFOLGEN.kunde[0].schluessel]: { status: 'fertig' as const, daten: {}, zeitpunkt: 'x' } }
    expect(offeneSchritte(lage({ schritteDaten: fertig })))
      .toHaveLength(SCHRITTFOLGEN.kunde.length - 1)
  })

  it('Vorschläge passen zum Ablauf', () => {
    expect(vorschlaege(lage({ typ: 'kunde' }))).toContain('Ich finde meinen Pflegegrad nicht')
    expect(vorschlaege(lage({ typ: 'bewerber' })).join(' ')).toMatch(/Unterlagen/)
  })

  it('jede Antwort bietet den Weg zu einem Menschen an', () => {
    for (const frage of ['Was muss ich noch machen?', 'Was kostet das?', 'Unsinn xyz',
      'Ich finde meinen Pflegegrad nicht', 'Wie lange dauert das?']) {
      expect(beantworte(frage, lage()).aktionen.some(x => x.art === 'mensch')).toBe(true)
    }
  })
})
