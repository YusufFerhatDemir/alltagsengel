/**
 * Kunden-Warteliste: Stufen ↔ DB-Werte und Priorisierung.
 * @see lib/warteliste/katalog.ts
 * @see lib/warteliste/prioritaet.ts
 */
import { describe, it, expect } from 'vitest'
import {
  WARTELISTE_STUFEN, WARTELISTE_STUFEN_FLOW, WARTELISTE_STUFE_MIGRATION,
  stufeAusDbWert, dbWertFuerStufe, istWartelisteStufe,
} from '@/lib/warteliste/katalog'
import {
  berechnePrioritaet, sortiereWarteliste, followUpFuer, wiedervorlageFuer,
  type WartelisteLead,
} from '@/lib/warteliste/prioritaet'

/**
 * `state_waitlist_status_check` LIVE am 11.09.2026 — per 23514-Probe
 * belegt (PATCH status='termin' → 23514). Wer den CHECK ändert, muss
 * diese Liste und WARTELISTE_STUFE_MIGRATION mitziehen.
 */
const LIVE_CHECK = ['neu', 'kontaktiert', 'vorgemerkt', 'aktiviert', 'abgemeldet']

const JETZT = new Date('2026-09-11T12:00:00Z')
const vor = (h: number) => new Date(JETZT.getTime() - h * 3600_000).toISOString()

function lead(teil: Partial<WartelisteLead> = {}): WartelisteLead {
  return {
    id: 'x', stufe: 'neu', pflegegrad: null, region: null, bundesland: 'hessen',
    gewuenschte_leistungen: [], nachricht: null, quelle: null,
    created_at: vor(1), updated_at: vor(1), ...teil,
  }
}

describe('Stufen der Warteliste', () => {
  it('genau die sechs beauftragten Stufen, in dieser Reihenfolge', () => {
    expect(WARTELISTE_STUFEN_FLOW).toEqual(['neu', 'kontaktiert', 'termin', 'warteliste', 'kunde', 'abgelehnt'])
  })

  it('jede Stufe hat einen DB-Wert, der live erlaubt ist ODER eine benannte Migration braucht', () => {
    for (const s of WARTELISTE_STUFEN) {
      const erlaubt = LIVE_CHECK.includes(s.dbWert)
      expect(erlaubt || Boolean(WARTELISTE_STUFE_MIGRATION[s.key]), `${s.key} → ${s.dbWert}`).toBe(true)
    }
  })

  it('nur „termin" braucht die Migration', () => {
    expect(Object.keys(WARTELISTE_STUFE_MIGRATION)).toEqual(['termin'])
    expect(WARTELISTE_STUFE_MIGRATION.termin).toBe('20261104000000')
  })

  it('Rundreise Stufe → DB-Wert → Stufe ist verlustfrei', () => {
    for (const s of WARTELISTE_STUFEN_FLOW) {
      expect(stufeAusDbWert(dbWertFuerStufe(s))).toBe(s)
    }
  })

  it('alle live vorkommenden DB-Werte haben eine Stufe (Kunde = aktiviert)', () => {
    expect(LIVE_CHECK.map(stufeAusDbWert)).toEqual(['neu', 'kontaktiert', 'warteliste', 'kunde', 'abgelehnt'])
  })

  it('unbekannter DB-Wert tarnt sich NICHT als „neu"', () => {
    expect(stufeAusDbWert('irgendwas')).toBe('irgendwas')
    expect(stufeAusDbWert(null)).toBe('neu')
  })

  it('fail-closed: DB-Werte sind keine Stufen', () => {
    expect(istWartelisteStufe('aktiviert')).toBe(false)
    expect(istWartelisteStufe('kunde')).toBe(true)
    expect(dbWertFuerStufe('aktiviert')).toBeNull()
  })
})

describe('Follow-up der Warteliste', () => {
  it('NEU: Uhr ab Eingang, nicht ab updated_at', () => {
    // updated_at frisch (technisches Update), Eingang vor 50 h → Eskalation
    expect(followUpFuer({ stufe: 'neu', created_at: vor(50), updated_at: vor(0.1) }, JETZT)).toBe('eskalation')
  })

  it('Kontaktiert: Wiedervorlage 2 Tage nach letzter Bearbeitung', () => {
    expect(wiedervorlageFuer({ stufe: 'kontaktiert', created_at: vor(100), updated_at: '2026-09-01T10:00:00.000Z' }))
      .toBe('2026-09-03T10:00:00.000Z')
    expect(followUpFuer({ stufe: 'kontaktiert', created_at: vor(200), updated_at: vor(24) }, JETZT)).toBe('keine')
    expect(followUpFuer({ stufe: 'kontaktiert', created_at: vor(200), updated_at: vor(48) }, JETZT)).toBe('erinnerung')
    expect(followUpFuer({ stufe: 'kontaktiert', created_at: vor(200), updated_at: vor(96) }, JETZT)).toBe('dringend')
  })

  it('Kunde und Abgelehnt: nie Wiedervorlage', () => {
    expect(wiedervorlageFuer({ stufe: 'kunde', created_at: vor(999), updated_at: vor(999) })).toBeNull()
    expect(followUpFuer({ stufe: 'abgelehnt', created_at: vor(999), updated_at: vor(999) }, JETZT)).toBe('keine')
  })
})

describe('Priorität', () => {
  it('Dringlichkeit schlägt jedes andere Kriterium', () => {
    const vergessen = lead({ id: 'a', created_at: vor(80), updated_at: vor(80) })
    const perfekt = lead({
      id: 'b', pflegegrad: '5', region: 'Frankfurt am Main',
      gewuenschte_leistungen: ['demenzbetreuung', 'haushaltshilfe', 'alltagsbegleitung'],
      quelle: 'empfehlung', created_at: vor(2),
    })
    expect(berechnePrioritaet(vergessen, JETZT).punkte).toBeGreaterThan(berechnePrioritaet(perfekt, JETZT).punkte)
    expect(berechnePrioritaet(vergessen, JETZT).followUp).toBe('dringend')
  })

  it('bei gleicher Lage: höherer Pflegegrad vorne', () => {
    const pg1 = berechnePrioritaet(lead({ pflegegrad: '1' }), JETZT).punkte
    const pg4 = berechnePrioritaet(lead({ pflegegrad: '4' }), JETZT).punkte
    expect(pg4).toBeGreaterThan(pg1)
  })

  it('Region: Kerngebiet > Umland > außerhalb Hessens', () => {
    const kern = berechnePrioritaet(lead({ region: 'Offenbach am Main' }), JETZT).punkte
    const umland = berechnePrioritaet(lead({ region: 'Anderer Ort im Rhein-Main-Gebiet' }), JETZT).punkte
    const mainz = berechnePrioritaet(lead({ region: 'Mainz', bundesland: 'rheinland_pfalz' }), JETZT).punkte
    expect(kern).toBeGreaterThan(umland)
    expect(umland).toBeGreaterThan(mainz)
  })

  it('Dringlichkeit im Text wird erkannt und begründet', () => {
    const p = berechnePrioritaet(lead({ nachricht: 'Mutter wird nächste Woche aus dem Krankenhaus entlassen' }), JETZT)
    expect(p.teile.some(t => t.grund.includes('Nachricht'))).toBe(true)
  })

  it('Kunde/Abgelehnt: Priorität 0 — sie brauchen keine Arbeit mehr', () => {
    const p = berechnePrioritaet(lead({ stufe: 'kunde', pflegegrad: '5', created_at: vor(500) }), JETZT)
    expect(p.punkte).toBe(0)
    expect(p.followUp).toBe('keine')
  })

  it('jede Punktzahl ist aufgeschlüsselt', () => {
    const p = berechnePrioritaet(lead({ pflegegrad: '3', region: 'Hanau', quelle: 'empfehlung' }), JETZT)
    const summe = p.teile.reduce((s, t) => s + t.punkte, 0)
    expect(p.punkte).toBeCloseTo(summe, 5)
    expect(p.teile.map(t => t.kriterium)).toEqual(expect.arrayContaining(['Pflegegrad', 'Region', 'Quelle']))
  })
})

describe('Sortierung', () => {
  const a = lead({ id: 'a', pflegegrad: '2', created_at: vor(10), updated_at: vor(10) })
  const b = lead({ id: 'b', pflegegrad: '5', created_at: vor(5), updated_at: vor(5) })
  const c = lead({ id: 'c', pflegegrad: '2', created_at: vor(20), updated_at: vor(20) })
  const prio = (l: WartelisteLead) => berechnePrioritaet(l, JETZT)

  it('Pflegegrad absteigend, Gleichstand: ältester Eingang zuerst (FIFO)', () => {
    expect(sortiereWarteliste([a, b, c], 'pflegegrad', prio).map(x => x.id)).toEqual(['b', 'c', 'a'])
  })

  it('Datum neueste/älteste zuerst', () => {
    expect(sortiereWarteliste([a, b, c], 'datum_neu', prio).map(x => x.id)).toEqual(['b', 'a', 'c'])
    expect(sortiereWarteliste([a, b, c], 'datum_alt', prio).map(x => x.id)).toEqual(['c', 'a', 'b'])
  })

  it('sortiert eine Kopie, nicht das Original', () => {
    const liste = [a, b, c]
    sortiereWarteliste(liste, 'pflegegrad', prio)
    expect(liste.map(x => x.id)).toEqual(['a', 'b', 'c'])
  })
})
