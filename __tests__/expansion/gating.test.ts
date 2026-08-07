// ═══════════════════════════════════════════════════════════════
// FREISCHALTUNGS-LOGIK — die eine Regel, die stimmen muss
// ═══════════════════════════════════════════════════════════════
//   Kassenabrechnung = Bundesland freigeschaltet UND PLZ eindeutig
//
// Alles andere (Werbung, Registrierung, Warteliste, Privat) darf
// großzügig sein. Diese eine Bedingung darf nie versehentlich
// aufweichen — deshalb wird sie hier von allen Seiten beschossen.
// ═══════════════════════════════════════════════════════════════

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FALLBACK_STATE,
  kassenHinweisText,
  KASSEN_MODULE,
  TEXT_KASSE_IM_VERFAHREN,
  type StateSettingsPublic,
} from '@/lib/expansion/types'

// ── Supabase-Server-Client durch eine steuerbare Attrappe ersetzen ──
const zeilen: StateSettingsPublic[] = []
let sollFehlschlagen = false

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: async () =>
          sollFehlschlagen
            ? { data: null, error: new Error('DB nicht erreichbar') }
            : { data: zeilen, error: null },
      }),
    }),
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
    }),
  }),
}))

function zeile(over: Partial<StateSettingsPublic>): StateSettingsPublic {
  return {
    organization_id: '00000000-0000-4000-8000-000460629986',
    bundesland: 'hessen',
    bundesland_label: 'Hessen',
    status: 'ANTRAG_EINGEREICHT',
    marketing_enabled: true,
    registration_enabled: true,
    waitinglist_enabled: true,
    private_enabled: true,
    insurance_enabled: false,
    effective_date: null,
    ansprechpartner_name: null,
    ansprechpartner_email: null,
    ansprechpartner_telefon: null,
    ...over,
  }
}

async function ladeModul() {
  // Frischer Import je Test — das Modul cached die Matrix 60 Sekunden.
  vi.resetModules()
  return import('@/lib/expansion/state-settings')
}

beforeEach(() => {
  zeilen.length = 0
  sollFehlschlagen = false
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('bundeslandLage — Kassenabrechnung', () => {
  it('bleibt AUS, solange die Anerkennung fehlt', async () => {
    zeilen.push(zeile({ insurance_enabled: false, status: 'ANTRAG_EINGEREICHT' }))
    const { bundeslandLage } = await ladeModul()

    const lage = await bundeslandLage('60311')
    expect(lage.bundesland).toBe('hessen')
    expect(lage.kassenabrechnung).toBe(false)
    expect(lage.privatleistungen).toBe(true)
    expect(lage.registrierung).toBe(true)
    expect(lage.warteliste).toBe(true)
    expect(lage.hinweis).toBe(TEXT_KASSE_IM_VERFAHREN)
  })

  it('geht AN, sobald das Bundesland freigeschaltet ist', async () => {
    zeilen.push(zeile({ insurance_enabled: true, status: 'ANERKANNT', effective_date: '2026-09-01' }))
    const { bundeslandLage } = await ladeModul()

    const lage = await bundeslandLage('60311')
    expect(lage.kassenabrechnung).toBe(true)
    expect(lage.status).toBe('ANERKANNT')
    expect(lage.goLive).toBe('2026-09-01')
  })

  it('bleibt AUS bei nicht eindeutiger Grenz-PLZ, obwohl das Land frei ist', async () => {
    // 214xx liegt teils in Niedersachsen, teils in Schleswig-Holstein.
    zeilen.push(zeile({
      bundesland: 'niedersachsen',
      bundesland_label: 'Niedersachsen',
      insurance_enabled: true,
      status: 'ANERKANNT',
    }))
    const { bundeslandLage } = await ladeModul()

    const lage = await bundeslandLage('21444')
    expect(lage.bundesland).toBe('niedersachsen')
    expect(lage.eindeutig).toBe(false)
    expect(lage.kassenabrechnung).toBe(false)
  })

  it('bleibt AUS bei nicht zuordenbarer PLZ', async () => {
    zeilen.push(zeile({ insurance_enabled: true, status: 'ANERKANNT' }))
    const { bundeslandLage } = await ladeModul()

    const lage = await bundeslandLage('11111')
    expect(lage.bundesland).toBeNull()
    expect(lage.kassenabrechnung).toBe(false)
    expect(lage.warteliste).toBe(true)
  })

  it('bleibt AUS, wenn die Datenbank nicht antwortet', async () => {
    sollFehlschlagen = true
    const { bundeslandLage } = await ladeModul()

    const lage = await bundeslandLage('60311')
    expect(lage.kassenabrechnung).toBe(false)
    expect(lage.registrierung).toBe(true)   // Plattform bleibt nutzbar
    expect(lage.warteliste).toBe(true)
  })

  it('bleibt AUS, wenn für das Bundesland gar keine Zeile existiert', async () => {
    zeilen.push(zeile({ bundesland: 'hessen', insurance_enabled: true, status: 'ANERKANNT' }))
    const { bundeslandLage } = await ladeModul()

    const lage = await bundeslandLage('80331')  // Bayern — keine Zeile geliefert
    expect(lage.bundesland).toBe('bayern')
    expect(lage.kassenabrechnung).toBe(false)
  })

  it('meldet ein abgelehntes Bundesland mit eigenem Text', async () => {
    zeilen.push(zeile({ status: 'ABGELEHNT', insurance_enabled: false, private_enabled: true }))
    const { bundeslandLage } = await ladeModul()

    const lage = await bundeslandLage('60311')
    expect(lage.kassenabrechnung).toBe(false)
    expect(lage.privatleistungen).toBe(true)
    expect(lage.hinweis).toContain('keine Anerkennung')
  })
})

describe('zahlungsartFuerPlz', () => {
  it('liefert „privat", solange die Kasse nicht freigeschaltet ist', async () => {
    zeilen.push(zeile({ insurance_enabled: false }))
    const { zahlungsartFuerPlz } = await ladeModul()
    expect(await zahlungsartFuerPlz('60311')).toBe('privat')
  })

  it('liefert „kasse" nach der Freischaltung', async () => {
    zeilen.push(zeile({ insurance_enabled: true, status: 'ANERKANNT' }))
    const { zahlungsartFuerPlz } = await ladeModul()
    expect(await zahlungsartFuerPlz('60311')).toBe('kasse')
  })

  it('liefert „privat" bei unbekannter PLZ', async () => {
    zeilen.push(zeile({ insurance_enabled: true, status: 'ANERKANNT' }))
    const { zahlungsartFuerPlz } = await ladeModul()
    expect(await zahlungsartFuerPlz(null)).toBe('privat')
  })
})

describe('Fallback-Konstante', () => {
  it('schaltet niemals die Kasse frei', () => {
    expect(FALLBACK_STATE.insurance_enabled).toBe(false)
    expect(FALLBACK_STATE.private_enabled).toBe(false)
  })

  it('lässt Werbung, Registrierung und Warteliste offen', () => {
    expect(FALLBACK_STATE.marketing_enabled).toBe(true)
    expect(FALLBACK_STATE.registration_enabled).toBe(true)
    expect(FALLBACK_STATE.waitinglist_enabled).toBe(true)
  })
})

describe('Ein-Klick-Kaskade', () => {
  it('umfasst genau die fünf zugesagten Kassenmodule', () => {
    expect([...KASSEN_MODULE]).toEqual([
      'kassentarife_enabled',
      'budgetpruefung_enabled',
      'kassenrechnung_enabled',
      'elnw_enabled',
      'dakota_export_enabled',
    ])
  })
})

describe('kassenHinweisText', () => {
  it('nennt das laufende Verfahren wörtlich', () => {
    for (const status of ['VORBEREITUNG', 'ANTRAG_EINGEREICHT', 'IN_PRUEFUNG'] as const) {
      expect(kassenHinweisText(status)).toBe(TEXT_KASSE_IM_VERFAHREN)
    }
  })

  it('unterscheidet anerkannt und abgelehnt', () => {
    expect(kassenHinweisText('ANERKANNT')).toContain('freigeschaltet')
    expect(kassenHinweisText('ABGELEHNT')).toContain('Privatleistungen')
  })
})
