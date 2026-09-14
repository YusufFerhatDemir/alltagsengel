/**
 * Bewerberfilter und die zwei Dimensionen neben der Stufe.
 * @see lib/bewerbung/filter.ts · lib/bewerbung/pipeline.ts
 */
import { describe, it, expect } from 'vitest'
import {
  FILTER_DIMENSIONEN, ALLE, OHNE_ANGABE, leereAuswahl, passtZuFiltern, abdeckung,
  type FilterZeile,
} from '@/lib/bewerbung/filter'
import {
  mitPrio, mitBlockern, prioUndBlocker, mitPipelineStufe,
  BEWERBER_STUFEN_FLOW, BEWERBER_ENDZUSTAENDE, bewerberStufe,
} from '@/lib/bewerbung/pipeline'

const JETZT = new Date('2026-09-12T10:00:00Z')

function zeile(teil: Partial<FilterZeile> = {}): FilterZeile {
  return { plz: '60311', utm_source: null, daten: {}, roh: null, ...teil }
}

describe('passtZuFiltern', () => {
  it('leere Auswahl lässt alles durch', () => {
    expect(passtZuFiltern(zeile(), leereAuswahl())).toBe(true)
  })

  it('filtert auf einen Katalogwert', () => {
    const z = zeile({ daten: { qualifikation: 'pflegefachkraft' } })
    expect(passtZuFiltern(z, { ...leereAuswahl(), qualifikation: 'pflegefachkraft' })).toBe(true)
    expect(passtZuFiltern(z, { ...leereAuswahl(), qualifikation: 'keine' })).toBe(false)
  })

  it('Mehrfachauswahl trifft, wenn EINER der Werte passt', () => {
    const z = zeile({ daten: { sprachen: ['deutsch', 'tuerkisch'] } })
    expect(passtZuFiltern(z, { ...leereAuswahl(), sprachen: 'tuerkisch' })).toBe(true)
    expect(passtZuFiltern(z, { ...leereAuswahl(), sprachen: 'polnisch' })).toBe(false)
  })

  it('mehrere Filter wirken UND-verknüpft', () => {
    const z = zeile({ daten: { qualifikation: 'pflegehelfer', stunden: '10_20' } })
    const auswahl = { ...leereAuswahl(), qualifikation: 'pflegehelfer', stunden: '10_20' }
    expect(passtZuFiltern(z, auswahl)).toBe(true)
    expect(passtZuFiltern(z, { ...auswahl, stunden: 'ueber_30' })).toBe(false)
  })

  it('„ohne Angabe" ist eine Antwort, keine leere Auswahl', () => {
    const mit = zeile({ daten: { fuehrerschein: 'ja_mit_auto' } })
    const ohne = zeile({ daten: {} })
    const auswahl = { ...leereAuswahl(), fuehrerschein: OHNE_ANGABE }
    expect(passtZuFiltern(ohne, auswahl)).toBe(true)
    expect(passtZuFiltern(mit, auswahl)).toBe(false)
  })

  it('PLZ-Bereich greift die erste Ziffer', () => {
    expect(passtZuFiltern(zeile({ plz: '63450' }), { ...leereAuswahl(), plzBereich: '6' })).toBe(true)
    expect(passtZuFiltern(zeile({ plz: '34117' }), { ...leereAuswahl(), plzBereich: '6' })).toBe(false)
    expect(passtZuFiltern(zeile({ plz: null }), { ...leereAuswahl(), plzBereich: OHNE_ANGABE })).toBe(true)
  })

  it('ein unbekannter Filterschlüssel leert die Liste nicht', () => {
    expect(passtZuFiltern(zeile(), { ...leereAuswahl(), gibtsNicht: 'x' })).toBe(true)
  })

  it('Region filtert aus bewerbung_daten — seit 12.09.2026 im Modell statt handverdrahtet', () => {
    const z = zeile({ daten: { region: 'hanau' } })
    expect(passtZuFiltern(z, { ...leereAuswahl(), region: 'hanau' })).toBe(true)
    expect(passtZuFiltern(z, { ...leereAuswahl(), region: 'frankfurt' })).toBe(false)
    expect(passtZuFiltern(zeile({ daten: {} }), { ...leereAuswahl(), region: OHNE_ANGABE })).toBe(true)
  })

  it('vierzehn Dimensionen — drei davon Arbeitsfelder der Verwaltung', () => {
    expect(FILTER_DIMENSIONEN).toHaveLength(14)
    expect(FILTER_DIMENSIONEN.map(d => d.key)).toContain('region')
    for (const k of ['fzStatus', 'atsPrioritaet', 'mobilitaet']) {
      expect(FILTER_DIMENSIONEN.map(d => d.key), k).toContain(k)
    }
  })

  it('Pipeline-Priorität und Verwaltungs-Priorität bleiben getrennt', () => {
    // Zwei verschiedene Fragen: die eine folgt aus dem Bearbeitungsstand,
    // die andere hat ein Mensch vergeben. Zusammengelegt ginge eine verloren.
    const keys = FILTER_DIMENSIONEN.map(d => d.key)
    expect(keys).toContain('prio')
    expect(keys).toContain('atsPrioritaet')
  })

  it('jede Dimension hat Werte und ein lesbares Etikett', () => {
    for (const d of FILTER_DIMENSIONEN) {
      expect(d.werte.length, d.key).toBeGreaterThan(1)
      expect(d.label.length, d.key).toBeGreaterThan(3)
      expect(d.key).not.toBe(ALLE)
    }
  })
})

describe('abdeckung — macht Datenlücken sichtbar statt sie wegzufiltern', () => {
  it('zählt Zeilen mit und ohne Angabe', () => {
    const zeilen = [
      zeile({ daten: { qualifikation: 'keine' } }),
      zeile({ daten: {} }),
      zeile({ daten: null }),
    ]
    expect(abdeckung(zeilen, 'qualifikation')).toEqual({ mit: 1, ohne: 2 })
  })

  it('unbekannte Dimension: alles gilt als ohne Angabe, kein Absturz', () => {
    expect(abdeckung([zeile()], 'gibtsNicht')).toEqual({ mit: 0, ohne: 1 })
  })
})

describe('Priorität und Blocker sind unabhängig von der Stufe', () => {
  it('ein Stufenwechsel löscht die Priorität nicht — genau dafür sind sie getrennt', () => {
    let daten: unknown = mitPrio(null, '1')
    daten = mitPipelineStufe(daten, 'vorstellungsgespraech', JETZT, 'Verwaltung')
    const { prio } = prioUndBlocker(daten)
    expect(prio).toBe('1')
  })

  it('mehrere Blocker gleichzeitig, doppelte fallen weg', () => {
    const daten = mitBlockern(null, ['fz_fehlt', 'unterlagen_fehlen', 'fz_fehlt'])
    expect(prioUndBlocker(daten).blocker).toEqual(['fz_fehlt', 'unterlagen_fehlen'])
  })

  it('unbekannte Blocker werden verworfen, nicht gespeichert', () => {
    expect(prioUndBlocker(mitBlockern(null, ['erfunden', 'fz_fehlt'])).blocker).toEqual(['fz_fehlt'])
  })

  it('Priorität lässt sich zurücknehmen', () => {
    const daten = mitPrio(mitPrio(null, '2'), null)
    expect(prioUndBlocker(daten).prio).toBeNull()
  })

  it('leere Blockerliste heißt „nichts offen"', () => {
    expect(prioUndBlocker(mitBlockern(mitBlockern(null, ['fz_fehlt']), [])).blocker).toEqual([])
  })

  it('Formularangaben daneben bleiben unangetastet', () => {
    const daten = mitBlockern(mitPrio({ version: 1, qualifikation: 'pflegehelfer' }, '1'), ['fz_fehlt'])
    expect(daten.version).toBe(1)
    expect(daten.qualifikation).toBe('pflegehelfer')
  })
})

describe('Stufenmodell', () => {
  it('trägt alle zwölf Stufen, jede mit Aufgabe und Farbe', () => {
    expect(BEWERBER_STUFEN_FLOW).toHaveLength(12)
    for (const key of BEWERBER_STUFEN_FLOW) {
      const s = bewerberStufe(key)
      expect(s.aufgabe.length, key).toBeGreaterThan(8)
      expect(s.color, key).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })

  it('„archiviert" ist ein Endzustand, aber nicht dasselbe wie „abgelehnt"', () => {
    expect(BEWERBER_ENDZUSTAENDE).toContain('archiviert')
    expect(bewerberStufe('archiviert').label).not.toBe(bewerberStufe('abgelehnt').label)
    // Beide melden lost an die CRM-Spalte — der Unterschied lebt in der feinen Stufe.
    expect(bewerberStufe('archiviert').dbStatus).toBe('lost')
    expect(bewerberStufe('abgelehnt').dbStatus).toBe('lost')
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Arbeitsfelder als Filterdimension (13.09.2026)
// ═══════════════════════════════════════════════════════════════════════

describe('ATS-Dimensionen', () => {
  const mitAts = (ats: Record<string, unknown>) => zeile({ roh: { ats } })

  it('filtert nach Führungszeugnis-Stand', () => {
    const z = mitAts({ fzStatus: 'beantragt' })
    expect(passtZuFiltern(z, { ...leereAuswahl(), fzStatus: 'beantragt' })).toBe(true)
    expect(passtZuFiltern(z, { ...leereAuswahl(), fzStatus: 'eingetroffen' })).toBe(false)
  })

  it('„ohne Angabe" trifft genau die, bei denen nichts erhoben wurde', () => {
    // Der wichtigste Fall: 36 Bewerbungen ohne jeden FZ-Stand sollen als
    // solche auffindbar sein, nicht in „alle" verschwinden.
    expect(passtZuFiltern(zeile({ roh: null }), { ...leereAuswahl(), fzStatus: OHNE_ANGABE })).toBe(true)
    expect(passtZuFiltern(mitAts({ fzStatus: 'beantragt' }), { ...leereAuswahl(), fzStatus: OHNE_ANGABE })).toBe(false)
  })

  it('filtert nach Verwaltungs-Priorität, Zahl als Schlüssel', () => {
    const z = mitAts({ prioritaet: 1 })
    expect(passtZuFiltern(z, { ...leereAuswahl(), atsPrioritaet: '1' })).toBe(true)
    expect(passtZuFiltern(z, { ...leereAuswahl(), atsPrioritaet: '3' })).toBe(false)
  })

  it('filtert nach Mobilität', () => {
    const z = mitAts({ mobilitaet: 'eigenes_auto' })
    expect(passtZuFiltern(z, { ...leereAuswahl(), mobilitaet: 'eigenes_auto' })).toBe(true)
    expect(passtZuFiltern(z, { ...leereAuswahl(), mobilitaet: 'oepnv' })).toBe(false)
  })

  it('ein kaputter ats-Zweig wirft nicht, sondern zählt als „ohne Angabe"', () => {
    for (const kaputt of [{ ats: 'kein Objekt' }, { ats: ['Liste'] }, {}]) {
      expect(passtZuFiltern(zeile({ roh: kaputt }), { ...leereAuswahl(), fzStatus: OHNE_ANGABE })).toBe(true)
    }
  })

  it('greift nicht in die Formularangaben — `daten` bleibt unberührt', () => {
    const z = zeile({ daten: { qualifikation: 'pflegefachkraft' }, roh: { ats: { prioritaet: 2 } } })
    expect(passtZuFiltern(z, { ...leereAuswahl(), qualifikation: 'pflegefachkraft' })).toBe(true)
    expect(passtZuFiltern(z, { ...leereAuswahl(), atsPrioritaet: '2' })).toBe(true)
  })
})
