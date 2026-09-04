/**
 * Onboarding — Schrittfolgen, Erinnerungsregeln und Vorlagen
 *
 * Alles rein rechnend, deshalb ohne Datenbank testbar. Der Schwerpunkt
 * liegt auf den Stellen, an denen ein Fehler einen echten Menschen
 * trifft: eine Erinnerung zu viel, eine falsche Anrede, ein
 * Fortschrittsbalken, der etwas anderes behauptet als der Ablauf.
 */

import { describe, it, expect } from 'vitest'
import {
  ONBOARDING_TYPEN, SCHRITTFOLGEN, gesamtSchritte, schrittNummer, schrittfolge,
  UnbekannterOnboardingTypError, istOnboardingTyp,
} from '@/lib/onboarding/schritte'
import {
  pruefeErinnerung, wirkungVon, tageSeit,
  KARENZ_TAGE, ABSTAND_TAGE, MAX_ERINNERUNGEN,
  type ErinnerungsLage,
} from '@/lib/onboarding/triggers'
import { anrede, baueNachricht, alleVorlagen, GRUSS } from '@/lib/onboarding/notifications'

const JETZT = new Date('2026-09-20T10:00:00Z')
const vorTagen = (n: number) => new Date(JETZT.getTime() - n * 86_400_000).toISOString()

describe('Schrittfolgen', () => {
  it('jede Ablaufart hat mindestens einen Schritt', () => {
    for (const typ of ONBOARDING_TYPEN) {
      expect(gesamtSchritte(typ)).toBeGreaterThan(0)
    }
  })

  it('Schluessel sind je Ablauf eindeutig', () => {
    // Ein doppelter Schluessel wuerde zwei Schritte auf dieselbe Zeile in
    // schritte_daten schreiben — der zweite ueberschriebe den ersten.
    for (const typ of ONBOARDING_TYPEN) {
      const schluessel = SCHRITTFOLGEN[typ].map(s => s.schluessel)
      expect(new Set(schluessel).size).toBe(schluessel.length)
    }
  })

  it('jeder Ablauf beginnt mit einem Pflichtschritt', () => {
    // Waere der erste Schritt ueberspringbar, koennte jemand einen
    // vollstaendig leeren Ablauf abschliessen.
    for (const typ of ONBOARDING_TYPEN) {
      expect(SCHRITTFOLGEN[typ][0].ueberspringbar).toBe(false)
    }
  })

  it('jeder Schritt hat Titel und Hinweis', () => {
    for (const typ of ONBOARDING_TYPEN) {
      for (const s of SCHRITTFOLGEN[typ]) {
        expect(s.titel.length).toBeGreaterThan(0)
        expect(s.hinweis.length).toBeGreaterThan(0)
      }
    }
  })

  it('nur Formularschritte erwarten Angaben', () => {
    // Begruessung, Zusammenfassung und Absenden sammeln nichts. Ohne die
    // Unterscheidung muessten sie eine Angabe erfinden, damit dieser Test
    // gruen bleibt — und die Pruefung im Wizard liefe ins Leere.
    for (const typ of ONBOARDING_TYPEN) {
      for (const s of SCHRITTFOLGEN[typ]) {
        if (s.art === 'formular') {
          expect(s.erwarteteAngaben.length).toBeGreaterThan(0)
        } else {
          expect(s.erwarteteAngaben).toEqual([])
        }
      }
    }
  })

  it('der Bewerberablauf hat die zwölf vereinbarten Schritte', () => {
    expect(SCHRITTFOLGEN.bewerber.map(s => s.schluessel)).toEqual([
      'willkommen', 'kontakt', 'einsatzgebiet', 'erfahrung', 'fuehrerschein',
      'sprachen', 'verfuegbarkeit', 'stundenumfang', 'fuehrungszeugnis',
      'unterlagen', 'zusammenfassung', 'absenden',
    ])
  })

  it('verlangt beim Führungszeugnis die Auskunft, nicht das Dokument', () => {
    // „Beantrage ich noch" ist eine gueltige Antwort und darf niemanden
    // aufhalten — sonst bricht der Ablauf genau dort ab, wo die meisten
    // Bewerbungen ohnehin warten muessen.
    const s = SCHRITTFOLGEN.bewerber.find(x => x.schluessel === 'fuehrungszeugnis')
    expect(s?.erwarteteAngaben).toEqual(['fuehrungszeugnis_status'])
  })

  it('macht ein Fahrzeug nicht zur Pflichtangabe', () => {
    // Wer „kein Führerschein" antwortet, hat den Schritt vollstaendig
    // beantwortet und wird nicht nach einem Fahrzeug gefragt.
    const s = SCHRITTFOLGEN.bewerber.find(x => x.schluessel === 'fuehrerschein')
    expect(s?.erwarteteAngaben).toEqual(['fuehrerschein'])
  })

  it('fragt im Kundenablauf keine Zahlungsdaten ab', () => {
    // Bewusste Zusage: die Abrechnung entscheidet sich erst, wenn
    // Pflegegrad und Kostentraeger feststehen.
    const alle = SCHRITTFOLGEN.kunde.flatMap(s => s.erwarteteAngaben).join(' ')
    expect(alle).not.toMatch(/iban|bic|konto|kreditkarte|bank/i)
  })

  it('ist fail-closed bei unbekannter Ablaufart', () => {
    expect(() => schrittfolge('engel')).toThrow(UnbekannterOnboardingTypError)
    expect(istOnboardingTyp('engel')).toBe(false)
  })

  it('wirft bei einer Schrittnummer ausserhalb der Folge', () => {
    // Sonst rendert der Wizard eine leere Maske.
    expect(() => schrittNummer('kunde', 0)).toThrow(RangeError)
    expect(() => schrittNummer('kunde', 99)).toThrow(RangeError)
    expect(schrittNummer('kunde', 1).schluessel).toBe('kontakt')
  })
})

describe('tageSeit', () => {
  it('rechnet ganze Tage', () => {
    expect(tageSeit(vorTagen(3), JETZT)).toBe(3)
    expect(tageSeit(JETZT.toISOString(), JETZT)).toBe(0)
  })

  it('behandelt null und Unsinn als unendlich lange her', () => {
    // Damit ein fehlender Zeitpunkt eine Erinnerung nicht blockiert.
    expect(tageSeit(null, JETZT)).toBe(Number.POSITIVE_INFINITY)
    expect(tageSeit('kein-datum', JETZT)).toBe(Number.POSITIVE_INFINITY)
  })

  it('wird bei Zeitpunkten in der Zukunft nicht negativ', () => {
    expect(tageSeit(new Date(JETZT.getTime() + 86_400_000).toISOString(), JETZT)).toBe(0)
  })
})

describe('Erinnerung — wann NICHT', () => {
  const lage = (ueber: Partial<ErinnerungsLage> = {}): ErinnerungsLage => ({
    typ: 'kunde',
    aktuellerSchritt: 2,
    gesamtSchritte: 5,
    fehlendeAngaben: [],
    createdAt: vorTagen(10),
    updatedAt: vorTagen(10),
    letzteAutoNachricht: null,
    abgeschlossenAm: null,
    bisherigeErinnerungen: 0,
    ...ueber,
  })

  it('nicht bei abgeschlossenem Ablauf', () => {
    const e = pruefeErinnerung(lage({ abgeschlossenAm: vorTagen(1) }), JETZT)
    expect(e.faellig).toBe(false)
    expect(e.begruendung).toMatch(/abgeschlossen/)
  })

  it('nicht nach der Hoechstzahl', () => {
    // Wer dreimal nicht reagiert hat, moechte nicht reagieren.
    const e = pruefeErinnerung(lage({ bisherigeErinnerungen: MAX_ERINNERUNGEN }), JETZT)
    expect(e.faellig).toBe(false)
    expect(e.begruendung).toMatch(/Hoechstzahl/)
  })

  it('nicht waehrend der Karenzzeit', () => {
    const e = pruefeErinnerung(lage({ updatedAt: vorTagen(KARENZ_TAGE - 1) }), JETZT)
    expect(e.faellig).toBe(false)
    expect(e.begruendung).toMatch(/Karenzzeit/)
  })

  it('nicht vor Ablauf des Mindestabstands', () => {
    const e = pruefeErinnerung(
      lage({ letzteAutoNachricht: vorTagen(ABSTAND_TAGE - 1) }), JETZT,
    )
    expect(e.faellig).toBe(false)
    expect(e.begruendung).toMatch(/Mindestabstand/)
  })

  it('nennt den grundsaetzlicheren Grund zuerst', () => {
    // Abgeschlossen UND zu viele Erinnerungen: die Begruendung soll die
    // eigentliche Ursache nennen, nicht die zufaellig erste Pruefung.
    const e = pruefeErinnerung(
      lage({ abgeschlossenAm: vorTagen(1), bisherigeErinnerungen: 9 }), JETZT,
    )
    expect(e.begruendung).toMatch(/abgeschlossen/)
  })
})

describe('Erinnerung — wann doch', () => {
  const offen: ErinnerungsLage = {
    typ: 'bewerber',
    aktuellerSchritt: 3,
    gesamtSchritte: 5,
    fehlendeAngaben: [],
    createdAt: vorTagen(10),
    updatedAt: vorTagen(6),
    letzteAutoNachricht: null,
    abgeschlossenAm: null,
    bisherigeErinnerungen: 0,
  }

  it('erinnert bei laengerer Untaetigkeit', () => {
    const e = pruefeErinnerung(offen, JETZT)
    expect(e.faellig).toBe(true)
    expect(e.anlass).toBe('erinnerung')
    expect(e.begruendung).toMatch(/Schritt 3 von 5/)
  })

  it('waehlt den Unterlagen-Anlass, wenn konkrete Angaben fehlen', () => {
    const e = pruefeErinnerung({ ...offen, fehlendeAngaben: ['fuehrungszeugnis'] }, JETZT)
    expect(e.faellig).toBe(true)
    expect(e.anlass).toBe('unterlagen')
  })

  it('erinnert genau am Mindestabstand wieder', () => {
    const e = pruefeErinnerung(
      { ...offen, letzteAutoNachricht: vorTagen(ABSTAND_TAGE), bisherigeErinnerungen: 1 },
      JETZT,
    )
    expect(e.faellig).toBe(true)
  })
})

describe('Ereignis-Wirkung', () => {
  it('ein gespeicherter Schritt loest KEINE Nachricht aus', () => {
    // Die Person sieht das Ergebnis gerade auf dem Bildschirm.
    expect(wirkungVon('schritt_gespeichert').nachricht).toBeNull()
  })

  it('Verlassen wird nur gemerkt, nicht beantwortet', () => {
    const w = wirkungVon('ablauf_verlassen')
    expect(w.abbruchMerken).toBe(true)
    expect(w.nachricht).toBeNull()
  })

  it('Beginn begruesst, Abschluss bestaetigt', () => {
    expect(wirkungVon('ablauf_begonnen').nachricht).toBe('begruessung')
    const w = wirkungVon('ablauf_abgeschlossen')
    expect(w.nachricht).toBe('abschluss')
    expect(w.abschliessen).toBe(true)
  })
})

describe('Anrede', () => {
  it('nutzt Frau/Herr mit Nachname', () => {
    expect(anrede({ nachname: 'Müller', anredeform: 'frau' })).toBe('Hallo Frau Müller,')
    expect(anrede({ nachname: 'Schmidt', anredeform: 'herr' })).toBe('Hallo Herr Schmidt,')
  })

  it('raet die Anredeform NICHT', () => {
    // Eine falsche Anrede ist schlimmer als eine neutrale.
    expect(anrede({ nachname: 'Weber', anredeform: null })).toBe('Hallo Weber,')
  })

  it('bleibt ohne Nachnamen neutral', () => {
    expect(anrede({})).toBe('Hallo,')
    expect(anrede({ nachname: '   ' })).toBe('Hallo,')
  })
})

describe('Nachrichtenvorlagen', () => {
  const lage = {
    typ: 'kunde' as const,
    empfaenger: { nachname: 'Müller', anredeform: 'frau' as const },
    aktuellerSchritt: 3,
    gesamtSchritte: 5,
    fehlendeAngaben: ['pflegegrad', 'telefon'],
    fortsetzenUrl: 'https://alltagsengel.example/onboarding/fortsetzen?t=abc',
  }

  it('unterschreibt IMMER als Alltagsengel — nie mit einem Personennamen', () => {
    // Namens-Policy: gilt fuer JEDE Kommunikation in Kundenrichtung.
    for (const n of Object.values(alleVorlagen(lage))) {
      expect(n.text).toContain('Ihr Team von Alltagsengel')
      expect(n.text.endsWith(GRUSS)).toBe(true)
    }
  })

  it('nennt fehlende Angaben beim Namen', () => {
    // „Es fehlen noch Angaben" zwingt die Person, erst nachzusehen.
    const n = baueNachricht('unterlagen', lage)
    expect(n.text).toContain('Pflegegrad')
    expect(n.text).toContain('Telefonnummer')
  })

  it('enthaelt in jeder handlungsbezogenen Vorlage den Fortsetzen-Link', () => {
    for (const anlass of ['begruessung', 'erinnerung', 'unterlagen'] as const) {
      expect(baueNachricht(anlass, lage).text).toContain(lage.fortsetzenUrl)
    }
  })

  it('draengt nicht und droht nicht', () => {
    const text = Object.values(alleVorlagen(lage)).map(n => n.text + ' ' + n.betreff).join(' ')
    expect(text).not.toMatch(/letzte Chance|dringend|sofort|verfällt|Frist läuft|jetzt handeln/i)
  })

  it('sagt in der Erinnerung ausdruecklich, dass nichts verloren geht', () => {
    const n = baueNachricht('erinnerung', lage)
    expect(n.text).toMatch(/gespeichert/)
    expect(n.text).toMatch(/völlig in Ordnung/)
  })

  it('bricht nicht, wenn die Schrittfolge unter dem Ablauf gekuerzt wurde', () => {
    // Fail-soft: die Nachricht kommt dann ohne den Schritt-Satz.
    const n = baueNachricht('erinnerung', { ...lage, aktuellerSchritt: 99 })
    expect(n.text).toContain('Ihr Team von Alltagsengel')
  })

  it('kommt auch ohne Namen und ohne fehlende Angaben zustande', () => {
    const n = alleVorlagen({ ...lage, empfaenger: {}, fehlendeAngaben: [] })
    expect(n.erinnerung.text.startsWith('Hallo,')).toBe(true)
    expect(n.abschluss.betreff.length).toBeGreaterThan(0)
  })
})
