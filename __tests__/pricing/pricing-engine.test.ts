/**
 * Krankenfahrt-Preisrechner (lib/pricing-engine.ts)
 *
 * Diese Datei sagt dem Kunden verbindlich, was eine Fahrt kostet. Sie hat
 * eine Eigenschaft, die sie von den uebrigen Geldwegen unterscheidet: einen
 * prozessweiten Cache mit fuenf Minuten Haltbarkeit. Was hier einmal falsch
 * geladen wurde, ist fuenf Minuten lang die Wahrheit fuer JEDE Anfrage.
 *
 * Die Preistabellen kf_pricing_* tragen KEINE organization_id (Baseline
 * 20260101000000) — sie sind eine gemeinsame Liste, kein Mandantenbestand.
 * Der Cache ist deshalb kein Mandantenleck; getestet wird stattdessen, was
 * er wirklich gefaehrlich macht: dass ein Lesefehler nicht als "keine
 * Zeilen" hineinlaeuft und dort festfriert.
 *
 * Alle Zahlen unten sind Testwerte, keine echten Tarife. Der Rechner darf
 * ohnehin keinen Preis kennen — er bekommt jeden aus der Datenbank.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { erstelleFakeSupabase, hatFilter, type FakeAufruf, type FakeAntwort } from '../helpers/supabase-fake'

// ---------------------------------------------------------------------------
// Der Rechner holt seinen Client selbst (`createClient()` aus
// lib/supabase/server) statt ihn injiziert zu bekommen — anders als die
// billing/*-Module. Deshalb hier ueber vi.mock statt ueber ein Argument.
// ---------------------------------------------------------------------------

let antwort: (a: FakeAufruf) => FakeAntwort = () => ({ data: [] })
let letzterFake = erstelleFakeSupabase(a => antwort(a))
let flags: Record<string, boolean> = {}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => letzterFake.client,
}))
vi.mock('@/lib/feature-flags', () => ({
  isFeatureEnabled: async (name: string) => flags[name] === true,
}))

const {
  calculatePrice,
  calculatePriceExtended,
  calculateCosts,
  calculateMargin,
  evaluateReviewRules,
  getConfigValue,
  invalidatePricingCache,
  PreisdatenNichtLesbarError,
} = await import('@/lib/pricing-engine')

// --- Testtarife (frei erfunden, runde Zahlen zum Nachrechnen) --------------

const TIER = {
  id: 'tier-1', name: 'Testklasse', slug: 'test', description: null,
  base_price: 20, per_km_rate: 2, min_price: 30, wait_per_min: 0.5,
  surcharge_amount: 10, icon: null, enabled: true, sort_order: 1,
}
const ZUSCHLAG_FEST = {
  id: 'sc-1', name: 'Treppenhilfe', slug: 'stair_assistance', description: null,
  surcharge_type: 'fixed', value: 5, applies_to: [], enabled: true, sort_order: 1,
}
const ZUSCHLAG_PROZENT = {
  id: 'sc-2', name: 'Nachtzuschlag', slug: 'night_premium', description: null,
  surcharge_type: 'percentage', value: 25, applies_to: [], enabled: true, sort_order: 2,
}

interface Welt {
  tiers?: FakeAntwort
  surcharges?: FakeAntwort
  config?: FakeAntwort
  regions?: FakeAntwort
  costs?: FakeAntwort
  rules?: FakeAntwort
}

function welt(w: Welt = {}) {
  antwort = (a: FakeAufruf): FakeAntwort => {
    switch (a.tabelle) {
      case 'kf_pricing_tiers':      return w.tiers ?? { data: [TIER] }
      case 'kf_pricing_surcharges': return w.surcharges ?? { data: [ZUSCHLAG_FEST, ZUSCHLAG_PROZENT] }
      case 'kf_pricing_config':     return w.config ?? { data: [] }
      case 'kf_pricing_regions':    return w.regions ?? { data: null, error: null }
      case 'kf_pricing_costs':      return w.costs ?? { data: null, error: null }
      case 'kf_review_rules':       return w.rules ?? { data: [] }
      default:                      return { data: null, error: null }
    }
  }
  letzterFake = erstelleFakeSupabase(a => antwort(a))
  return letzterFake
}

beforeEach(() => {
  invalidatePricingCache()
  flags = {}
  welt()
})

// ═══════════════════════════════════════════════════════════════════════
// 1 — Rechenweg
// ═══════════════════════════════════════════════════════════════════════

describe('calculatePrice — Rechenweg', () => {
  it('addiert Grundpreis, Strecke, Wartezeit und Transportzuschlag', async () => {
    const b = await calculatePrice({ tier_slug: 'test', estimated_km: 10, estimated_wait_minutes: 20 })
    expect(b.base_price).toBe(20)
    expect(b.distance_cost).toBe(20)   // 10 km × 2
    expect(b.wait_cost).toBe(10)       // 20 min × 0,50
    expect(b.tier_surcharge).toBe(10)
    expect(b.subtotal).toBe(60)
    expect(b.total).toBe(60)
  })

  it('rechnet den Prozentzuschlag auf die Zwischensumme, nicht auf den laufenden Betrag', async () => {
    const b = await calculatePrice({
      tier_slug: 'test', estimated_km: 10,
      extra_surcharges: ['stair_assistance', 'night_premium'],
    })
    // subtotal = 20 + 20 + 0 + 10 = 50; Prozent auf 50, nicht auf 55.
    expect(b.subtotal).toBe(50)
    expect(b.surcharges.find(s => s.slug === 'night_premium')?.amount).toBe(12.5)
    expect(b.surcharges_total).toBe(17.5)
    expect(b.total).toBe(67.5)
  })

  it('setzt den Nachtzuschlag ueber das Kennzeichen nicht doppelt an', async () => {
    const b = await calculatePrice({
      tier_slug: 'test', estimated_km: 10, is_night: true,
      extra_surcharges: ['night_premium'],
    })
    expect(b.surcharges.filter(s => s.slug === 'night_premium')).toHaveLength(1)
  })

  it('hebt auf den Mindestpreis an und weist ihn aus', async () => {
    welt({ tiers: { data: [{ ...TIER, base_price: 5, surcharge_amount: 0, min_price: 30 }] } })
    invalidatePricingCache()
    const b = await calculatePrice({ tier_slug: 'test', estimated_km: 0 })
    expect(b.is_min_price_applied).toBe(true)
    expect(b.total).toBe(30)
    expect(b.display_lines.some(l => l.includes('Mindestpreis'))).toBe(true)
  })

  it('Hin- und Rueckfahrt verdoppelt AUCH den Mindestpreis (dokumentiert, nicht zufaellig)', async () => {
    welt({ tiers: { data: [{ ...TIER, base_price: 5, surcharge_amount: 0, min_price: 30 }] } })
    invalidatePricingCache()
    const b = await calculatePrice({ tier_slug: 'test', estimated_km: 0, is_return_trip: true })
    expect(b.return_trip_multiplier).toBe(2)
    expect(b.total).toBe(60)
  })

  it('negative Kilometer werden auf 0 gekappt, nicht abgezogen', async () => {
    const b = await calculatePrice({ tier_slug: 'test', estimated_km: -100 })
    expect(b.distance_cost).toBe(0)
    expect(b.total).toBeGreaterThan(0)
  })

  it('unbekannter Tarif wirft', async () => {
    await expect(calculatePrice({ tier_slug: 'gibtsnicht', estimated_km: 5 }))
      .rejects.toThrow(/nicht gefunden/)
  })

  it('die Anzeigezeilen nennen jeden Posten und schliessen mit dem Gesamtpreis', async () => {
    const b = await calculatePrice({
      tier_slug: 'test', estimated_km: 10, estimated_wait_minutes: 20,
      extra_surcharges: ['stair_assistance'],
    })
    expect(b.display_lines[b.display_lines.length - 1]).toMatch(/^Gesamtpreis:/)
    expect(b.display_lines.some(l => l.includes('Wartezeit'))).toBe(true)
    expect(b.display_lines.some(l => l.includes('Treppenhilfe'))).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 2 — Die stillen Geldfehler
// ═══════════════════════════════════════════════════════════════════════

describe('calculatePrice — stille Fehler, die den Preis senken', () => {
  it('BEFUND: unbekannter Zuschlags-Schluessel wirft, statt lautlos zu entfallen', async () => {
    await expect(calculatePrice({
      tier_slug: 'test', estimated_km: 10, extra_surcharges: ['gibts_nicht_mehr'],
    })).rejects.toThrow(/gibts_nicht_mehr/)
  })

  it('BEFUND: NaN als Kilometerangabe wirft, statt "NaN €" auszuweisen', async () => {
    await expect(calculatePrice({ tier_slug: 'test', estimated_km: Number.NaN }))
      .rejects.toThrow(/estimated_km/)
    await expect(calculatePrice({ tier_slug: 'test', estimated_km: 5, estimated_wait_minutes: Number.POSITIVE_INFINITY }))
      .rejects.toThrow(/estimated_wait_minutes/)
  })

  it('fehlende Mengenangaben bleiben 0 — nur Unbrauchbares wirft', async () => {
    const b = await calculatePrice({ tier_slug: 'test' } as never)
    expect(b.distance_cost).toBe(0)
    expect(b.wait_cost).toBe(0)
  })

  it('BEFUND: Lesefehler auf die Preistabelle wirft und wird NICHT gecacht', async () => {
    welt({ tiers: { data: null, error: { message: 'permission denied' } } })
    await expect(calculatePrice({ tier_slug: 'test', estimated_km: 5 }))
      .rejects.toBeInstanceOf(PreisdatenNichtLesbarError)

    // Direkt danach mit gesunder Datenbank: haette der Fehlversuch den
    // leeren Cache gefuellt, waere die Preisauskunft jetzt fuenf Minuten
    // lang tot.
    welt()
    const b = await calculatePrice({ tier_slug: 'test', estimated_km: 5 })
    expect(b.total).toBeGreaterThan(0)
  })

  it('auch ein Lesefehler auf Zuschlaege oder Konfiguration wirft', async () => {
    welt({ surcharges: { data: null, error: { message: 'boom' } } })
    await expect(calculatePrice({ tier_slug: 'test', estimated_km: 5 }))
      .rejects.toBeInstanceOf(PreisdatenNichtLesbarError)

    welt({ config: { data: null, error: { message: 'boom' } } })
    invalidatePricingCache()
    await expect(calculatePrice({ tier_slug: 'test', estimated_km: 5 }))
      .rejects.toBeInstanceOf(PreisdatenNichtLesbarError)
  })

  it('BEFUND: Lesefehler beim Regionsfaktor wirft, statt auf Faktor 1,0 zurueckzufallen', async () => {
    welt({ regions: { data: null, error: { message: 'timeout' } } })
    await expect(calculatePrice({ tier_slug: 'test', estimated_km: 10, region_code: 'HE' }))
      .rejects.toBeInstanceOf(PreisdatenNichtLesbarError)
  })

  it('unbrauchbarer Regionsfaktor (0, negativ, Text) wirft', async () => {
    for (const wert of [0, -1, 'viel']) {
      welt({ regions: { data: { price_multiplier: wert } } })
      invalidatePricingCache()
      await expect(calculatePrice({ tier_slug: 'test', estimated_km: 10, region_code: 'HE' }))
        .rejects.toThrow(/unbrauchbar/)
    }
  })

  it('fehlender Regionseintrag bleibt Faktor 1,0 — das ist eine Aussage, kein Fehler', async () => {
    welt({ regions: { data: null, error: null } })
    const b = await calculatePrice({ tier_slug: 'test', estimated_km: 10, region_code: 'XX' })
    expect(b.region_multiplier).toBe(1)
  })

  it('gueltiger Regionsfaktor multipliziert nach den Zuschlaegen', async () => {
    welt({ regions: { data: { price_multiplier: 1.5 } } })
    const b = await calculatePrice({ tier_slug: 'test', estimated_km: 10, region_code: 'HE' })
    expect(b.region_multiplier).toBe(1.5)
    expect(b.region_adjusted).toBe(75) // 50 × 1,5
  })

  it('der Regionsfaktor wird auf Tarif UND Region eingegrenzt', async () => {
    const f = welt({ regions: { data: { price_multiplier: 1.2 } } })
    await calculatePrice({ tier_slug: 'test', estimated_km: 10, region_code: 'HE' })
    const a = f.ersterAuf('kf_pricing_regions')!
    expect(hatFilter(a, 'eq', 'region_code', 'HE')).toBe(true)
    expect(hatFilter(a, 'eq', 'tier_id', TIER.id)).toBe(true)
    expect(hatFilter(a, 'eq', 'enabled', true)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 3 — Cache
// ═══════════════════════════════════════════════════════════════════════

describe('Preis-Cache', () => {
  it('liest die Preistabellen nur einmal, solange der Cache gilt', async () => {
    const f = welt()
    await calculatePrice({ tier_slug: 'test', estimated_km: 1 })
    await calculatePrice({ tier_slug: 'test', estimated_km: 2 })
    expect(f.auf('kf_pricing_tiers')).toHaveLength(1)
  })

  it('invalidatePricingCache erzwingt ein Neuladen — Preisaenderungen greifen sofort', async () => {
    await calculatePrice({ tier_slug: 'test', estimated_km: 10 })
    welt({ tiers: { data: [{ ...TIER, base_price: 999 }] } })
    invalidatePricingCache()
    const b = await calculatePrice({ tier_slug: 'test', estimated_km: 10 })
    expect(b.base_price).toBe(999)
  })

  it('Konfigurationswerte kommen aus derselben geladenen Runde', async () => {
    welt({ config: { data: [{ key: 'min_margin_percent', value: '25' }] } })
    expect(await getConfigValue('min_margin_percent')).toBe(25)
    expect(await getConfigValue('gibtsnicht')).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 4 — Kosten und Marge
// ═══════════════════════════════════════════════════════════════════════

describe('calculateCosts / calculateMargin', () => {
  const KOSTEN = {
    id: 'c1', tier_id: TIER.id,
    fuel_cost_per_km: 0.2, driver_rate_per_km: 0.5, vehicle_cost_per_km: 0.3,
    driver_rate_per_min: 0.4, fixed_overhead: 8,
    effective_from: '2026-01-01', effective_to: null,
  }

  it('summiert die vier Kostenarten plus Gemeinkosten', () => {
    const k = calculateCosts(KOSTEN, 10, 20)
    expect(k).toEqual({
      fuel: 2, driver_distance: 5, driver_time: 8, vehicle: 3,
      fixed_overhead: 8, total: 26,
    })
  })

  it('Wartezeit geht nur ueber den Minutensatz ein, nicht ueber die Strecke', () => {
    expect(calculateCosts(KOSTEN, 0, 10).total).toBe(4 + 8)
  })

  it('rechnet Marge in Betrag und Prozent und prueft BEIDE Schwellen', async () => {
    welt({ config: { data: [{ key: 'min_margin_amount', value: '12' }, { key: 'min_margin_percent', value: '20' }] } })
    const m = await calculateMargin(100, 70)
    expect(m.margin_amount).toBe(30)
    expect(m.margin_percent).toBe(30)
    expect(m.meets_threshold).toBe(true)
  })

  it('eine gerissene Schwelle reicht, um die Freigabe zu verweigern', async () => {
    welt({ config: { data: [{ key: 'min_margin_amount', value: '12' }, { key: 'min_margin_percent', value: '20' }] } })
    // Betrag ok (15), Prozent zu niedrig (15 %)
    const m = await calculateMargin(100, 85)
    expect(m.meets_amount_threshold).toBe(true)
    expect(m.meets_percent_threshold).toBe(false)
    expect(m.meets_threshold).toBe(false)
  })

  it('Umsatz 0 fuehrt nicht zu einer Division durch null', async () => {
    const m = await calculateMargin(0, 10)
    expect(m.margin_percent).toBe(0)
    expect(m.meets_threshold).toBe(false)
  })

  it('Verlustfahrt wird als negative Marge ausgewiesen', async () => {
    const m = await calculateMargin(50, 80)
    expect(m.margin_amount).toBe(-30)
    expect(m.meets_threshold).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 5 — Pruefregeln (Tor zur manuellen Freigabe)
// ═══════════════════════════════════════════════════════════════════════

describe('evaluateReviewRules', () => {
  const basis = { tier_slug: 'test', estimated_km: 10 }
  const breakdown = {
    total: 100, base_price: 0, distance_cost: 0, wait_cost: 0, tier_surcharge: 0,
    surcharges: [], surcharges_total: 0, subtotal: 0, region_multiplier: 1,
    region_adjusted: 0, min_price: 0, is_min_price_applied: false,
    return_trip_multiplier: 1, display_lines: [], tier: { name: '', slug: '', icon: null },
  }

  function regel(over: Record<string, unknown> = {}) {
    return {
      id: 'r1', name: 'Lange Fahrt', slug: 'lange_fahrt', description: 'Über 50 km',
      trigger_type: 'condition', trigger_field: 'estimated_km', trigger_operator: 'gt',
      trigger_value: '50', trigger_condition: {}, severity: 'warning', action: 'flag',
      enabled: true, sort_order: 1, ...over,
    }
  }

  it('loest bei ueberschrittener Schwelle aus', async () => {
    welt({ rules: { data: [regel()] } })
    const flags = await evaluateReviewRules({ ...basis, estimated_km: 80 }, breakdown)
    expect(flags.map(f => f.rule_slug)).toEqual(['lange_fahrt'])
  })

  it('loest unterhalb der Schwelle nicht aus', async () => {
    welt({ rules: { data: [regel()] } })
    expect(await evaluateReviewRules({ ...basis, estimated_km: 20 }, breakdown)).toEqual([])
  })

  it('kennt alle sechs Vergleiche', async () => {
    const faelle: [string, number, boolean][] = [
      ['gt', 51, true], ['gt', 50, false],
      ['gte', 50, true], ['lt', 49, true], ['lte', 50, true],
      ['eq', 50, true], ['ne', 50, false], ['ne', 49, true],
    ]
    for (const [op, km, erwartet] of faelle) {
      welt({ rules: { data: [regel({ trigger_operator: op })] } })
      const flags = await evaluateReviewRules({ ...basis, estimated_km: km }, breakdown)
      expect(flags.length > 0, `${op} bei ${km} km`).toBe(erwartet)
    }
  })

  it('vergleicht boolesche Felder korrekt', async () => {
    welt({ rules: { data: [regel({ trigger_field: 'has_missing_docs', trigger_operator: 'eq', trigger_value: 'true' })] } })
    expect(await evaluateReviewRules({ ...basis, has_missing_docs: true }, breakdown)).toHaveLength(1)
    welt({ rules: { data: [regel({ trigger_field: 'has_missing_docs', trigger_operator: 'eq', trigger_value: 'true' })] } })
    expect(await evaluateReviewRules({ ...basis, has_missing_docs: false }, breakdown)).toHaveLength(0)
  })

  it("Regeln mit trigger_type 'always' greifen immer", async () => {
    welt({ rules: { data: [regel({ trigger_type: 'always' })] } })
    expect(await evaluateReviewRules(basis, breakdown)).toHaveLength(1)
  })

  it('unbekanntes Feld oder unvollstaendige Regel wird uebersprungen, statt zu werfen', async () => {
    welt({ rules: { data: [regel({ trigger_field: 'gibtsnicht' }), regel({ trigger_operator: null })] } })
    expect(await evaluateReviewRules(basis, breakdown)).toEqual([])
  })

  it('BEFUND: Lesefehler auf das Regelwerk erzwingt manuelle Freigabe, statt "keine Beanstandung"', async () => {
    welt({ rules: { data: null, error: { message: 'permission denied' } } })
    const flags = await evaluateReviewRules(basis, breakdown)
    expect(flags).toHaveLength(1)
    expect(flags[0].action).toBe('block')
    expect(flags[0].severity).toBe('critical')
  })

  it('ohne Margen-Angabe greifen Margenregeln nicht (dokumentierter Fail-Open der Kontextwerte)', async () => {
    welt({ rules: { data: [regel({ trigger_field: 'margin_percent', trigger_operator: 'lt', trigger_value: '20' })] } })
    // Ohne margin-Argument setzt der Rechner 100 % an — die Regel greift nicht.
    expect(await evaluateReviewRules(basis, breakdown)).toEqual([])

    welt({ rules: { data: [regel({ trigger_field: 'margin_percent', trigger_operator: 'lt', trigger_value: '20' })] } })
    const mitMarge = await evaluateReviewRules(basis, breakdown, {
      revenue: 100, total_cost: 90, margin_amount: 10, margin_percent: 10,
      meets_amount_threshold: false, meets_percent_threshold: false, meets_threshold: false,
    })
    expect(mitMarge).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════
// 6 — Erweiterte Berechnung hinter Feature-Schaltern
// ═══════════════════════════════════════════════════════════════════════

describe('calculatePriceExtended', () => {
  it('liefert ohne Feature-Schalter nur den Standardpreis, ohne Kosten und Regeln zu lesen', async () => {
    const f = welt({ rules: { data: [{ id: 'r', slug: 'x', name: 'x', trigger_type: 'always', severity: 'critical', action: 'block', enabled: true }] } })
    const b = await calculatePriceExtended({ tier_slug: 'test', estimated_km: 10 })
    expect(b.review_flags).toEqual([])
    expect(b.requires_manual_review).toBe(false)
    expect(b.cost_breakdown).toBeUndefined()
    expect(f.auf('kf_review_rules')).toHaveLength(0)
    expect(f.auf('kf_pricing_costs')).toHaveLength(0)
  })

  it('mit enhanced_pricing_v2 werden Kosten und Marge ergaenzt', async () => {
    flags = { enhanced_pricing_v2: true }
    welt({
      costs: {
        data: {
          id: 'c', tier_id: TIER.id, fuel_cost_per_km: 0.2, driver_rate_per_km: 0.5,
          vehicle_cost_per_km: 0.3, driver_rate_per_min: 0.4, fixed_overhead: 8,
          effective_from: '2026-01-01', effective_to: null,
        },
      },
    })
    const b = await calculatePriceExtended({ tier_slug: 'test', estimated_km: 10 })
    expect(b.cost_breakdown?.total).toBe(18) // 2 + 5 + 0 + 3 + 8
    expect(b.margin_info?.revenue).toBe(b.total)
  })

  it('greift den Kostensatz zeitpunktgerecht ab (gueltig-ab, gueltig-bis)', async () => {
    flags = { enhanced_pricing_v2: true }
    const f = welt()
    await calculatePriceExtended({ tier_slug: 'test', estimated_km: 10 })
    const a = f.ersterAuf('kf_pricing_costs')!
    expect(hatFilter(a, 'eq', 'tier_id', TIER.id)).toBe(true)
    expect(a.filter.some(x => x.methode === 'lte' && x.spalte === 'effective_from')).toBe(true)
    expect(a.filter.some(x => x.methode === 'or')).toBe(true)
  })

  it('ohne hinterlegte Kosten bleibt der Preis stehen — nur Kosten und Marge fehlen', async () => {
    flags = { enhanced_pricing_v2: true }
    welt({ costs: { data: null, error: null } })
    const b = await calculatePriceExtended({ tier_slug: 'test', estimated_km: 10 })
    expect(b.total).toBeGreaterThan(0)
    expect(b.cost_breakdown).toBeUndefined()
    expect(b.margin_info).toBeUndefined()
  })

  it('eine blockierende Regel setzt requires_manual_review', async () => {
    flags = { enhanced_pricing_v2: true, manual_review_queue: true }
    welt({
      rules: {
        data: [{
          id: 'r', slug: 'stop', name: 'Stop', description: 'immer', trigger_type: 'always',
          trigger_condition: {}, severity: 'warning', action: 'block', enabled: true, sort_order: 1,
        }],
      },
    })
    const b = await calculatePriceExtended({ tier_slug: 'test', estimated_km: 10 })
    expect(b.requires_manual_review).toBe(true)
  })

  it('auch severity=critical ohne action=block erzwingt die Freigabe', async () => {
    flags = { enhanced_pricing_v2: true, manual_review_queue: true }
    welt({
      rules: {
        data: [{
          id: 'r', slug: 'krit', name: 'Kritisch', description: null, trigger_type: 'always',
          trigger_condition: {}, severity: 'critical', action: 'flag', enabled: true, sort_order: 1,
        }],
      },
    })
    const b = await calculatePriceExtended({ tier_slug: 'test', estimated_km: 10 })
    expect(b.requires_manual_review).toBe(true)
  })

  it('BEFUND-Folge: nicht lesbares Regelwerk fuehrt bis in requires_manual_review durch', async () => {
    flags = { enhanced_pricing_v2: true, manual_review_queue: true }
    welt({ rules: { data: null, error: { message: 'permission denied' } } })
    const b = await calculatePriceExtended({ tier_slug: 'test', estimated_km: 10 })
    expect(b.requires_manual_review).toBe(true)
  })
})
