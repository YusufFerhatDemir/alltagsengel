/**
 * Kette 13 — Feiertagskatalog gefuellt halten.
 * Lueckenanalyse Bereich 7, P2: `billing_feiertage` war live leer und
 * `importiereFeiertage()` hatte ausser den Tests keinen Aufrufer.
 * @see lib/automation/feiertage-pflege.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createAutomationMock } from './_mock'
import { pflegeFeiertagskatalog } from '@/lib/automation/feiertage-pflege'
import { bundesweiteFeiertage, landesFeiertage } from '@/lib/billing/core/feiertage'
import { BUNDESLAND_CODES } from '@/lib/expansion/types'

const HEUTE = new Date('2026-06-09T08:00:00Z')

/** Erwartete Zeilenzahl je Jahr: 9 bundesweite + alle Landesfeiertage. */
function erwarteteZeilen(jahr: number): number {
  return bundesweiteFeiertage(jahr).length
    + BUNDESLAND_CODES.reduce((n, bl) => n + landesFeiertage(jahr, bl).length, 0)
}

describe('pflegeFeiertagskatalog', () => {
  let mock: ReturnType<typeof createAutomationMock>

  beforeEach(() => {
    mock = createAutomationMock()
  })

  it('pflegt ohne Angabe laufendes UND Folgejahr', async () => {
    mock.setzeAntwort('billing_feiertage', 'insert', null)

    const r = await pflegeFeiertagskatalog(mock.client as any, undefined, HEUTE)

    expect(r.jahre).toEqual([2026, 2027])
    expect(r.fehler).toEqual([])
    expect(r.importiert).toBe(erwarteteZeilen(2026) + erwarteteZeilen(2027))
  })

  it('schreibt nur Feiertagsdaten — keinen Zuschlagssatz', async () => {
    mock.setzeAntwort('billing_feiertage', 'insert', null)

    await pflegeFeiertagskatalog(mock.client as any, [2026], HEUTE)

    const zeilen = mock.inserts.filter(i => i.table === 'billing_feiertage')
    expect(zeilen.length).toBeGreaterThan(0)
    for (const z of zeilen) {
      expect(Object.keys(z.payload).sort()).toEqual(['bezeichnung', 'bundesland', 'datum'])
    }
    // Es wird ausschliesslich in den Katalog geschrieben, nie in Tarife.
    expect(mock.inserts.some(i => i.table === 'billing_tariffs')).toBe(false)
  })

  it('deckt alle 16 Bundeslaender plus die bundesweiten Tage ab', async () => {
    mock.setzeAntwort('billing_feiertage', 'insert', null)

    await pflegeFeiertagskatalog(mock.client as any, [2026], HEUTE)

    const laender = new Set(
      mock.inserts
        .filter(i => i.table === 'billing_feiertage')
        .map(i => i.payload.bundesland),
    )
    expect(laender.has(null)).toBe(true) // bundesweit
    for (const code of BUNDESLAND_CODES) {
      expect(laender.has(code)).toBe(true)
    }
  })

  it('ein zweiter Lauf zaehlt Dubletten als vorhanden, nicht als Fehler', async () => {
    mock.setzeAntwort('billing_feiertage', 'insert', null, {
      code: '23505',
      message: 'duplicate key value violates unique constraint "unique_feiertag_datum_bl"',
    })

    const r = await pflegeFeiertagskatalog(mock.client as any, [2026], HEUTE)

    expect(r.importiert).toBe(0)
    expect(r.vorhanden).toBe(erwarteteZeilen(2026))
    expect(r.fehler).toEqual([])
  })

  it('echte Fehler werden benannt und NICHT als vorhanden verbucht', async () => {
    // Genau der Fall, den die alte Fassung verschluckte: ein Lauf, der nichts
    // geschrieben hat, sah aus wie ein Lauf, bei dem schon alles stand.
    mock.setzeAntwort('billing_feiertage', 'insert', null, {
      code: '42P01',
      message: 'relation "billing_feiertage" does not exist',
    })

    const r = await pflegeFeiertagskatalog(mock.client as any, [2026], HEUTE)

    expect(r.importiert).toBe(0)
    expect(r.vorhanden).toBe(0)
    expect(r.fehler.length).toBe(erwarteteZeilen(2026))
    expect(r.fehler[0]).toContain('does not exist')
    expect(r.fehler[0]).toContain('2026:')
  })
})
