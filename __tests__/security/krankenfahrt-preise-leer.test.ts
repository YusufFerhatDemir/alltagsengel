/**
 * Eine leere Preisliste lädt dazu ein, sie noch einmal anzulegen
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 88) — aus dem Bestand, den Block 79 sichtbar gemacht hat.
 *
 * Drei Flächen derselben Sache: das Preissystem der Krankenfahrten.
 *
 * 1. GET /api/admin/pricing — derselbe Endpunkt, ZWEI Maßstäbe. Der
 *    Einzelabruf wirft bei einem Lesefehler (`if (dbErr) throw dbErr`);
 *    der Sammelabruf wenige Zeilen darüber gab leere Listen zurück.
 *
 * 2. /mis/krankenfahrt-pricing — dort werden die Preise GEPFLEGT. Eine
 *    leere Liste lädt dazu ein, sie neu anzulegen; danach stünden sie
 *    doppelt.
 *
 * 3. GET /api/admin/krankenfahrten — aus `rides` entstehen unmittelbar
 *    die Kennzahlen. Null Fahrten wären von einem ruhigen Tag nicht zu
 *    unterscheiden.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const PRICING = readFileSync('app/api/admin/pricing/route.ts', 'utf8')
const FAHRTEN = readFileSync('app/api/admin/krankenfahrten/route.ts', 'utf8')
const SEITE = readFileSync('app/mis/krankenfahrt-pricing/page.tsx', 'utf8')

const FLAECHEN: Array<[string, string, string[]]> = [
  ['Pricing-Route', PRICING, ['tiers.error', 'surcharges.error', 'regions.error', 'config.error', 'audit.error']],
  ['Fahrten-Route', FAHRTEN, ['ridesRes.error', 'providersRes.error', 'reviewsRes.error']],
  ['Preisseite', SEITE, ['tiersRes.error', 'surchargesRes.error', 'regionsRes.error', 'configRes.error', 'auditRes.error']],
]

describe('Jede der drei Flächen prüft ihre Quellen', () => {
  for (const [name, quelle, felder] of FLAECHEN) {
    it(`${name}: alle ${felder.length} Abfragen`, () => {
      const teil = quelle.slice(quelle.indexOf('const nichtLesbar = ([')).slice(0, 700)
      for (const f of felder) expect(teil, f).toContain(f)
    })

    it(`${name}: die Fehlerliste entsteht aus den Fehlern`, () => {
      expect(quelle).toContain('] as const).filter(([, fehler]) => fehler != null).map(([name]) => name)')
    })

    it(`${name}: und der Zweig dahinter meldet es`, () => {
      const ab = quelle.indexOf('if (nichtLesbar.length > 0)')
      expect(ab).toBeGreaterThan(-1)
      expect(quelle.slice(ab, ab + 800)).toMatch(/status: 503|setLadefehler\(/)
    })
  }
})

describe('Die Routen antworten mit 503 statt mit leeren Listen', () => {
  it('Pricing: vor der Antwort', () => {
    expect(PRICING.indexOf('if (nichtLesbar.length > 0)'))
      .toBeLessThan(PRICING.indexOf('tiers: tiers.data || []'))
  })

  it('Pricing: der Einzelabruf wirft weiterhin', () => {
    // Er war schon richtig — die Asymmetrie war der Befund.
    expect(PRICING).toContain('if (dbErr) throw dbErr')
  })

  it('Fahrten: vor der Kennzahlbildung', () => {
    expect(FAHRTEN.indexOf('if (nichtLesbar.length > 0)'))
      .toBeLessThan(FAHRTEN.indexOf('const rides = ridesRes.data || []'))
  })

  it('Fahrten: nennt die Folge beim Namen', () => {
    expect(FAHRTEN).toMatch(/ruhigen Tag/)
  })
})

describe('Die Pflegeseite zeigt keine leere Preisliste', () => {
  it('leert alle fünf Zustände', () => {
    const ab = SEITE.indexOf('if (nichtLesbar.length > 0)')
    const teil = SEITE.slice(ab, ab + 900)
    for (const setzer of ['setTiers([])', 'setSurcharges([])', 'setRegions([])', 'setConfig([])', 'setAudit([])']) {
      expect(teil, setzer).toContain(setzer)
    }
  })

  it('und zeigt statt der Kacheln den Grund', () => {
    expect(SEITE).toContain('if (ladefehler) {')
    expect(SEITE).toMatch(/lädt dazu ein, sie ein zweites Mal anzulegen/)
  })

  it('der Zustand wird bei jedem Laden zurückgesetzt', () => {
    expect(SEITE).toContain('setLadefehler(null)')
  })
})

describe('Der Bestand ist mitgezogen', () => {
  it('und ist weiter gesunken', async () => {
    const { BESTAND_GEBUENDELT } = await import('../../scripts/lint-leerzustand')
    expect(BESTAND_GEBUENDELT.length).toBeLessThanOrEqual(11)
    for (const teil of ['admin/pricing', 'admin/krankenfahrten', 'krankenfahrt-pricing']) {
      expect(BESTAND_GEBUENDELT.some(e => e.datei.includes(teil)), teil).toBe(false)
    }
  })
})
