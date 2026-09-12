/**
 * Kampagnen-Herkunft der Formulare.
 * @see lib/marketing/utm.ts
 *
 * Befund 12.09.2026: drei von sechs Formularen schickten gar keine Herkunft,
 * die übrigen lasen nur die aktuelle URL — wer über eine Anzeige landete und
 * auf einer anderen Seite absendete, kam ohne Kampagne an.
 */
import { describe, it, expect } from 'vitest'
import { utmAus, UTM_LEER, type Leser } from '@/lib/marketing/utm'

const speicher = (werte: Record<string, string>): Leser => ({ getItem: k => werte[k] ?? null })
const kaputt: Leser = { getItem: () => { throw new Error('privater Modus') } }

describe('utmAus', () => {
  it('liest die Parameter der aktuellen URL', () => {
    expect(utmAus('?utm_source=google&utm_medium=cpc&utm_campaign=pflege24')).toEqual({
      utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'pflege24',
    })
  })

  it('ohne Parameter: gespeicherte Attribution des Besuchs (sessionStorage)', () => {
    const s = speicher({ attr_utm_source: 'instagram', attr_utm_campaign: 'reels_09' })
    expect(utmAus('', [s])).toEqual({ utm_source: 'instagram', utm_medium: '', utm_campaign: 'reels_09' })
  })

  it('URL schlägt Speicher', () => {
    const s = speicher({ attr_utm_source: 'alt' })
    expect(utmAus('?utm_source=neu', [s]).utm_source).toBe('neu')
  })

  it('sessionStorage schlägt localStorage (First-Touch ist nur der Rückfall)', () => {
    const sitzung = speicher({ attr_utm_source: 'sitzung' })
    const dauerhaft = speicher({ attr_utm_source: 'first-touch' })
    expect(utmAus('', [sitzung, dauerhaft]).utm_source).toBe('sitzung')
    expect(utmAus('', [null, dauerhaft]).utm_source).toBe('first-touch')
  })

  it('`?source=` gilt als Herkunft (Landingpages /lp/[source])', () => {
    expect(utmAus('?source=pflegestuetzpunkt').utm_source).toBe('pflegestuetzpunkt')
    // utm_source gewinnt, wenn beide da sind
    expect(utmAus('?source=a&utm_source=b').utm_source).toBe('b')
  })

  it('gesperrter Speicher (privater Modus) wirft nicht, nächster Speicher zählt', () => {
    const dauerhaft = speicher({ attr_utm_source: 'gerettet' })
    expect(utmAus('', [kaputt, dauerhaft]).utm_source).toBe('gerettet')
    expect(utmAus('', [kaputt])).toEqual(UTM_LEER)
  })

  it('nichts bekannt → leere Werte, kein undefined', () => {
    expect(utmAus('')).toEqual(UTM_LEER)
    expect(utmAus('?utm_source=')).toEqual(UTM_LEER)
  })

  it('kappt Länge und entfernt Zeilenumbrüche (Header-/Feldschutz)', () => {
    const lang = 'x'.repeat(300)
    expect(utmAus(`?utm_source=${lang}`).utm_source).toHaveLength(120)
    expect(utmAus('?utm_campaign=a%0D%0Ab').utm_campaign).toBe('a b')
  })
})
