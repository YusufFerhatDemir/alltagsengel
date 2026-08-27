// ═══════════════════════════════════════════════════════════════════════
// Versand-Guard (lib/abrechnung/versand-guard.ts)
//
// Die Sperre, die vor einer echten Übermittlung an die Datenannahmestelle
// sitzt. Bis hierher ohne Test — obwohl sie genau die Eigenschaft hat, die
// man nicht durch Ansehen prüfen kann:
//
//   Sie gibt KEINEN Wahrheitswert zurück, sondern wirft. Wer sie aufruft
//   und das Ergebnis ignoriert, ist trotzdem gesperrt. Ein `return false`
//   an derselben Stelle wäre durch einen vergessenen If-Zweig still
//   umgehbar — und was dann hinausgeht, erzeugt eine Forderung bei der
//   Kasse.
//
// Zweite Eigenschaft, die hier festgeschrieben wird: WELCHE Ampeln
// blockieren. Gelb (z. B. ein bald ablaufendes Zertifikat) darf die
// laufende Lieferung nicht anhalten, und der Punkt „erstversand" ist per
// Definition rot, solange nie gesendet wurde — er darf sich nicht selbst
// im Weg stehen.
// ═══════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Ampel, ReadinessErgebnis, ReadinessPunkt } from '@/lib/abrechnung/readiness'

const ermittleReadiness = vi.fn()
vi.mock('@/lib/abrechnung/readiness', () => ({
  ermittleReadiness: (...args: unknown[]) => ermittleReadiness(...args),
}))

const { pruefeVersandbereitschaft, VersandGesperrtError } = await import('@/lib/abrechnung/versand-guard')

const ORG = '00000000-0000-4000-8000-000460629986'
const supabase = {} as never

function punkt(id: string, ampel: Ampel, hinweis: string | null = null): ReadinessPunkt {
  return {
    id,
    label: `Punkt ${id}`,
    ampel,
    wert: null,
    hinweis,
    blocker: ampel === 'gruen' ? null : 'intern',
    gruppe: 'betrieb',
  }
}

function readiness(punkte: ReadinessPunkt[]): ReadinessErgebnis {
  return {
    organizationId: ORG,
    organisation: 'Alltagsengel',
    ik_nummer: '460629986',
    gesamt: punkte.some(p => p.ampel === 'rot') ? 'rot' : punkte.some(p => p.ampel === 'gelb') ? 'gelb' : 'gruen',
    versandbereit: punkte.every(p => p.ampel === 'gruen'),
    modus: 'produktion',
    punkte,
    zusammenfassung: {
      gruen: punkte.filter(p => p.ampel === 'gruen').length,
      gelb: punkte.filter(p => p.ampel === 'gelb').length,
      rot: punkte.filter(p => p.ampel === 'rot').length,
      gesamt: punkte.length,
    },
    offeneBlocker: { intern: [], extern: [] },
  } as ReadinessErgebnis
}

beforeEach(() => {
  ermittleReadiness.mockReset()
})

// ---------------------------------------------------------------------------

describe('pruefeVersandbereitschaft — der freigegebene Fall', () => {
  it('kehrt zurück, wenn alle Punkte grün sind', async () => {
    ermittleReadiness.mockResolvedValue(readiness([
      punkt('ik', 'gruen'), punkt('zertifikat', 'gruen'), punkt('transportweg', 'gruen'),
    ]))
    await expect(pruefeVersandbereitschaft(supabase, ORG)).resolves.toBeUndefined()
  })

  it('bewertet genau die übergebene Organisation', async () => {
    ermittleReadiness.mockResolvedValue(readiness([punkt('ik', 'gruen')]))
    await pruefeVersandbereitschaft(supabase, ORG)
    expect(ermittleReadiness).toHaveBeenCalledWith(supabase, ORG)
  })

  it('lässt gelbe Punkte durch — Vorwarnung, kein Hindernis', async () => {
    ermittleReadiness.mockResolvedValue(readiness([
      punkt('zertifikat', 'gelb', 'läuft in 20 Tagen ab'),
      punkt('ik', 'gruen'),
    ]))
    await expect(pruefeVersandbereitschaft(supabase, ORG)).resolves.toBeUndefined()
  })

  it('lässt den roten Punkt "erstversand" durch — sonst wäre der erste Versand nie möglich', async () => {
    ermittleReadiness.mockResolvedValue(readiness([
      punkt('erstversand', 'rot', 'noch nie gesendet'),
      punkt('ik', 'gruen'),
    ]))
    await expect(pruefeVersandbereitschaft(supabase, ORG)).resolves.toBeUndefined()
  })
})

describe('pruefeVersandbereitschaft — die Sperre', () => {
  it('wirft VersandGesperrtError, sobald ein anderer Punkt rot ist', async () => {
    ermittleReadiness.mockResolvedValue(readiness([
      punkt('zertifikat', 'rot', 'abgelaufen'),
      punkt('ik', 'gruen'),
    ]))
    await expect(pruefeVersandbereitschaft(supabase, ORG))
      .rejects.toBeInstanceOf(VersandGesperrtError)
  })

  it('wirft, statt einen Wahrheitswert zu liefern — ein ignoriertes Ergebnis sperrt trotzdem', async () => {
    ermittleReadiness.mockResolvedValue(readiness([punkt('zertifikat', 'rot')]))
    let durchgelaufen = false
    try {
      // Genau das Aufrufmuster, das bei einer `return false`-Sperre
      // stillschweigend weiterlaufen würde.
      await pruefeVersandbereitschaft(supabase, ORG)
      durchgelaufen = true
    } catch {
      /* erwartet */
    }
    expect(durchgelaufen).toBe(false)
  })

  it('nennt alle roten Punkte, nicht nur den ersten', async () => {
    ermittleReadiness.mockResolvedValue(readiness([
      punkt('zertifikat', 'rot', 'abgelaufen'),
      punkt('transportweg', 'rot', 'kein SFTP-Zugang'),
      punkt('ik', 'gruen'),
    ]))
    const fehler = await pruefeVersandbereitschaft(supabase, ORG).catch(e => e as InstanceType<typeof VersandGesperrtError>)
    expect(fehler.gruende).toHaveLength(2)
    expect(fehler.gruende.join(' ')).toContain('Punkt zertifikat')
    expect(fehler.gruende.join(' ')).toContain('Punkt transportweg')
  })

  it('zählt "erstversand" nicht mit, wenn daneben ein echter Blocker steht', async () => {
    ermittleReadiness.mockResolvedValue(readiness([
      punkt('erstversand', 'rot'),
      punkt('zertifikat', 'rot', 'abgelaufen'),
    ]))
    const fehler = await pruefeVersandbereitschaft(supabase, ORG).catch(e => e as InstanceType<typeof VersandGesperrtError>)
    expect(fehler.gruende).toEqual(['Punkt zertifikat (abgelaufen)'])
  })

  it('sagt in der Meldung ausdrücklich, dass nichts übermittelt wurde', async () => {
    // Der Satz steht im Fehler, damit im Betrieb niemand raten muss, ob die
    // Datei halb draußen ist. Eine halb übermittelte Lieferung wäre eine
    // fehlerhafte Forderung.
    ermittleReadiness.mockResolvedValue(readiness([punkt('zertifikat', 'rot')]))
    const fehler = await pruefeVersandbereitschaft(supabase, ORG).catch(e => e as Error)
    expect(fehler.message).toContain('VERSAND_GESPERRT')
    expect(fehler.message).toMatch(/nichts übermittelt/)
    expect(fehler.message).toMatch(/keine Forderung/)
    expect(fehler.name).toBe('VersandGesperrtError')
  })

  it('reicht einen Fehler der Readiness-Ermittlung durch, statt ihn als "bereit" zu lesen', async () => {
    // Fail-closed: wer die Voraussetzungen nicht ermitteln kann, darf nicht
    // senden.
    ermittleReadiness.mockRejectedValue(new Error('DB nicht erreichbar'))
    await expect(pruefeVersandbereitschaft(supabase, ORG)).rejects.toThrow('DB nicht erreichbar')
  })
})
