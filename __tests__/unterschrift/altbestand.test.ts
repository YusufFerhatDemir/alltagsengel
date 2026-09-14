/**
 * Altbestand ohne Unterschriftsbeleg — Grundlinie statt Dauerrot
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 49, 14.09.2026)
 *
 * `npm run verify:unterschrift` endete mit exit 1 — seit Wochen, und aus
 * EINEM Grund: Station U10 meldet eine Bestandszeile mit
 * `status='invoiced'` ohne Unterschriftsbeleg.
 *
 * Die Messung ist richtig und bleibt es. Nur wird sie niemand mehr
 * beheben: den Hash nachzutragen waere eine Faelschung (der Zeitpunkt
 * der Unterschrift ist unbekannt, und der Hash bildet ihn mit ab).
 *
 * Die Folge war schlimmer als der Befund. Ein Prueflauf, der IMMER rot
 * ist, wird nicht mehr gelesen — eine NEUE abgerechnete Zeile ohne
 * Beleg, also genau das, was U10 bewachen soll, waere in derselben roten
 * Meldung untergegangen.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ALTBESTAND_OHNE_BELEG, bewerteAltbestand, istBefund, altbestandsMeldung,
} from '@/lib/unterschrift/altbestand'

const BEKANNT = ALTBESTAND_OHNE_BELEG[0].id
const FREMD = '00000000-0000-4000-8000-0000000000ff'

describe('bewerteAltbestand', () => {
  it('erkennt die bekannte Zeile als bekannt', () => {
    const b = bewerteAltbestand([BEKANNT])
    expect(b.bekannt).toEqual([BEKANNT])
    expect(b.neu).toEqual([])
    expect(b.verschwunden).toEqual([])
  })

  it('erkennt eine unbekannte Zeile als NEU', () => {
    const b = bewerteAltbestand([BEKANNT, FREMD])
    expect(b.neu).toEqual([FREMD])
    expect(b.bekannt).toEqual([BEKANNT])
  })

  it('meldet eine verschwundene Grundlinien-Zeile', () => {
    // Eine Liste, die niemand leert, wird zur Legende: sie behauptet eine
    // Luecke, die es nicht mehr gibt.
    const b = bewerteAltbestand([])
    expect(b.verschwunden).toEqual([BEKANNT])
  })

  it('ist fail-closed bei allem Unbekannten', () => {
    // Was nicht namentlich in der Grundlinie steht, ist neu — auch wenn
    // es aussieht wie die anderen.
    expect(bewerteAltbestand([FREMD]).neu).toEqual([FREMD])
  })
})

describe('istBefund — rot nur bei NEU', () => {
  it('die bekannte Zeile allein ist kein Befund', () => {
    expect(istBefund(bewerteAltbestand([BEKANNT]))).toBe(false)
  })

  it('eine neue Zeile ist ein Befund', () => {
    expect(istBefund(bewerteAltbestand([FREMD]))).toBe(true)
  })

  it('eine verschwundene Zeile ist KEIN Befund — nur ein Hinweis', () => {
    // Sonst waere der Lauf ab dem Tag rot, an dem das Problem behoben ist.
    expect(istBefund(bewerteAltbestand([]))).toBe(false)
  })

  it('ein leerer Bestand ist grün', () => {
    expect(istBefund(bewerteAltbestand([]))).toBe(false)
  })
})

describe('altbestandsMeldung', () => {
  it('nennt die bekannte Zeile mit Datum und Grund', () => {
    const m = altbestandsMeldung(bewerteAltbestand([BEKANNT]))
    expect(m).toContain(BEKANNT)
    expect(m).toContain('2026-06-24')
    expect(m).toContain('Faelschung')
  })

  it('sagt bei einer neuen Zeile ausdruecklich, dass es KEIN Altbestand ist', () => {
    const m = altbestandsMeldung(bewerteAltbestand([FREMD]))
    expect(m).toContain('NEUE')
    expect(m).toContain('kein Altbestand')
  })

  it('fordert bei einer verschwundenen Zeile zum Nachziehen auf', () => {
    expect(altbestandsMeldung(bewerteAltbestand([]))).toContain('nachziehen')
  })
})

describe('die Grundlinie selbst', () => {
  it('fuehrt genau die eine am 14.09.2026 gemessene Zeile', () => {
    expect(ALTBESTAND_OHNE_BELEG).toHaveLength(1)
  })

  it('jede Zeile traegt Kennung, Datum und Grund', () => {
    for (const z of ALTBESTAND_OHNE_BELEG) {
      expect(z.id).toMatch(/^[0-9a-f-]{36}$/)
      expect(z.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(z.grund.length).toBeGreaterThan(60)
    }
  })

  it('verweist auf die Geschaeftsentscheidung, statt sie zu wiederholen', () => {
    for (const z of ALTBESTAND_OHNE_BELEG) {
      expect(z.grund).toContain('UNTERSCHRIFT_ALTBESTAND')
    }
  })

  it('keine Kennung doppelt', () => {
    const ids = ALTBESTAND_OHNE_BELEG.map(z => z.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('der Prueflauf benutzt die Grundlinie', () => {
  const quelle = readFileSync('scripts/verify-unterschrift-integritaet.mjs', 'utf8')

  it('U10 misst gegen die Grundlinie, nicht gegen Null', () => {
    expect(quelle).toContain('bewerteAltbestand(')
    expect(quelle).toContain('!istBefund(altbestand)')
    expect(quelle).not.toContain('abgerechnetOhneBeleg.length === 0')
  })

  it('benutzt dieselbe Beleg-Definition wie der Rechnungsweg', () => {
    // Waeren es zwei Definitionen, prueft U10 eine andere Menge als die,
    // die abgerechnet wird — und waere gruen, ohne etwas zu bedeuten.
    expect(quelle).toContain('unterschriftBelegt(r)')
  })

  it('nennt die bekannte Zeile weiterhin im Lauf', () => {
    // Eine Grundlinie ist keine Entschuldigung: sie macht die Zeile
    // sichtbar, statt sie verschwinden zu lassen.
    expect(quelle).toContain('altbestandsMeldung(altbestand)')
  })
})
