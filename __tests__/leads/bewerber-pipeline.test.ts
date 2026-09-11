/**
 * Bewerber-Pipeline: acht Stufen über fünf CRM-Status, automatische Wiedervorlage.
 * @see lib/bewerbung/pipeline.ts
 */
import { describe, it, expect } from 'vitest'
import {
  BEWERBER_STUFEN, BEWERBER_STUFEN_FLOW, VERLAUF_MAX,
  stufeFuerBewerbung, mitPipelineStufe, naechsteWiedervorlage, followUpFuerBewerbung,
  wiedervorlageFuerBewerbung, hatFormularangaben, istBewerberStufe,
} from '@/lib/bewerbung/pipeline'
import { APPLICATION_FLOW } from '@/lib/admin/ops'

/** lead_inquiries_status_check LIVE am 11.09.2026 (23514-Probe mit 'vorgeprueft'). */
const LIVE_CHECK = ['new', 'contacted', 'qualified', 'converted', 'lost']

const JETZT = new Date('2026-09-11T10:00:00Z')
const vor = (h: number) => new Date(JETZT.getTime() - h * 3600_000).toISOString()

describe('Stufen', () => {
  it('genau die acht beauftragten Stufen, in dieser Reihenfolge', () => {
    expect(BEWERBER_STUFEN_FLOW).toEqual([
      'neu', 'vorgeprueft', 'rueckfrage', 'vorstellungsgespraech',
      'zusage', 'unterlagen', 'einsatzbereit', 'abgelehnt',
    ])
  })

  it('jede Stufe schreibt einen Status, den der LIVE-CHECK erlaubt', () => {
    for (const s of BEWERBER_STUFEN) expect(LIVE_CHECK).toContain(s.dbStatus)
    // und die Anwendungsliste deckt sich mit dem CHECK
    expect([...APPLICATION_FLOW].sort()).toEqual([...LIVE_CHECK].sort())
  })

  it('Endzustände haben keine Wiedervorlage, alle offenen eine', () => {
    for (const s of BEWERBER_STUFEN) {
      const ende = s.key === 'einsatzbereit' || s.key === 'abgelehnt'
      expect(s.wiedervorlageTage === null, s.key).toBe(ende)
    }
  })
})

describe('Stufe lesen', () => {
  it('ohne Pipeline: aus dem Status, nie mehr behauptet als der Status sagt', () => {
    expect(stufeFuerBewerbung(null, 'new').stufe).toBe('neu')
    expect(stufeFuerBewerbung(null, 'contacted').stufe).toBe('vorgeprueft')
    expect(stufeFuerBewerbung(null, 'qualified').stufe).toBe('vorstellungsgespraech')
    expect(stufeFuerBewerbung(null, 'converted').stufe).toBe('einsatzbereit')
    expect(stufeFuerBewerbung(null, 'lost').stufe).toBe('abgelehnt')
  })

  it('gespeicherte Pipeline gilt, wenn sie zum Status passt', () => {
    const d = { version: 1, pipeline: { stufe: 'unterlagen', seit: '2026-09-10T08:00:00Z', verlauf: [] } }
    expect(stufeFuerBewerbung(d, 'qualified')).toEqual({ stufe: 'unterlagen', seit: '2026-09-10T08:00:00Z', ausStatus: false })
  })

  it('läuft sie auseinander (z. B. in /mis/crm auf lost gestellt), gewinnt der Status', () => {
    const d = { pipeline: { stufe: 'zusage', seit: '2026-09-10T08:00:00Z', verlauf: [] } }
    expect(stufeFuerBewerbung(d, 'lost')).toMatchObject({ stufe: 'abgelehnt', ausStatus: true })
  })

  it('manipulierte Pipeline mit unbekannter Stufe wird ignoriert', () => {
    expect(stufeFuerBewerbung({ pipeline: { stufe: 'chef', seit: 'x' } }, 'new').stufe).toBe('neu')
    expect(istBewerberStufe('new')).toBe(false)
  })
})

describe('Stufe schreiben', () => {
  it('Formularangaben bleiben erhalten, Pipeline kommt dazu', () => {
    const vorher = { version: 1, qualifikation: 'pflegehelfer', sprachen: ['deutsch'] }
    const nachher = mitPipelineStufe(vorher, 'vorgeprueft', JETZT, 'Verwaltung')
    expect(nachher).toMatchObject({ version: 1, qualifikation: 'pflegehelfer', sprachen: ['deutsch'] })
    expect(nachher.pipeline).toEqual({
      stufe: 'vorgeprueft', seit: JETZT.toISOString(),
      verlauf: [{ stufe: 'vorgeprueft', am: JETZT.toISOString(), von: 'Verwaltung' }],
    })
    // Eingabe unverändert
    expect((vorher as any).pipeline).toBeUndefined()
  })

  it('Altbestand ohne jsonb bekommt nur die Pipeline — und gilt NICHT als Formularangabe', () => {
    const nachher = mitPipelineStufe(null, 'rueckfrage', JETZT, null)
    expect(Object.keys(nachher)).toEqual(['pipeline'])
    expect(hatFormularangaben(nachher)).toBe(false)
    expect(hatFormularangaben({ version: 1 })).toBe(true)
  })

  it('Verlauf wird fortgeschrieben und gedeckelt', () => {
    let d: unknown = null
    for (let i = 0; i < VERLAUF_MAX + 5; i++) {
      d = mitPipelineStufe(d, i % 2 ? 'rueckfrage' : 'vorgeprueft', new Date(JETZT.getTime() + i * 1000), null)
    }
    expect((d as any).pipeline.verlauf).toHaveLength(VERLAUF_MAX)
  })
})

describe('Automatische Wiedervorlage', () => {
  it('setzt heute + Stufenfrist (Berliner Kalendertag)', () => {
    expect(naechsteWiedervorlage('vorgeprueft', JETZT)).toBe('2026-09-13')
    expect(naechsteWiedervorlage('vorstellungsgespraech', JETZT)).toBe('2026-09-18')
    expect(naechsteWiedervorlage('unterlagen', JETZT)).toBe('2026-09-16')
  })

  it('Endzustand: keine Wiedervorlage', () => {
    expect(naechsteWiedervorlage('einsatzbereit', JETZT)).toBeNull()
    expect(naechsteWiedervorlage('abgelehnt', JETZT)).toBeNull()
  })

  it('NEU: 24/48/72 h ab Eingang — auch ohne follow_up_date', () => {
    expect(followUpFuerBewerbung({ stufe: 'neu', created_at: vor(30), follow_up_date: null }, JETZT)).toBe('erinnerung')
    expect(followUpFuerBewerbung({ stufe: 'neu', created_at: vor(80), follow_up_date: null }, JETZT)).toBe('dringend')
  })

  it('spätere Stufe: gesetzte follow_up_date zählt', () => {
    const e = { stufe: 'rueckfrage', created_at: vor(500), follow_up_date: '2026-09-11' }
    expect(wiedervorlageFuerBewerbung(e)).toBe('2026-09-11T00:00:00.000Z')
    expect(followUpFuerBewerbung(e, JETZT)).toBe('erinnerung')
    expect(followUpFuerBewerbung({ ...e, follow_up_date: '2026-09-08' }, JETZT)).toBe('dringend')
    expect(followUpFuerBewerbung({ ...e, follow_up_date: '2026-09-20' }, JETZT)).toBe('keine')
  })

  it('offene Stufe ohne Datum fällt NICHT aus der Wiedervorlage (Frist ab letzter Änderung)', () => {
    const e = { stufe: 'vorgeprueft', created_at: vor(500), updated_at: vor(100), follow_up_date: null }
    expect(wiedervorlageFuerBewerbung(e)).not.toBeNull()
    expect(followUpFuerBewerbung(e, JETZT)).not.toBe('keine')
  })

  it('Endzustand: nie fällig', () => {
    expect(followUpFuerBewerbung({ stufe: 'einsatzbereit', created_at: vor(999), follow_up_date: '2026-01-01' }, JETZT)).toBe('keine')
  })
})
