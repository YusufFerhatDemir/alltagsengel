/**
 * VP/KZP — Bestandsdaten laden (lib/billing/vpkzp/laden.ts)
 *
 * Das ist die EINZIGE Stelle des VP/KZP-Moduls mit Datenbankzugriff. Alles
 * darunter rechnet ohne Datenbank und ist bereits abgedeckt
 * (vpkzp-berechnung / vpkzp-zeitraum / vpkzp-pruefprotokoll). Damit haengt
 * die Richtigkeit des ganzen Moduls an dieser Datei: was hier still fehlt,
 * fehlt der Rechnung darunter — und zwar als Vorverbrauch, der nicht
 * angerechnet wird.
 *
 * Der teuerste denkbare Fehler ist deshalb NICHT eine falsche Zahl, sondern
 * eine leere Liste nach einem verschluckten Lesefehler: sie sieht aus wie
 * "dieser Klient hat noch nichts verbraucht" und gibt ein bereits
 * ausgeschoepftes Kontingent ein zweites Mal frei. Jeder der vier Lesewege
 * hat deshalb hier seinen eigenen Fail-Closed-Test.
 */

import { describe, it, expect } from 'vitest'
import {
  ladeBestand,
  ladeJahresUebersicht,
  VpKzpLageNichtErmittelbarError,
} from '@/lib/billing/vpkzp/laden'
import { erstelleFakeSupabase, hatFilter, hatOrgFence } from '../helpers/supabase-fake'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const ORG = '00000000-0000-4000-8000-000460629986'

/** Ein vollstaendig gesunder Lesevorgang — einzelne Tabellen ueberschreibbar. */
function fake(ueberschreibung: Record<string, { data?: unknown; error?: { message: string } | null }> = {}) {
  const standard: Record<string, { data?: unknown; error?: { message: string } | null }> = {
    clients: { data: { id: CLIENT, care_level: 3, pflegegrad: null } },
    client_vpkzp_usage: { data: [] },
    client_budgets: { data: [] },
    vpkzp_buchungen: { data: [] },
  }
  return erstelleFakeSupabase(a => ({ ...standard, ...ueberschreibung }[a.tabelle] ?? {}))
}

const ZEITRAUM_2026 = { von: '2026-03-01', bis: '2026-03-10' }

// ---------------------------------------------------------------------------
// 1 — Fail-Closed: jeder Lesefehler wirft
// ---------------------------------------------------------------------------

describe('ladeBestand — Fail-Closed auf allen vier Lesewegen', () => {
  const wege = [
    ['clients', 'clients nicht lesbar'],
    ['client_vpkzp_usage', 'client_vpkzp_usage nicht lesbar'],
    ['client_budgets', 'client_budgets nicht lesbar'],
    ['vpkzp_buchungen', 'vpkzp_buchungen nicht lesbar'],
  ] as const

  for (const [tabelle, textteil] of wege) {
    it(`Lesefehler auf ${tabelle} wirft, statt ein leeres Ergebnis zu liefern`, async () => {
      const f = fake({ [tabelle]: { data: null, error: { message: 'permission denied' } } })
      await expect(
        ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: ZEITRAUM_2026 }),
      ).rejects.toBeInstanceOf(VpKzpLageNichtErmittelbarError)

      await expect(
        ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: ZEITRAUM_2026 }),
      ).rejects.toThrow(textteil)
    })
  }

  it('nennt im Fehlertext, dass NICHTS gebucht wurde — sonst wird der Fehler als Warnung gelesen', async () => {
    const f = fake({ clients: { data: null, error: { message: 'boom' } } })
    await expect(
      ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: ZEITRAUM_2026 }),
    ).rejects.toThrow(/NICHTS gebucht/)
  })

  it('unbekannter Klient wirft, statt einen leeren Bestand zu liefern', async () => {
    const f = fake({ clients: { data: null, error: null } })
    await expect(
      ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: ZEITRAUM_2026 }),
    ).rejects.toThrow(/nicht gefunden|anderen Mandanten/)
  })

  it('fehlende clientId oder organizationId wirft, bevor ueberhaupt gelesen wird', async () => {
    const f = fake()
    await expect(
      ladeBestand(f.client, { clientId: '', organizationId: ORG, zeitraum: ZEITRAUM_2026 }),
    ).rejects.toBeInstanceOf(VpKzpLageNichtErmittelbarError)
    await expect(
      ladeBestand(f.client, { clientId: CLIENT, organizationId: '', zeitraum: ZEITRAUM_2026 }),
    ).rejects.toBeInstanceOf(VpKzpLageNichtErmittelbarError)
    expect(f.aufrufe).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 2 — Mandantentrennung: der Filter ist die Aussage, nicht nur die Policy
// ---------------------------------------------------------------------------

describe('ladeBestand — organization_id wird auf JEDER Abfrage explizit gefiltert', () => {
  it('alle vier Abfragen tragen den Mandanten-Fence und den Klienten', async () => {
    const f = fake()
    await ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: ZEITRAUM_2026 })

    for (const tabelle of ['clients', 'client_vpkzp_usage', 'client_budgets', 'vpkzp_buchungen']) {
      const a = f.ersterAuf(tabelle)
      expect(a, `${tabelle} wurde nicht gelesen`).toBeDefined()
      expect(hatOrgFence(a, ORG), `${tabelle} ohne organization_id-Filter`).toBe(true)
    }

    // clients wird ueber die Primaerschluessel-Spalte gefiltert, die
    // Bestandstabellen ueber client_id.
    expect(hatFilter(f.ersterAuf('clients'), 'eq', 'id', CLIENT)).toBe(true)
    for (const tabelle of ['client_vpkzp_usage', 'client_budgets', 'vpkzp_buchungen']) {
      expect(hatFilter(f.ersterAuf(tabelle), 'eq', 'client_id', CLIENT)).toBe(true)
    }
  })

  it('liest die Pflegegrad-Doppelspalte mit — care_level UND pflegegrad', async () => {
    const f = fake()
    await ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: ZEITRAUM_2026 })
    const spalten = f.ersterAuf('clients')?.spalten ?? ''
    expect(spalten).toContain('care_level')
    expect(spalten).toContain('pflegegrad')
  })
})

// ---------------------------------------------------------------------------
// 3 — Pflegegrad: Bestandskunden fuehren ihn nur in care_level
// ---------------------------------------------------------------------------

describe('ladeBestand — Pflegegrad', () => {
  it('liest den Pflegegrad eines Bestandskunden aus care_level, obwohl pflegegrad NULL ist', async () => {
    const f = fake({ clients: { data: { id: CLIENT, care_level: 4, pflegegrad: null } } })
    const b = await ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: ZEITRAUM_2026 })
    expect(b.pflegegrad).toBe(4)
  })

  it('liefert null, wenn beim Klienten gar kein Pflegegrad hinterlegt ist', async () => {
    const f = fake({ clients: { data: { id: CLIENT, care_level: null, pflegegrad: null } } })
    const b = await ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: ZEITRAUM_2026 })
    expect(b.pflegegrad).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 4 — Jahreswechsel: jedes Kalenderjahr hat sein eigenes Kontingent
// ---------------------------------------------------------------------------

describe('ladeBestand — jahresuebergreifender Zeitraum', () => {
  const UEBER_JAHRESWECHSEL = { von: '2025-12-28', bis: '2026-01-05' }

  it('laedt BEIDE Jahresstaende — sonst rechnet das Folgejahr gegen ein leeres Kontingent', async () => {
    const f = fake()
    const b = await ladeBestand(f.client, {
      clientId: CLIENT, organizationId: ORG, zeitraum: UEBER_JAHRESWECHSEL,
    })
    expect(b.staende.map(s => s.jahr)).toEqual([2025, 2026])
  })

  it('filtert Jahresstaende, Budgets und Buchungen auf genau diese Jahre', async () => {
    const f = fake()
    await ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: UEBER_JAHRESWECHSEL })

    expect(hatFilter(f.ersterAuf('client_vpkzp_usage'), 'in', 'calendar_year', [2025, 2026])).toBe(true)
    expect(hatFilter(f.ersterAuf('client_budgets'), 'in', 'year', [2025, 2026])).toBe(true)
    expect(hatFilter(f.ersterAuf('vpkzp_buchungen'), 'in', 'calendar_year', [2025, 2026])).toBe(true)
  })

  /**
   * Warum der Filter auf calendar_year die Ueberschneidungspruefung nicht
   * loechrig macht: vpkzp_buchungen erzwingt per CHECK, dass eine Buchung
   * ganz in EIN Kalenderjahr faellt (siehe 20260926000000, Constraint
   * vpkzp_buchungen_calendar_year_stimmig). Ein Aufenthalt ueber den
   * Jahreswechsel liegt also als ZWEI Zeilen vor. Waere das nicht so,
   * wuerde eine Buchung 28.12.–05.01. bei einer Pruefung fuer 2026 nicht
   * geladen und dieselben Tage liessen sich ein zweites Mal buchen.
   */
  it('Bestandsbuchungen beider Jahre landen im Bestand', async () => {
    const f = fake({
      vpkzp_buchungen: {
        data: [
          { id: 'b-2025', art: 'kurzzeitpflege', zeitraum_von: '2025-12-28', zeitraum_bis: '2025-12-31', status: 'gebucht' },
          { id: 'b-2026', art: 'kurzzeitpflege', zeitraum_von: '2026-01-01', zeitraum_bis: '2026-01-05', status: 'gebucht' },
        ],
      },
    })
    const b = await ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: UEBER_JAHRESWECHSEL })
    expect(b.bestand.map(x => x.id)).toEqual(['b-2025', 'b-2026'])
  })
})

// ---------------------------------------------------------------------------
// 5 — Jahresstand: Bewilligung schlaegt gesetzlichen Wert
// ---------------------------------------------------------------------------

describe('ladeBestand — Jahresstand und Budgetquelle', () => {
  it('uebernimmt den Vorverbrauch aus client_vpkzp_usage', async () => {
    const f = fake({
      client_vpkzp_usage: {
        data: [{
          calendar_year: 2026,
          vp_days_used: 12, kzp_days_used: 5,
          vp_amount_used: 800.5, kzp_amount_used: 200.25,
          combined_budget_total: 3539,
        }],
      },
    })
    const b = await ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: ZEITRAUM_2026 })
    expect(b.staende).toHaveLength(1)
    expect(b.staende[0]).toMatchObject({
      jahr: 2026,
      vpTageVerbraucht: 12,
      kzpTageVerbraucht: 5,
      vpBetragVerbrauchtEuro: 800.5,
      kzpBetragVerbrauchtEuro: 200.25,
      kombiniertesBudgetEuro: 3539,
    })
  })

  it('ohne Standzeile gilt die Bewilligung aus client_budgets', async () => {
    const f = fake({
      client_vpkzp_usage: { data: [] },
      client_budgets: { data: [{ year: 2026, combined_annual_amount: 4200 }] },
    })
    const b = await ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: ZEITRAUM_2026 })
    expect(b.staende[0].kombiniertesBudgetEuro).toBe(4200)
    expect(b.staende[0].vpTageVerbraucht).toBe(0)
  })

  it('ohne Standzeile UND ohne Bewilligung bleibt das Budget null — der gesetzliche Wert greift darunter', async () => {
    const f = fake()
    const b = await ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: ZEITRAUM_2026 })
    expect(b.staende[0].kombiniertesBudgetEuro).toBeNull()
  })

  it('Standzeile mit combined_budget_total 0 faellt auf client_budgets zurueck, statt 0 EUR Budget zu behaupten', async () => {
    const f = fake({
      client_vpkzp_usage: {
        data: [{ calendar_year: 2026, vp_days_used: 3, kzp_days_used: 0, vp_amount_used: 100, kzp_amount_used: 0, combined_budget_total: 0 }],
      },
      client_budgets: { data: [{ year: 2026, combined_annual_amount: 3539 }] },
    })
    const b = await ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: ZEITRAUM_2026 })
    // 0 EUR Budget wuerde jede Leistung sperren, obwohl eine Bewilligung vorliegt.
    expect(b.staende[0].kombiniertesBudgetEuro).toBe(3539)
    expect(b.staende[0].vpTageVerbraucht).toBe(3)
  })

  it('NULL-Werte in der Standzeile werden zu 0, nicht zu NaN', async () => {
    const f = fake({
      client_vpkzp_usage: {
        data: [{ calendar_year: 2026, vp_days_used: null, kzp_days_used: null, vp_amount_used: null, kzp_amount_used: null, combined_budget_total: null }],
      },
    })
    const b = await ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: ZEITRAUM_2026 })
    expect(b.staende[0].vpTageVerbraucht).toBe(0)
    expect(b.staende[0].kzpBetragVerbrauchtEuro).toBe(0)
    expect(Number.isNaN(b.staende[0].vpBetragVerbrauchtEuro)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 6 — Bestandsbuchungen: was NICHT in die Ueberschneidungspruefung gehoert
// ---------------------------------------------------------------------------

describe('ladeBestand — Bestandsbuchungen', () => {
  it('stornierte Buchungen werden bereits in der Abfrage ausgeschlossen', async () => {
    const f = fake()
    await ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: ZEITRAUM_2026 })
    expect(hatFilter(f.ersterAuf('vpkzp_buchungen'), 'neq', 'status', 'storniert')).toBe(true)
  })

  it('Buchungen fremder Leistungsart werden verworfen — sie sperren keine VP/KZP-Tage', async () => {
    const f = fake({
      vpkzp_buchungen: {
        data: [
          { id: 'vp-1', art: 'verhinderungspflege', zeitraum_von: '2026-03-01', zeitraum_bis: '2026-03-03', status: 'gebucht' },
          { id: 'x-1', art: 'entlastungsbetrag', zeitraum_von: '2026-03-04', zeitraum_bis: '2026-03-05', status: 'gebucht' },
          { id: 'x-2', art: null, zeitraum_von: '2026-03-06', zeitraum_bis: '2026-03-07', status: 'gebucht' },
        ],
      },
    })
    const b = await ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: ZEITRAUM_2026 })
    expect(b.bestand.map(x => x.id)).toEqual(['vp-1'])
  })

  it('kuerzt Zeitstempel auf das reine Datum — sonst vergleicht die Ueberschneidungspruefung Datum gegen Zeitstempel', async () => {
    const f = fake({
      vpkzp_buchungen: {
        data: [{
          id: 'b-1', art: 'kurzzeitpflege',
          zeitraum_von: '2026-03-01T00:00:00+01:00',
          zeitraum_bis: '2026-03-05T00:00:00+01:00',
          status: 'gebucht',
        }],
      },
    })
    const b = await ladeBestand(f.client, { clientId: CLIENT, organizationId: ORG, zeitraum: ZEITRAUM_2026 })
    expect(b.bestand[0].von).toBe('2026-03-01')
    expect(b.bestand[0].bis).toBe('2026-03-05')
  })
})

// ---------------------------------------------------------------------------
// 7 — Jahresuebersicht
// ---------------------------------------------------------------------------

describe('ladeJahresUebersicht', () => {
  it('wirft bei Lesefehler, statt eine leere Verwaltungsansicht zu zeigen', async () => {
    const f = erstelleFakeSupabase(() => ({ data: null, error: { message: 'permission denied' } }))
    await expect(
      ladeJahresUebersicht(f.client, { organizationId: ORG, jahr: 2026 }),
    ).rejects.toBeInstanceOf(VpKzpLageNichtErmittelbarError)
  })

  it('filtert auf Mandant und Jahr', async () => {
    const f = erstelleFakeSupabase(() => ({ data: [] }))
    await ladeJahresUebersicht(f.client, { organizationId: ORG, jahr: 2026 })
    const a = f.ersterAuf('client_vpkzp_usage')
    expect(hatOrgFence(a, ORG)).toBe(true)
    expect(hatFilter(a, 'eq', 'calendar_year', 2026)).toBe(true)
  })

  it('setzt den Namen aus dem Klienten-Join zusammen', async () => {
    const f = erstelleFakeSupabase(() => ({
      data: [{
        client_id: CLIENT, calendar_year: 2026,
        vp_days_used: 10, kzp_days_used: 2,
        vp_amount_used: 900, kzp_amount_used: 100,
        combined_budget_total: 3539, combined_budget_remaining: 2539,
        client: { first_name: 'Maria', last_name: 'Muster' },
      }],
    }))
    const zeilen = await ladeJahresUebersicht(f.client, { organizationId: ORG, jahr: 2026 })
    expect(zeilen).toHaveLength(1)
    expect(zeilen[0].name).toBe('Maria Muster')
    expect(zeilen[0].kombiniertRestEuro).toBe(2539)
  })

  it('faellt auf "Unbekannt" zurueck, wenn der Join leer ist — statt " " als Namen', async () => {
    const f = erstelleFakeSupabase(() => ({
      data: [{ client_id: CLIENT, calendar_year: 2026, client: null }],
    }))
    const zeilen = await ladeJahresUebersicht(f.client, { organizationId: ORG, jahr: 2026 })
    expect(zeilen[0].name).toBe('Unbekannt')
    expect(zeilen[0].vpTageVerbraucht).toBe(0)
  })
})
