// ═══════════════════════════════════════════════════════════════════════
// EDIFACT-Validator — die letzte Prüfung, bevor eine Forderung an die
// Kasse geht (lib/abrechnung/edifact-validator.ts)
//
// Bis hierher gab es zu diesem Modul KEINEN Verhaltenstest: die einzige
// Erwähnung in der Testsuite war ein Quelltext-Grep in
// __tests__/security/p0-gegenpruefung-fixes.test.ts. Ein Grep sieht, DASS
// eine Prüfung im Code steht — nicht, ob sie das Richtige durchlässt.
//
// Was hier bewacht wird, ist genau die Klasse von Fehlern, die bei der
// Datenannahmestelle zu einer Absetzung führt und die im System selbst
// wie ein erfolgreicher Versand aussieht:
//
//   · falsche IK-Prüfziffer (Absender, Kostenträger, Pflegekasse)
//   · Zähler-Abweichungen (UNZ ↔ UNH, UNT ↔ Segmentzahl)
//   · Beträge, die sich nicht summieren (ELS ↔ IAF ↔ GES)
//   · Testdatei-Indikator, der eine Echtabrechnung entwertet
//   · doppelte Belegnummern in derselben Nachricht
//
// Alle Prüflinge sind rein — kein Mock, keine DB.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  validateIK,
  validateVersichertennummer,
  parseSegmente,
  validateEDIFACT,
} from '@/lib/abrechnung/edifact-validator'

// ---------------------------------------------------------------------------
// IK-Prüfziffer (§ 293 SGB V)
// ---------------------------------------------------------------------------

describe('validateIK — Prüfziffer nach ARGE-IK', () => {
  it('akzeptiert die eigene IK aus dem Modulkopf (460629986)', () => {
    expect(validateIK('460629986')).toBe(true)
  })

  it('lehnt dieselbe IK mit veränderter Prüfziffer ab', () => {
    // Genau eine Stelle geändert — das ist der Tippfehler-Fall, der ohne
    // Prüfziffer unbemerkt durchginge.
    for (const falsch of ['460629980', '460629981', '460629985', '460629987']) {
      expect(validateIK(falsch)).toBe(false)
    }
  })

  it('erkennt einen Zifferndreher in der prüfziffernrelevanten Mitte', () => {
    // Stellen 3–8 gehen in die Berechnung ein: 06299 8 → 06929 8.
    expect(validateIK('460629986')).toBe(true)
    expect(validateIK('460692986')).toBe(false)
  })

  it('verlangt exakt 9 Ziffern — nichts Kürzeres, Längeres, Nicht-Numerisches', () => {
    expect(validateIK('46062998')).toBe(false)   // 8 Stellen
    expect(validateIK('4606299866')).toBe(false) // 10 Stellen
    expect(validateIK('46062998X')).toBe(false)
    expect(validateIK('')).toBe(false)
    expect(validateIK(' 460629986')).toBe(false)
  })

  it('rechnet die Verdopplung mit Quersumme (Produkt > 9 minus 9)', () => {
    // Konstruiert: Stellen 3–8 = "600000". Die erste geht doppelt ein:
    // 6×2 = 12 → Quersumme 3 → Prüfziffer 3. OHNE die "−9"-Regel käme 12
    // heraus und damit Prüfziffer 2 — genau diese Verwechslung fängt der
    // zweite Fall ab.
    expect(validateIK('126000003')).toBe(true)
    expect(validateIK('126000002')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Krankenversichertennummer
// ---------------------------------------------------------------------------

describe('validateVersichertennummer — KVNR-Format und Prüfziffer', () => {
  /** Rechnet die Prüfziffer so, wie die eGK-Spezifikation sie definiert. */
  function kvnrMitPruefziffer(buchstabe: string, achtZiffern: string): string {
    const kette = String(buchstabe.charCodeAt(0) - 64).padStart(2, '0') + achtZiffern
    let summe = 0
    for (let i = 0; i < 10; i++) {
      let produkt = Number(kette[i]) * (i % 2 === 0 ? 1 : 2)
      if (produkt > 9) produkt -= 9
      summe += produkt
    }
    return `${buchstabe}${achtZiffern}${summe % 10}`
  }

  it('akzeptiert korrekt gebildete Nummern', () => {
    for (const [b, z] of [['A', '12345678'], ['Z', '00000001'], ['M', '98765432']] as const) {
      expect(validateVersichertennummer(kvnrMitPruefziffer(b, z))).toBe(true)
    }
  })

  it('lehnt eine Nummer mit falscher Prüfziffer ab', () => {
    const gut = kvnrMitPruefziffer('A', '12345678')
    const letzte = Number(gut[9])
    const schlecht = gut.slice(0, 9) + String((letzte + 1) % 10)
    expect(validateVersichertennummer(schlecht)).toBe(false)
  })

  it('verlangt Großbuchstabe + 9 Ziffern', () => {
    expect(validateVersichertennummer('a123456789')).toBe(false) // klein
    expect(validateVersichertennummer('1123456789')).toBe(false) // Ziffer vorn
    expect(validateVersichertennummer('A12345678')).toBe(false)  // zu kurz
    expect(validateVersichertennummer('A1234567890')).toBe(false) // zu lang
    expect(validateVersichertennummer('')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

describe('parseSegmente — Zerlegung inkl. Freigabezeichen', () => {
  it('trennt Segmente an "\'" und Felder an "+"', () => {
    expect(parseSegmente("ABC+1+2'DEF+3'")).toEqual([['ABC', '1', '2'], ['DEF', '3']])
  })

  it('überspringt das UNA-Segment (feste Länge 9)', () => {
    const segmente = parseSegmente("UNA:+.? 'UNB+UNOC:3'")
    expect(segmente[0][0]).toBe('UNB')
  })

  it('nimmt das Zeichen nach "?" wörtlich — es trennt dort nicht', () => {
    // Ein "+" im Namen darf kein neues Feld aufmachen.
    const segmente = parseSegmente("NAD+Meier?+Sohn+Anna'")
    expect(segmente).toEqual([['NAD', 'Meier+Sohn', 'Anna']])
  })

  it('behandelt ein maskiertes Segmentende als Inhalt', () => {
    const segmente = parseSegmente("TXT+heute?'s Termin'NXT+1'")
    expect(segmente[0]).toEqual(['TXT', "heute's Termin"])
    expect(segmente[1][0]).toBe('NXT')
  })

  it('ignoriert Zeilenumbrüche in der Datei', () => {
    expect(parseSegmente("ABC+1'\r\nDEF+2'\n")).toEqual([['ABC', '1'], ['DEF', '2']])
  })

  it('liefert für leeren Inhalt eine leere Liste', () => {
    expect(parseSegmente('')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Gesamtprüfung
// ---------------------------------------------------------------------------

const IK_ABSENDER = '460629986'
const IK_KASSE = '181000002'          // Pflegekassen-IK, beginnt mit 18
const IK_KOSTENTRAEGER = '180000000'  // bewusst anders als IK_KASSE, damit
                                      // die Negativfälle unten genau EIN Feld treffen

/** Kleinste Datei, die durchgeht — Grundlage aller Negativfälle. */
function datei(aenderungen: Partial<{
  indikator: string
  unzAnzahl: string
  unzRef: string
  untAnzahl: string
  gesRechnungsbetrag: string
  iafRechnungsbetrag: string
  iafBrutto: string
  elsPreis: string
  elsAnzahl: string
  zweiterFallBelegnummer: string
}> = {}): string {
  const a = {
    indikator: '2',
    unzAnzahl: '2',
    unzRef: '12345',
    untAnzahl: '',
    gesRechnungsbetrag: '100,00',
    iafRechnungsbetrag: '100,00',
    iafBrutto: '100,00',
    elsPreis: '50,00',
    elsAnzahl: '2,00',
    zweiterFallBelegnummer: '',
    ...aenderungen,
  }

  const plga = [
    "UNH+1+PLGA:2:0:0",
    `FKT+10++${IK_ABSENDER}+${IK_KOSTENTRAEGER}+${IK_KASSE}+${IK_ABSENDER}`,
    'REC+RE-2026-0001+20260731+1+EUR',
    'SRD+31:ABCDE+01',
    `GES+100,00+0,00+0,00+${a.gesRechnungsbetrag}`,
    'NAM+Alltagsengel',
  ]
  const plgaMitUnt = [...plga, `UNT+${a.untAnzahl || String(plga.length + 1)}+1`]

  const zweiterFall = a.zweiterFallBelegnummer
    ? [
      `INV+A123456780+${a.zweiterFallBelegnummer}`,
      'NAD+Meier+Anna+19500101',
      'MAN+202607+++3',
      'ESK+05+0800',
      'ELS+01:01:1:0101+0,00++++1,00+123456789',
      'IAF+0,00+0,00+0,00+0,00',
    ]
    : []

  const plaa = [
    'UNH+2+PLAA:2:0:0',
    `FKT+10++${IK_ABSENDER}+${IK_KOSTENTRAEGER}+${IK_KASSE}+${IK_ABSENDER}`,
    'REC+RE-2026-0001+20260731+1+EUR',
    'INV+A123456780+BELEG-1',
    'NAD+Meier+Anna+19500101',
    'MAN+202607+++3',
    'ESK+05+0800',
    `ELS+01:01:1:0101+${a.elsPreis}++++${a.elsAnzahl}+123456789`,
    `IAF+${a.iafBrutto}+0,00+0,00+${a.iafRechnungsbetrag}`,
    ...zweiterFall,
  ]
  const plaaMitUnt = [...plaa, `UNT+${plaa.length + 1}+2`]

  return [
    `UNB+UNOC:3+${IK_ABSENDER}+${IK_KOSTENTRAEGER}+20260731:1200+12345++PFL00000001+${a.indikator}`,
    ...plgaMitUnt,
    ...plaaMitUnt,
    `UNZ+${a.unzAnzahl}+${a.unzRef}`,
  ].join("'") + "'"
}

/** Alle Fehlermeldungen als ein Text — für gezielte Treffer-Prüfung. */
const fehlertext = (edifact: string) =>
  validateEDIFACT(edifact).fehler.map(f => f.meldung).join('\n')

describe('validateEDIFACT — die Referenzdatei ist fehlerfrei', () => {
  it('meldet keinen Fehler für die vollständige Datei', () => {
    const ergebnis = validateEDIFACT(datei())
    expect(ergebnis.fehler.map(f => `${f.segment}: ${f.meldung}`)).toEqual([])
    expect(ergebnis.ok).toBe(true)
  })

  it('meldet für die Echtdatei (Indikator 2) auch keine Testdatei-Warnung', () => {
    const warnungen = validateEDIFACT(datei()).warnungen.map(w => w.meldung)
    expect(warnungen.join('\n')).not.toMatch(/TESTDATEI/)
  })
})

describe('validateEDIFACT — Prüfstufe 1: Dateistruktur', () => {
  it('leere Datei ist ein Fehler, kein stilles OK', () => {
    const ergebnis = validateEDIFACT('')
    expect(ergebnis.ok).toBe(false)
    expect(ergebnis.fehler[0].meldung).toMatch(/leer|nicht parsebar/i)
  })

  it('UNZ-Nachrichtenzähler muss zur Zahl der UNH passen', () => {
    // Der Klassiker: eine Nachricht entfernt, Zähler vergessen.
    expect(fehlertext(datei({ unzAnzahl: '3' }))).toMatch(/UNZ: Anzahl Nachrichten 3 ≠ tatsächliche UNH-Anzahl 2/)
  })

  it('UNZ-Datenaustauschreferenz muss der aus UNB entsprechen', () => {
    expect(fehlertext(datei({ unzRef: '99999' }))).toMatch(/Datenaustauschreferenz "99999" ≠ UNB "12345"/)
  })

  it('UNT-Segmentzähler muss die tatsächliche Segmentzahl treffen', () => {
    expect(fehlertext(datei({ untAnzahl: '99' }))).toMatch(/Segmentanzahl 99 ≠ tatsächlich 7/)
  })

  it('Datei ohne UNB/UNZ wird an beiden Enden beanstandet', () => {
    const text = fehlertext("UNH+1+PLGA:2:0:0'UNT+2+1'")
    expect(text).toMatch(/muss mit UNB beginnen/)
    expect(text).toMatch(/muss mit UNZ enden/)
  })
})

describe('validateEDIFACT — Prüfstufe 3: IK-Prüfziffern im Kopf', () => {
  it('beanstandet einen ungültigen Absender-IK im UNB', () => {
    const kaputt = datei().replace(`UNB+UNOC:3+${IK_ABSENDER}`, 'UNB+UNOC:3+460629980')
    expect(fehlertext(kaputt)).toMatch(/Absender-IK "460629980" ungültig/)
  })

  it('beanstandet einen ungültigen Kostenträger-IK im FKT', () => {
    const kaputt = datei().replace(`+${IK_KOSTENTRAEGER}+${IK_KASSE}+`, `+180000009+${IK_KASSE}+`)
    expect(fehlertext(kaputt)).toMatch(/FKT: IK Kostenträger "180000009" ungültig/)
  })

  it('warnt, wenn die Pflegekassen-IK nicht mit 18 beginnt', () => {
    // Absender-IK (460629986) als Pflegekassen-IK: Prüfziffer stimmt,
    // aber das "18"-Präfix fehlt — genau der Warnfall.
    const kaputt = datei().split(`+${IK_KASSE}+`).join(`+${IK_ABSENDER}+`)
    const warnungen = validateEDIFACT(kaputt).warnungen.map(w => w.meldung).join('\n')
    expect(warnungen).toMatch(/beginnt nicht mit "18"/)
  })
})

describe('validateEDIFACT — Prüfstufe 3: Beträge müssen sich summieren', () => {
  it('IAF-Brutto muss der Summe der Einzelleistungen entsprechen', () => {
    // 50,00 × 2 = 100,00 — hier steht 120,00 im IAF.
    const text = fehlertext(datei({ iafBrutto: '120,00' }))
    expect(text).toMatch(/Bruttobetrag 120\.00 € ≠ Summe der Einzelleistungen 100\.00 €/)
  })

  it('rechnet Einzelpreis × Anzahl korrekt (nicht Preis + Anzahl)', () => {
    // 25,00 × 4,00 = 100,00 — muss weiterhin durchgehen.
    expect(validateEDIFACT(datei({ elsPreis: '25,00', elsAnzahl: '4,00' })).ok).toBe(true)
  })

  it('erlaubt eine Rundungsdifferenz von 1 Cent, aber nicht 2', () => {
    expect(validateEDIFACT(datei({ iafBrutto: '100,01' })).ok).toBe(true)
    expect(validateEDIFACT(datei({ iafBrutto: '100,02' })).ok).toBe(false)
  })

  it('gleicht Σ GES gegen Σ IAF ab — der Abgleich über die ganze Datei', () => {
    const text = fehlertext(datei({ gesRechnungsbetrag: '250,00' }))
    expect(text).toMatch(/Summenabgleich: Σ GES-Gesamtrechnungsbeträge 250\.00 € ≠ Σ IAF-Rechnungsbeträge 100\.00 €/)
  })

  it('lehnt einen Betrag mit Punkt statt Komma ab (Formatfalle)', () => {
    const kaputt = datei().replace('IAF+100,00', 'IAF+100.00')
    expect(fehlertext(kaputt)).toMatch(/Gesamtbruttobetrag "100\.00" ungültig/)
  })
})

describe('validateEDIFACT — Fallstruktur INV..IAF', () => {
  it('meldet eine doppelt vergebene Belegnummer', () => {
    expect(fehlertext(datei({ zweiterFallBelegnummer: 'BELEG-1' })))
      .toMatch(/Belegnummer "BELEG-1" doppelt vergeben/)
  })

  it('akzeptiert einen zweiten Fall mit eigener Belegnummer', () => {
    expect(validateEDIFACT(datei({ zweiterFallBelegnummer: 'BELEG-2' })).ok).toBe(true)
  })

  it('meldet einen Fall ohne abschließendes IAF', () => {
    const kaputt = datei().replace("IAF+100,00+0,00+0,00+100,00'", '')
    const text = fehlertext(kaputt)
    expect(text).toMatch(/ohne IAF-Endesegment/)
  })

  it('meldet ein IAF ohne vorheriges INV', () => {
    const kaputt = datei().replace("INV+A123456780+BELEG-1'", '')
    expect(fehlertext(kaputt)).toMatch(/IAF ohne vorheriges INV/)
  })

  it('meldet einen Pflegegrad außerhalb 1–5', () => {
    expect(fehlertext(datei().replace('MAN+202607+++3', 'MAN+202607+++6')))
      .toMatch(/Pflegegrad "6" ungültig/)
  })

  it('meldet einen unbekannten Leistungsschlüssel im ELS', () => {
    expect(fehlertext(datei().replace('ELS+01:01:1:0101', 'ELS+99:01:1:0101')))
      .toMatch(/Art der Leistung "99" nicht im Schlüsselverzeichnis/)
  })
})

describe('validateEDIFACT — Testdatei-Indikator', () => {
  it('warnt bei Indikator 0, ohne die Datei als fehlerhaft zu werten', () => {
    const ergebnis = validateEDIFACT(datei({ indikator: '0' }))
    expect(ergebnis.warnungen.map(w => w.meldung).join('\n')).toMatch(/TESTDATEI/)
    expect(ergebnis.ok).toBe(true)
  })

  it('lehnt einen Indikator außerhalb 0/1/2 ab', () => {
    expect(fehlertext(datei({ indikator: '9' }))).toMatch(/Dateiindikator "9" ungültig/)
  })
})
