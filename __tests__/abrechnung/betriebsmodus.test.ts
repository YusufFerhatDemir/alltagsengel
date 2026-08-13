// ═══════════════════════════════════════════════════════════════
// Betriebsmodus — der Umschalter zwischen Test- und Echtabrechnung
// ═══════════════════════════════════════════════════════════════
// Der Dateiindikator im UNB-Segment entscheidet, ob eine Datei bei der Kasse
// folgenlos verarbeitet wird ('0') oder eine Forderung auslöst ('2'). Bis
// Stream 2 stand die '2' hartkodiert im Export — jede erzeugte Datei behauptete
// Echtabrechnung, auch vor jeder abgesprochenen Testübertragung.
//
// Geprüft wird hier die Regel, nicht die Datenbank: pruefeUmschaltung() ist die
// Stelle, an der ein Fehler eine echte Forderung bei einem Kostenträger
// auslöst.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import {
  pruefeUmschaltung, DATEIINDIKATOR, BESTAETIGUNG_ECHTBETRIEB,
  KANAL_FREIGABE, BETRIEBS_KANAELE, KANAL_LABEL,
} from '@/lib/abrechnung/betriebsmodus'

const VOLLSTAENDIG = {
  kanal: 'sftp_105' as const,
  zielModus: 'produktion' as const,
  begruendung: 'Testübertragung mit DAVASO am 01.09. bestanden',
  bestaetigung: BESTAETIGUNG_ECHTBETRIEB,
  testuebertragungAm: '2026-09-01',
  testuebertragungReferenz: 'DAVASO-Ticket 4711',
}

describe('Dateiindikator', () => {
  it('bildet Testbetrieb auf 0 und Echtbetrieb auf 2 ab', () => {
    expect(DATEIINDIKATOR.test).toBe('0')
    expect(DATEIINDIKATOR.produktion).toBe('2')
  })
})

describe('Kanalkatalog', () => {
  it('kennt für jeden Kanal ein Env-Gate und eine Bezeichnung', () => {
    for (const kanal of BETRIEBS_KANAELE) {
      expect(KANAL_FREIGABE[kanal], `${kanal} ohne Gate`).toBeDefined()
      expect(KANAL_LABEL[kanal], `${kanal} ohne Label`).toBeTruthy()
    }
  })

  it('ordnet jedem Kanal sein eigenes Gate zu — kein gemeinsames', () => {
    const gates = BETRIEBS_KANAELE.map(k => KANAL_FREIGABE[k])
    expect(new Set(gates).size).toBe(BETRIEBS_KANAELE.length)
  })
})

describe('Umschalten auf Echtbetrieb', () => {
  it('lässt eine vollständige, belegte Umschaltung zu', () => {
    expect(pruefeUmschaltung(VOLLSTAENDIG, true)).toBeNull()
  })

  it('verweigert Echtbetrieb bei geschlossenem Env-Gate', () => {
    const problem = pruefeUmschaltung(VOLLSTAENDIG, false)
    expect(problem).toContain('ITSG_ZERTIFIZIERT')
  })

  it('verlangt das Bestätigungswort', () => {
    expect(pruefeUmschaltung({ ...VOLLSTAENDIG, bestaetigung: undefined }, true))
      .toContain(BESTAETIGUNG_ECHTBETRIEB)
    expect(pruefeUmschaltung({ ...VOLLSTAENDIG, bestaetigung: 'echtbetrieb' }, true))
      .toContain(BESTAETIGUNG_ECHTBETRIEB)
  })

  it('verlangt eine Begründung', () => {
    expect(pruefeUmschaltung({ ...VOLLSTAENDIG, begruendung: '   ' }, true))
      .toContain('Begründung')
  })

  it('verlangt ein Datum der Testübertragung im Format JJJJ-MM-TT', () => {
    expect(pruefeUmschaltung({ ...VOLLSTAENDIG, testuebertragungAm: undefined }, true))
      .toContain('Testübertragung')
    expect(pruefeUmschaltung({ ...VOLLSTAENDIG, testuebertragungAm: '01.09.2026' }, true))
      .toContain('JJJJ-MM-TT')
  })

  it('verlangt einen Beleg — ein Datum allein ist eine Behauptung', () => {
    expect(pruefeUmschaltung({ ...VOLLSTAENDIG, testuebertragungReferenz: '  ' }, true))
      .toContain('Beleg')
  })

  it('prüft das Gate des jeweiligen Kanals, nicht pauschal', () => {
    const kim = { ...VOLLSTAENDIG, kanal: 'kim' as const }
    expect(pruefeUmschaltung(kim, false)).toContain('KIM_AKTIV')

    const sgbV = { ...VOLLSTAENDIG, kanal: 'sftp_302' as const }
    expect(pruefeUmschaltung(sgbV, false)).toContain('SGB_V_302_FREIGABE')
  })
})

describe('Rückweg in den Testbetrieb', () => {
  it('ist auch bei geschlossenem Gate erlaubt', () => {
    expect(pruefeUmschaltung(
      { kanal: 'sftp_105', zielModus: 'test', begruendung: 'Fehlersuche' },
      false,
    )).toBeNull()
  })

  it('braucht weder Bestätigungswort noch Testbeleg', () => {
    expect(pruefeUmschaltung(
      { kanal: 'kim', zielModus: 'test', begruendung: 'Provider wechselt' },
      true,
    )).toBeNull()
  })

  it('braucht trotzdem eine Begründung', () => {
    expect(pruefeUmschaltung(
      { kanal: 'sftp_105', zielModus: 'test', begruendung: '' },
      true,
    )).toContain('Begründung')
  })
})
