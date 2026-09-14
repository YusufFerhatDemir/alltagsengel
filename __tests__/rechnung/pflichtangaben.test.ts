/**
 * Rechnung als Dokument — § 14 Abs. 4 UStG
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 48, 14.09.2026)
 *
 * Dem PDF, das der Kunde bekommt, fehlten DREI der acht Pflichtangaben:
 *
 *   Nr. 2  Steuernummer — live nicht gepflegt, und die Fusszeile liess
 *          die Zeile dann STILL weg.
 *   Nr. 3  Ausstellungsdatum — die Abfrage waehlte gar keine
 *          Datumsspalte aus; auf dem Blatt stand nur der Leistungs-
 *          ZEITRAUM, und das ist Nr. 6.
 *   Nr. 8  Steuersatz und Steuerbetrag oder Befreiungshinweis.
 *
 * Nr. 8 ist der bemerkenswerteste Fall: XRechnung, EDIFACT und der
 * DATEV-Export weisen die Befreiung nach § 4 Nr. 16 UStG seit Monaten
 * aus. Ausgerechnet das Blatt beim Kunden sagte nichts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  PFLICHTANGABEN, STEUERBEFREIUNG_HINWEIS, STEUERZEILE,
  fehlendePflichtangaben, ausstellungsdatum,
} from '@/lib/rechnung/pflichtangaben'

const VOLLSTAENDIG = {
  unternehmerAnschrift: 'Alltagsengel UG, Musterstr. 1, Frankfurt',
  empfaengerName: 'Erika Muster',
  empfaengerAnschrift: 'Beispielweg 2, 60311 Frankfurt',
  steuernummer: '013 456 78901',
  ausstellungsdatum: '2026-07-02',
  rechnungsnummer: 'RE-2026-00001',
  positionen: 3,
  leistungszeitraum: '2026-07-01',
  entgelt: 131,
  steuerangabe: STEUERZEILE,
}

describe('fehlendePflichtangaben', () => {
  it('meldet nichts bei einem vollstaendigen Beleg', () => {
    expect(fehlendePflichtangaben(VOLLSTAENDIG)).toEqual([])
  })

  it('meldet die fehlende Steuernummer (Nr. 2)', () => {
    const f = fehlendePflichtangaben({ ...VOLLSTAENDIG, steuernummer: null })
    expect(f.map(x => x.nr)).toEqual([2])
    expect(f[0].quelle).toContain('settings.steuernummer')
  })

  it('wertet den Platzhalter „—" als fehlend, nicht als Angabe', () => {
    // Genau so sah es auf dem Blatt aus: ein Gedankenstrich, wo die
    // Angabe stehen muesste.
    expect(fehlendePflichtangaben({ ...VOLLSTAENDIG, steuernummer: '—' }).map(x => x.nr)).toEqual([2])
    expect(fehlendePflichtangaben({ ...VOLLSTAENDIG, empfaengerAnschrift: '—' })).toHaveLength(1)
  })

  it('wertet Leerraum als fehlend', () => {
    expect(fehlendePflichtangaben({ ...VOLLSTAENDIG, steuernummer: '   ' }).map(x => x.nr)).toEqual([2])
  })

  it('meldet das fehlende Ausstellungsdatum (Nr. 3)', () => {
    expect(fehlendePflichtangaben({ ...VOLLSTAENDIG, ausstellungsdatum: null }).map(x => x.nr)).toEqual([3])
  })

  it('meldet die fehlende Steuerangabe (Nr. 8)', () => {
    expect(fehlendePflichtangaben({ ...VOLLSTAENDIG, steuerangabe: null }).map(x => x.nr)).toEqual([8])
  })

  it('meldet alle drei zusammen — der Stand vor diesem Block', () => {
    const f = fehlendePflichtangaben({
      ...VOLLSTAENDIG, steuernummer: null, ausstellungsdatum: null, steuerangabe: null,
    })
    expect(f.map(x => x.nr)).toEqual([2, 3, 8])
  })

  it('ein Entgelt von 0,00 EUR ist eine Angabe, kein Fehlen', () => {
    // Eine Gutschrift ueber 0 ist ungewoehnlich, aber `0` ist ein Wert.
    expect(fehlendePflichtangaben({ ...VOLLSTAENDIG, entgelt: 0 })).toEqual([])
  })

  it('ein Beleg ohne eigene Positionen ist zulaessig, solange der Zeitraum steht', () => {
    // Storno- und Gutschriftsbelege beziehen sich als Ganzes auf die
    // Originalrechnung und tragen keine eigenen Positionen.
    expect(fehlendePflichtangaben({ ...VOLLSTAENDIG, positionen: 0 })).toEqual([])
  })

  it('unterscheidet Unternehmer- und Empfaengeranschrift', () => {
    expect(fehlendePflichtangaben({ ...VOLLSTAENDIG, unternehmerAnschrift: null })).toHaveLength(1)
    expect(fehlendePflichtangaben({ ...VOLLSTAENDIG, empfaengerName: null })).toHaveLength(1)
  })
})

describe('ausstellungsdatum', () => {
  it('nimmt frozen_at — den Zeitpunkt der Festschreibung', () => {
    expect(ausstellungsdatum({ frozen_at: '2026-07-05', created_at: '2026-07-02' })).toBe('2026-07-05')
  })

  it('faellt fuer Entwuerfe auf created_at zurueck', () => {
    expect(ausstellungsdatum({ frozen_at: null, created_at: '2026-07-02' })).toBe('2026-07-02')
  })

  it('nimmt NICHT sent_at', () => {
    // `sent_at` steht live auch auf Zeilen, die nie festgeschrieben
    // wurden — es ist kein Beleg fuer eine Ausstellung.
    const quelle = readFileSync('lib/rechnung/pflichtangaben.ts', 'utf8')
    expect(quelle).toContain('`sent_at` waere falsch')
    expect(ausstellungsdatum({ frozen_at: null, created_at: null })).toBeNull()
  })
})

describe('alle vier Ausgaenge sagen dasselbe', () => {
  it('der CII-Erzeuger holt den Hinweis aus diesem Modul', () => {
    // Vorher stand er dort als eigene Konstante — und das PDF sagte gar
    // nichts. Ein Kunde, der beide Ausgaenge nebeneinanderlegt, soll
    // nicht zwei Formulierungen lesen.
    const cii = readFileSync('lib/billing/xrechnung/cii-generator.ts', 'utf8')
    expect(cii).toContain("from '@/lib/rechnung/pflichtangaben'")
    expect(cii).not.toMatch(/const VAT_EXEMPTION_REASON\s*=\s*'/)
  })

  it('die Steuerzeile enthaelt den Hinweis wortgleich', () => {
    expect(STEUERZEILE).toContain(STEUERBEFREIUNG_HINWEIS)
  })

  it('nennt die Rechtsgrundlage, nicht nur „steuerfrei"', () => {
    expect(STEUERBEFREIUNG_HINWEIS).toContain('§ 4 Nr. 16 UStG')
  })

  it('sagt, warum kein Steuerbetrag dasteht', () => {
    // „kein Steuerausweis" allein liest sich wie ein Versehen.
    expect(STEUERZEILE).toContain('kein gesonderter Steuerausweis')
  })

  it('EDIFACT und DATEV weisen dieselbe Befreiung aus', () => {
    expect(readFileSync('lib/abrechnung/edifact-generator.ts', 'utf8')).toContain('§ 4 Nr. 16 UStG')
    expect(readFileSync('lib/billing/datev/kontenrahmen.ts', 'utf8')).toMatch(/Steuerfreie Erloese Pflege/)
  })
})

describe('der Katalog', () => {
  it('fuehrt alle acht Nummern des § 14 Abs. 4 UStG', () => {
    expect([...new Set(PFLICHTANGABEN.map(p => p.nr))].sort((a, b) => a - b))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('nennt zu jeder Angabe, woher der Wert kommt', () => {
    for (const p of PFLICHTANGABEN) {
      expect(p.quelle.length, `Nr. ${p.nr}`).toBeGreaterThan(5)
    }
  })

  it('sagt ausdruecklich, dass die steuerliche Einordnung nicht hier entschieden wird', () => {
    const quelle = readFileSync('lib/rechnung/pflichtangaben.ts', 'utf8')
    expect(quelle).toContain('KEINE STEUERBERATUNG')
    expect(quelle).toContain('Anerkennungsverfahren')
  })
})

describe('das PDF benutzt beides', () => {
  const pdf = readFileSync('lib/pdf/rechnung-paket.ts', 'utf8')

  it('zeichnet die Steuerzeile', () => {
    expect(pdf).toContain('page.drawText(STEUERZEILE')
  })

  it('zeigt das Rechnungsdatum', () => {
    expect(pdf).toContain("['Rechnungsdatum:', dateFmt(rechnungsdatum)]")
  })

  it('liest die Datumsspalten ueberhaupt mit', () => {
    // Ohne sie waere das Rechnungsdatum immer leer — und der Guard
    // brechaebe bei JEDER Rechnung ab.
    expect(pdf).toMatch(/select\([^)]*frozen_at[^)]*created_at/s)
  })

  it('prueft die Pflichtangaben VOR dem Zeichnen', () => {
    // Ein bereits erzeugtes PDF laesst sich nicht zurueckholen.
    const guard = pdf.indexOf('fehlendePflichtangaben(')
    const ersteSeite = pdf.indexOf('pdfDoc.addPage(')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(ersteSeite)
  })

  it('bricht fail-closed ab und nennt die fehlende Angabe', () => {
    expect(pdf).toContain('§ 14 Abs. 4 UStG unvollständig')
    expect(pdf).toContain('Es wurde kein PDF erzeugt.')
  })
})
