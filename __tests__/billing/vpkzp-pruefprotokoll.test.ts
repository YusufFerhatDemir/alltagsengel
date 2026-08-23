/**
 * VP/KZP — Pruefprotokoll
 *
 * Geprueft wird vor allem, dass die Voreinstellung ABLEHNUNG ist: fehlende
 * Angaben duerfen nicht als "wahrscheinlich in Ordnung" durchgehen. Jeder
 * Test hier beschreibt einen Weg, auf dem ohne diese Sperre eine
 * unbelegte Kassenforderung entstuende.
 */

import { describe, it, expect } from 'vitest'
import {
  offeneFachfragenAlsBefunde,
  pruefeBuchung,
  PRUEF_CODES,
  PRUEF_CODE_TEXT,
  type PruefEingabe,
} from '@/lib/billing/vpkzp/pruefprotokoll'
import { OFFENE_FACHFRAGEN } from '@/lib/billing/vpkzp/konstanten'
import { leererStand } from '@/lib/billing/vpkzp/berechnung'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const KLIENT = '00000000-0000-4000-8000-0000000000bb'

/** Ein vollstaendig belegter, verifizierter Kassentarif. */
const TARIF_VERIFIZIERT = {
  quellTabelle: 'billing_tariffs' as const,
  tarifStatus: 'verified',
  rechtsgrundlage: '§ 39 SGB XI',
  id: 'tarif-1',
}

function eingabe(teil: Partial<PruefEingabe> = {}): PruefEingabe {
  return {
    organizationId: ORG,
    clientId: KLIENT,
    art: 'verhinderungspflege',
    zeitraum: { von: '2026-05-01', bis: '2026-05-07' },
    betragEuro: 350,
    pflegegrad: 3,
    tarif: TARIF_VERIFIZIERT,
    staende: [leererStand(2026)],
    bestand: [],
    ...teil,
  }
}

function codes(ergebnis: ReturnType<typeof pruefeBuchung>): string[] {
  return ergebnis.befunde.map(b => b.code)
}

describe('Freigabe', () => {
  it('laesst eine vollstaendig belegte Buchung durch', () => {
    const e = pruefeBuchung(eingabe())
    expect(e.entscheidung).toBe('freigegeben')
    expect(e.buchbar).toBe(true)
    expect(e.tageGesamt).toBe(7)
    expect(e.anrechenbareTageGesamt).toBe(7)
    expect(e.budgetBetragEuro).toBe(350)
    expect(e.privatBetragEuro).toBe(0)
    expect(codes(e)).toEqual(['OK'])
  })
})

describe('Fail-closed bei fehlenden Angaben', () => {
  it('lehnt ohne Mandant ab', () => {
    const e = pruefeBuchung(eingabe({ organizationId: '' }))
    expect(e.entscheidung).toBe('abgelehnt')
    expect(codes(e)).toContain('MANDANT_FEHLT')
  })

  it('lehnt ohne Klient ab', () => {
    const e = pruefeBuchung(eingabe({ clientId: null }))
    expect(e.entscheidung).toBe('abgelehnt')
    expect(codes(e)).toContain('MANDANT_FEHLT')
  })

  it('lehnt eine unbekannte Leistungsart ab, statt sie zuzuordnen', () => {
    const e = pruefeBuchung(eingabe({ art: 'tagespflege' }))
    expect(e.entscheidung).toBe('abgelehnt')
    expect(codes(e)).toContain('FACHAUSKUNFT_ERFORDERLICH')
    expect(e.art).toBeNull()
  })

  it('lehnt ohne Pflegegrad ab, statt Anspruch zu unterstellen', () => {
    const e = pruefeBuchung(eingabe({ pflegegrad: null }))
    expect(e.entscheidung).toBe('abgelehnt')
    expect(codes(e)).toContain('FACHAUSKUNFT_ERFORDERLICH')
    expect(e.zusammenfassung).toContain('Pflegegrad')
  })

  it('lehnt Pflegegrad 1 ab und verweist auf den § 45b-Weg', () => {
    const e = pruefeBuchung(eingabe({ pflegegrad: 1 }))
    expect(e.entscheidung).toBe('abgelehnt')
    expect(codes(e)).toContain('PFLEGEGRAD_ZU_NIEDRIG')
    expect(e.zusammenfassung).toContain('45b')
  })

  it('lehnt ein Jahr ohne hinterlegte Kontingente ab', () => {
    const e = pruefeBuchung(eingabe({
      zeitraum: { von: '2023-05-01', bis: '2023-05-07' },
      staende: [],
    }))
    expect(e.entscheidung).toBe('abgelehnt')
    expect(codes(e)).toContain('BUDGETJAHR_UNBEKANNT')
  })
})

describe('Fail-closed bei Tarifen', () => {
  it('lehnt ohne Tarif ab', () => {
    const e = pruefeBuchung(eingabe({ tarif: null }))
    expect(e.entscheidung).toBe('abgelehnt')
    expect(codes(e)).toContain('TARIF_NICHT_VERIFIZIERT')
  })

  it('lehnt einen nicht verifizierten Kassentarif ab', () => {
    const e = pruefeBuchung(eingabe({
      tarif: { ...TARIF_VERIFIZIERT, tarifStatus: 'unverified' },
    }))
    expect(e.entscheidung).toBe('abgelehnt')
    expect(codes(e)).toContain('TARIF_NICHT_VERIFIZIERT')
  })

  it('lehnt einen gesperrten Tarif ab', () => {
    const e = pruefeBuchung(eingabe({
      tarif: { ...TARIF_VERIFIZIERT, tarifStatus: 'blocked' },
    }))
    expect(e.entscheidung).toBe('abgelehnt')
    expect(codes(e)).toContain('TARIF_NICHT_VERIFIZIERT')
  })

  it('behandelt einen fehlenden Status wie "unverified"', () => {
    const e = pruefeBuchung(eingabe({
      tarif: { ...TARIF_VERIFIZIERT, tarifStatus: null },
    }))
    expect(e.entscheidung).toBe('abgelehnt')
    expect(codes(e)).toContain('TARIF_NICHT_VERIFIZIERT')
  })

  it('prueft den Tarif VOR Tagen und Budget — die Meldung nennt die Ursache', () => {
    // Ein erschoepftes Kontingent darf nicht die eigentliche Ursache
    // (fehlende Preisgrundlage) verdecken.
    const e = pruefeBuchung(eingabe({
      tarif: null,
      staende: [{ ...leererStand(2026), vpTageVerbraucht: 42 }],
    }))
    expect(codes(e)).toEqual(['TARIF_NICHT_VERIFIZIERT'])
  })
})

describe('Zeitraum', () => {
  it('lehnt verdrehte Zeitraeume ab', () => {
    const e = pruefeBuchung(eingabe({ zeitraum: { von: '2026-05-10', bis: '2026-05-01' } }))
    expect(e.entscheidung).toBe('abgelehnt')
    expect(codes(e)).toContain('ZEITRAUM_UNGUELTIG')
  })

  it('lehnt nicht existierende Kalendertage ab', () => {
    const e = pruefeBuchung(eingabe({ zeitraum: { von: '2026-02-30', bis: '2026-03-02' } }))
    expect(e.entscheidung).toBe('abgelehnt')
    expect(codes(e)).toContain('ZEITRAUM_UNGUELTIG')
  })
})

describe('Tagekontingent', () => {
  it('lehnt ab, wenn die Tage im Jahr aufgebraucht sind', () => {
    const e = pruefeBuchung(eingabe({
      staende: [{ ...leererStand(2026), vpTageVerbraucht: 42 }],
    }))
    expect(e.entscheidung).toBe('abgelehnt')
    expect(codes(e)).toContain('TAGE_KONTINGENT_ERSCHOEPFT')
  })

  it('meldet Teildeckung, wenn nur ein Teil der Tage passt', () => {
    const e = pruefeBuchung(eingabe({
      staende: [{ ...leererStand(2026), vpTageVerbraucht: 40 }],
    }))
    expect(e.entscheidung).toBe('teilweise')
    expect(e.buchbar).toBe(false)          // 'teilweise' ist KEINE Freigabe
    expect(e.anrechenbareTageGesamt).toBe(2)
    expect(codes(e)).toContain('TAGE_KONTINGENT_ERSCHOEPFT')
  })

  it('laesst KZP zu, obwohl das VP-Kontingent voll ist', () => {
    const e = pruefeBuchung(eingabe({
      art: 'kurzzeitpflege',
      tarif: { ...TARIF_VERIFIZIERT, rechtsgrundlage: '§ 42 SGB XI' },
      staende: [{ ...leererStand(2026), vpTageVerbraucht: 42 }],
    }))
    expect(e.entscheidung).toBe('freigegeben')
    expect(e.anrechenbareTageGesamt).toBe(7)
  })
})

describe('Gemeinsamer Jahresbetrag', () => {
  it('lehnt ab, wenn der Topf durch die ANDERE Leistungsart leer ist', () => {
    const e = pruefeBuchung(eingabe({
      staende: [{ ...leererStand(2026), kzpBetragVerbrauchtEuro: 3539 }],
    }))
    expect(e.entscheidung).toBe('abgelehnt')
    expect(codes(e)).toContain('BUDGET_ERSCHOEPFT')
    expect(e.budgetBetragEuro).toBe(0)
    expect(e.privatBetragEuro).toBe(350)
  })

  it('meldet Teildeckung bei angebrochenem Rest', () => {
    const e = pruefeBuchung(eingabe({
      staende: [{ ...leererStand(2026), vpBetragVerbrauchtEuro: 3339 }],
    }))
    expect(e.entscheidung).toBe('teilweise')
    expect(e.budgetBetragEuro).toBe(200)
    expect(e.privatBetragEuro).toBe(150)
  })
})

describe('Jahreswechsel', () => {
  it('prueft jedes Kalenderjahr gegen seinen eigenen Stand', () => {
    const e = pruefeBuchung(eingabe({
      zeitraum: { von: '2025-12-27', bis: '2026-01-09' },
      betragEuro: 700,
      staende: [
        { ...leererStand(2025), vpTageVerbraucht: 42, vpBetragVerbrauchtEuro: 3539 },
        leererStand(2026),
      ],
    }))

    expect(e.jahre.map(j => j.jahr)).toEqual([2025, 2026])
    expect(e.jahre[0].segment.tage).toBe(5)
    expect(e.jahre[1].segment.tage).toBe(9)

    // 2025 ist aus, 2026 traegt voll — also nur teilweise gedeckt.
    expect(e.jahre[0].buchung?.anrechenbareTage).toBe(0)
    expect(e.jahre[1].buchung?.anrechenbareTage).toBe(9)
    expect(e.entscheidung).toBe('teilweise')
    expect(codes(e)).toContain('TAGE_KONTINGENT_ERSCHOEPFT')
    expect(codes(e)).toContain('BUDGET_ERSCHOEPFT')
  })

  it('verteilt den Betrag tageproportional und verliert dabei keinen Cent', () => {
    const e = pruefeBuchung(eingabe({
      zeitraum: { von: '2025-12-30', bis: '2026-01-02' },   // 2 + 2 Tage
      betragEuro: 333.33,
      staende: [leererStand(2025), leererStand(2026)],
    }))
    const summe = e.jahre.reduce((s, j) => s + (j.buchung?.betragEuro ?? 0), 0)
    expect(Math.round(summe * 100) / 100).toBe(333.33)
    expect(e.budgetBetragEuro).toBe(333.33)
    expect(e.entscheidung).toBe('freigegeben')
  })

  it('gibt einen jahresuebergreifenden Zeitraum frei, wenn beide Jahre tragen', () => {
    const e = pruefeBuchung(eingabe({
      zeitraum: { von: '2025-12-27', bis: '2026-01-09' },
      betragEuro: 700,
      staende: [leererStand(2025), leererStand(2026)],
    }))
    expect(e.entscheidung).toBe('freigegeben')
    expect(e.tageGesamt).toBe(14)
    expect(e.anrechenbareTageGesamt).toBe(14)
  })
})

describe('Mehrfachleistungen', () => {
  it('zaehlt ueberschneidende Tage derselben Art nicht doppelt', () => {
    const e = pruefeBuchung(eingabe({
      zeitraum: { von: '2026-05-01', bis: '2026-05-07' },
      bestand: [
        { id: 'alt', art: 'verhinderungspflege', von: '2026-05-01', bis: '2026-05-03' },
      ],
      staende: [{ ...leererStand(2026), vpTageVerbraucht: 3 }],
    }))
    // 7 Tage im Zeitraum, davon 3 bereits erfasst → 4 neue Tage.
    expect(e.tageGesamt).toBe(7)
    expect(e.anrechenbareTageGesamt).toBe(4)
    expect(codes(e)).toContain('ZEITRAUM_UEBERSCHNEIDUNG')
    // Der Hinweis sperrt nicht.
    expect(e.entscheidung).toBe('freigegeben')
  })

  it('ignoriert stornierte Bestandsbuchungen', () => {
    const e = pruefeBuchung(eingabe({
      bestand: [
        { id: 'storno', art: 'verhinderungspflege', von: '2026-05-01', bis: '2026-05-07', status: 'storniert' },
      ],
    }))
    expect(codes(e)).not.toContain('ZEITRAUM_UEBERSCHNEIDUNG')
    expect(e.anrechenbareTageGesamt).toBe(7)
  })

  it('meldet Ueberschneidung mit der anderen Leistungsart als Hinweis', () => {
    const e = pruefeBuchung(eingabe({
      bestand: [
        { id: 'kzp', art: 'kurzzeitpflege', von: '2026-05-05', bis: '2026-05-09' },
      ],
    }))
    expect(codes(e)).toContain('ZEITRAUM_UEBERSCHNEIDUNG')
    expect(e.entscheidung).toBe('freigegeben')
    // Tage der anderen Art mindern das eigene Kontingent nicht.
    expect(e.anrechenbareTageGesamt).toBe(7)
  })
})

describe('Vokabular', () => {
  it('hat fuer jeden Code einen Klartext', () => {
    for (const code of PRUEF_CODES) {
      expect(PRUEF_CODE_TEXT[code]).toBeTruthy()
    }
  })

  it('gibt die offenen Fachfragen als Hinweise aus, nicht als Sperre', () => {
    const befunde = offeneFachfragenAlsBefunde()
    expect(befunde).toHaveLength(Object.keys(OFFENE_FACHFRAGEN).length)
    expect(befunde.every(b => b.schwere === 'hinweis')).toBe(true)
    expect(befunde.every(b => b.code === 'FACHAUSKUNFT_ERFORDERLICH')).toBe(true)
  })

  it('nennt die ungeklaerte VP-Dauer ausdruecklich', () => {
    // Solange nicht belegt ist, ob die Verhinderungspflege seit 01.07.2025
    // acht statt sechs Wochen umfasst, muss dieser Vorbehalt sichtbar sein.
    expect(OFFENE_FACHFRAGEN.vp_dauer_ab_072025).toMatch(/42 Tage/)
  })
})
