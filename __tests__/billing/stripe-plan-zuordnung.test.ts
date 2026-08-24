// ═══════════════════════════════════════════════════════════════════════
// Delta-Check Phase 4.5 — stiller Gratis-Rueckfall im Stripe-Webhook
//
// BEFUND
// lib/stripe/config.ts baute die Zuordnung Price-ID → Plan aus
// `process.env.STRIPE_PRICE_*!`. Fehlte eine dieser Variablen in der
// Laufzeitumgebung, lieferte planFromPriceId() fuer eine ECHTE, bezahlte
// Price-ID `null`; syncSubscriptionToDb() setzte daraufhin
// `plan: 'free'`. Ergebnis: ein zahlender Mandant verlor stillschweigend
// alle Plan-Merkmale, der Webhook antwortete mit 200, Stripe verbuchte
// eine erfolgreiche Zustellung — kein Fehler, kein Log, keine Spur.
//
// Zusaetzlich entstand durch `[process.env.X!]` als berechneten Schluessel
// ein Phantom-Eintrag unter der Zeichenkette "undefined"; bei mehreren
// fehlenden Variablen gewann der zuletzt notierte Plan.
//
// Die Tests halten beide Richtungen fest: unvollstaendige Konfiguration
// muss WERFEN, vollstaendige Konfiguration darf sich nicht aendern.
// ═══════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const VARIABLEN = ['STRIPE_PRICE_STARTER', 'STRIPE_PRICE_PRO', 'STRIPE_PRICE_SCALE'] as const

let vorher: Record<string, string | undefined>

/**
 * Das Modul liest die Variablen bei JEDEM Aufruf, nicht beim Import —
 * genau deshalb reicht hier ein einziger Import und es braucht kein
 * vi.resetModules() pro Fall. Der Test haelt diese Eigenschaft mit fest:
 * eine Rueckkehr zu Modul-Konstanten wuerde ihn rot machen.
 */
import {
  planFromPriceId,
  preisIdFuerPlan,
  fehlendePreisVariablen,
  isPaidPlan,
} from '@/lib/stripe/config'

beforeEach(() => {
  vorher = {}
  for (const v of VARIABLEN) {
    vorher[v] = process.env[v]
    delete process.env[v]
  }
})

afterEach(() => {
  for (const v of VARIABLEN) {
    if (vorher[v] === undefined) delete process.env[v]
    else process.env[v] = vorher[v]
  }
})

function alleSetzen() {
  process.env.STRIPE_PRICE_STARTER = 'price_starter_x'
  process.env.STRIPE_PRICE_PRO = 'price_pro_x'
  process.env.STRIPE_PRICE_SCALE = 'price_scale_x'
}

describe('unvollstaendige Konfiguration ist ein Fehler, kein Gratis-Plan', () => {
  it('planFromPriceId wirft, wenn eine Preis-Variable fehlt', () => {
    alleSetzen()
    delete process.env.STRIPE_PRICE_PRO

    // Das ist der Kern des Befundes: eine echte, bezahlte Price-ID darf
    // NICHT als "unbekannt" (→ free) durchgehen, nur weil die Zuordnung
    // unvollstaendig ist.
    expect(() => planFromPriceId('price_starter_x')).toThrow(/STRIPE_PRICE_PRO/)
  })

  it('planFromPriceId wirft auch, wenn alle Variablen fehlen', () => {
    expect(() => planFromPriceId('price_irgendwas')).toThrow(/unvollständig/)
  })

  it('eine leere bzw. nur aus Leerzeichen bestehende Variable gilt als fehlend', () => {
    alleSetzen()
    process.env.STRIPE_PRICE_SCALE = '   '
    expect(fehlendePreisVariablen()).toEqual(['STRIPE_PRICE_SCALE'])
    expect(() => planFromPriceId('price_pro_x')).toThrow(/STRIPE_PRICE_SCALE/)
  })

  it('die Fehlermeldung nennt jede fehlende Variable', () => {
    process.env.STRIPE_PRICE_STARTER = 'price_starter_x'
    let meldung = ''
    try {
      planFromPriceId('price_starter_x')
    } catch (e) {
      meldung = (e as Error).message
    }
    expect(meldung).toContain('STRIPE_PRICE_PRO')
    expect(meldung).toContain('STRIPE_PRICE_SCALE')
    expect(meldung).not.toContain('STRIPE_PRICE_STARTER')
  })

  it('preisIdFuerPlan wirft mit dem Namen der fehlenden Variable statt undefined zu liefern', () => {
    process.env.STRIPE_PRICE_STARTER = 'price_starter_x'
    expect(preisIdFuerPlan('starter')).toBe('price_starter_x')
    expect(() => preisIdFuerPlan('scale')).toThrow(/STRIPE_PRICE_SCALE/)
  })
})

describe('vollstaendige Konfiguration verhaelt sich unveraendert', () => {
  beforeEach(alleSetzen)

  it('jede konfigurierte Price-ID ergibt ihren Plan', () => {
    expect(planFromPriceId('price_starter_x')).toBe('starter')
    expect(planFromPriceId('price_pro_x')).toBe('pro')
    expect(planFromPriceId('price_scale_x')).toBe('scale')
  })

  it('eine fremde Price-ID ergibt null — das darf weiter zu free fuehren', () => {
    // Anderes Produkt im selben Stripe-Konto: hier ist 'free' die
    // richtige Auslegung, weil die Zuordnung vollstaendig ist.
    expect(planFromPriceId('price_fremdes_produkt')).toBeNull()
  })

  it('keine Price-ID ergibt null und wirft nicht', () => {
    expect(planFromPriceId(null)).toBeNull()
    expect(planFromPriceId(undefined)).toBeNull()
    expect(planFromPriceId('')).toBeNull()
  })

  it('es gibt keinen Phantom-Eintrag unter der Zeichenkette "undefined"', () => {
    // Der alte Code baute `[process.env.X!]` als Schluessel — bei fehlender
    // Variable also literal "undefined".
    expect(planFromPriceId('undefined')).toBeNull()
  })

  it('fehlendePreisVariablen ist leer', () => {
    expect(fehlendePreisVariablen()).toEqual([])
  })
})

describe('isPaidPlan', () => {
  it('erkennt die drei kostenpflichtigen Plaene', () => {
    expect(isPaidPlan('starter')).toBe(true)
    expect(isPaidPlan('pro')).toBe(true)
    expect(isPaidPlan('scale')).toBe(true)
  })

  it('lehnt free und Unsinn ab', () => {
    expect(isPaidPlan('free')).toBe(false)
    expect(isPaidPlan('enterprise')).toBe(false)
    expect(isPaidPlan('')).toBe(false)
  })
})
