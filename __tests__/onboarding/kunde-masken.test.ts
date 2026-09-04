/**
 * Kundenablauf — Schrittfolge, Leistungen, Finanzierung, Zusammenfassung
 *
 * Zwei Dinge sind hier besonders heikel:
 *
 *   1. Die Leistungswerte MÜSSEN kanonische Tarif-Schlüssel sein. Werden
 *      hier Wörter gesammelt, entsteht derselbe Bruch wie im Bestand:
 *      erfasste Leistungen ohne passenden Tarif, auffallend erst bei der
 *      Rechnung.
 *   2. Die Beträge dürfen NIRGENDS abgeschrieben sein. Ein hartkodierter
 *      Entlastungsbetrag wäre beim nächsten Rechtsstand falsch — auf
 *      einer Seite, die Kundschaft liest.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SCHRITTFOLGEN } from '@/lib/onboarding/schritte'
import { TARIF_LEISTUNGSARTEN } from '@/lib/billing/leistungsarten'
import { ENTLASTUNG_MONATLICH_EUR, VP_KZP_KOMBINIERT_EUR } from '@/lib/config/budget-constants'
import {
  FINANZIERUNGSWEGE, erklaerungAlleWege, finanzierungsLabel, finanzierungsOptionen,
  istFinanzierungsweg,
} from '@/lib/onboarding/finanzierung'
import { LEISTUNGEN, leistungLabel, unbekannteLeistungen } from '@/components/onboarding/kunde/leistungen'
import {
  baueBloecke, feldLabel, offenePflichtangaben, wertText,
} from '@/components/onboarding/kunde/zusammenfassung'

describe('Schrittfolge', () => {
  it('hat die zehn vereinbarten Schritte', () => {
    expect(SCHRITTFOLGEN.kunde.map(s => s.schluessel)).toEqual([
      'fuer_wen', 'adresse', 'bedarf', 'pflegegrad', 'finanzierung',
      'zeiten', 'besonderheiten', 'unterlagen', 'zusammenfassung', 'abschluss',
    ])
  })

  it('fragt weiterhin keine Zahlungsdaten ab', () => {
    const alle = SCHRITTFOLGEN.kunde.flatMap(s => s.erwarteteAngaben).join(' ')
    expect(alle).not.toMatch(/iban|bic|konto|kreditkarte|bank/i)
  })

  it('macht Besonderheiten und Unterlagen freiwillig', () => {
    // Wer gerade kein Dokument findet, soll weitermachen koennen.
    for (const schluessel of ['besonderheiten', 'unterlagen']) {
      expect(SCHRITTFOLGEN.kunde.find(s => s.schluessel === schluessel)?.ueberspringbar).toBe(true)
    }
  })
})

describe('Leistungen sind Tarif-Schlüssel', () => {
  it('kennt keinen Wert, den die Abrechnung nicht kennt', () => {
    expect(unbekannteLeistungen()).toEqual([])
  })

  it('nutzt ausschliesslich Werte aus TARIF_LEISTUNGSARTEN', () => {
    for (const l of LEISTUNGEN) {
      expect(TARIF_LEISTUNGSARTEN).toContain(l.wert)
    }
  })

  it('bietet keine Leistung doppelt an', () => {
    const werte = LEISTUNGEN.map(l => l.wert)
    expect(new Set(werte).size).toBe(werte.length)
  })

  it('übersetzt Schlüssel in Klartext', () => {
    expect(leistungLabel('betreuung_45a')).toBe('Gesellschaft und Gespräche')
    expect(leistungLabel('hauswirtschaft')).toBe('Haushalt und Wäsche')
    expect(leistungLabel('gibt_es_nicht')).toBe('gibt_es_nicht')
  })
})

describe('Finanzierung', () => {
  const optionen = finanzierungsOptionen(2026)

  it('nennt den Entlastungsbetrag aus den gesetzlichen Werten', () => {
    // 131 EUR, nicht 125 — und nicht abgeschrieben, sondern aus
    // lib/config/budget-constants.ts.
    expect(ENTLASTUNG_MONATLICH_EUR).toBe(131)
    const entlastung = optionen.find(o => o.wert === 'entlastungsbetrag')
    expect(entlastung?.lang).toContain('131')
    expect(entlastung?.kurz).toContain('131')
  })

  it('nennt den gemeinsamen VP/KZP-Jahresbetrag', () => {
    expect(VP_KZP_KOMBINIERT_EUR).toBe(3539)
    expect(optionen.find(o => o.wert === 'weitere_pflegeleistungen')?.lang).toContain('3.539')
  })

  it('schreibt nirgends 125 EUR', () => {
    // Der alte Wert vor 2025. Er darf in keinem Text mehr auftauchen.
    const alles = optionen.map(o => `${o.label} ${o.kurz} ${o.lang}`).join(' ')
    expect(alles).not.toMatch(/125\s*(€|EUR)/)
  })

  it('erklärt bei „Ich weiß es nicht" ALLE Wege', () => {
    const erklaerung = erklaerungAlleWege(2026)
    expect(erklaerung.map(o => o.wert)).toEqual([
      'entlastungsbetrag', 'weitere_pflegeleistungen', 'privat',
    ])
    // Jede Erklärung ist ein ausformulierter Absatz, kein Stichwort.
    expect(erklaerung.every(o => o.lang.length > 120)).toBe(true)
  })

  it('verspricht nichts, was niemand halten kann', () => {
    const alles = optionen.map(o => o.lang).join(' ')
    expect(alles).not.toMatch(/kostet Sie nichts|garantiert|in jedem Fall|sicher zu/i)
  })

  it('ist fail-closed für Jahre ohne gesetzliche Werte', () => {
    // Lieber keine Auskunft als eine geratene — der Betrag landet in
    // einer Kundenanfrage.
    expect(() => finanzierungsOptionen(2019)).toThrow()
  })

  it('kennt genau vier Wege', () => {
    expect(FINANZIERUNGSWEGE).toEqual([
      'entlastungsbetrag', 'weitere_pflegeleistungen', 'privat', 'unklar',
    ])
    expect(istFinanzierungsweg('privat')).toBe(true)
    expect(istFinanzierungsweg('sozialamt')).toBe(false)
  })

  it('liefert Klartext für die Zusammenfassung', () => {
    expect(finanzierungsLabel('unklar')).toBe('Ich weiß es nicht')
  })
})

describe('Zusammenfassung', () => {
  const daten = {
    fuer_wen: { fuer_wen: 'angehoeriger' },
    adresse: { plz: '60313', ort: 'Frankfurt', strasse: 'Zeil 1' },
    bedarf: { leistungsarten: ['hauswirtschaft', 'betreuung_45a'] },
    pflegegrad: { pflegegrad: 'unbekannt' },
    finanzierung: { finanzierungsweg: 'unklar' },
  }

  it('übersetzt Leistungsschlüssel in Klartext', () => {
    expect(wertText('leistungsarten', ['hauswirtschaft', 'betreuung_45a']))
      .toBe('Haushalt und Wäsche, Gesellschaft und Gespräche')
  })

  it('übersetzt Finanzierung und Pflegegrad', () => {
    expect(wertText('finanzierungsweg', 'unklar')).toBe('Ich weiß es nicht')
    expect(wertText('pflegegrad', 'unbekannt')).toBe('Weiß ich nicht')
    expect(wertText('pflegegrad', '3')).toBe('Pflegegrad 3')
  })

  it('zeigt Fehlendes als Strich', () => {
    expect(wertText('ort', '')).toBe('—')
    expect(wertText('leistungsarten', [])).toBe('—')
  })

  it('lässt Freitext unverändert', () => {
    expect(wertText('haustiere', 'Eine Katze')).toBe('Eine Katze')
  })

  it('nennt die Schrittnummer für den Korrektur-Knopf', () => {
    expect(baueBloecke(daten).find(b => b.schluessel === 'bedarf')?.nummer).toBe(3)
  })

  it('zeigt nur Formularschritte', () => {
    const schluessel = baueBloecke(daten).map(b => b.schluessel)
    expect(schluessel).not.toContain('zusammenfassung')
    expect(schluessel).not.toContain('abschluss')
  })

  it('meldet offene Pflichtangaben mit Beschriftung', () => {
    const offen = offenePflichtangaben(daten)
    expect(offen).toContain('Wochentage')
    expect(offen).not.toContain('Postleitzahl')
    expect(feldLabel('haeufigkeit')).toBe('Häufigkeit')
  })

  it('zählt freiwillige Schritte nicht mit', () => {
    expect(offenePflichtangaben({})).not.toContain('Sonstiges')
    expect(offenePflichtangaben({})).not.toContain('Pflegegradbescheid')
  })
})

describe('Maskenzuordnung', () => {
  function zugeordnet(): string[] {
    const quelle = readFileSync(
      join(process.cwd(), 'app', 'onboarding', 'kunde', 'page.tsx'), 'utf8',
    )
    const block = quelle.slice(
      quelle.indexOf('const masken'),
      quelle.indexOf('return (', quelle.indexOf('const masken')),
    )
    return [...block.matchAll(/^\s{4}([a-z_]+):/gm)].map(m => m[1])
  }

  it('deckt jeden Schritt ab und erfindet keinen', () => {
    const zug = zugeordnet()
    const bekannt = SCHRITTFOLGEN.kunde.map(s => s.schluessel)
    for (const s of bekannt) expect(zug).toContain(s)
    for (const s of zug) expect(bekannt).toContain(s)
  })
})
