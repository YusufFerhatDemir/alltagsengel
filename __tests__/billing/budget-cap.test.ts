/**
 * Budgetdeckel im Rechnungsweg — § 45b / § 42a SGB XI
 *
 * Gegenstand: der Befund A-1 aus docs/ALLTAGSENGEL_RECHECK_2026-08-19.md —
 * `create_invoice_draft_atomic()` kennt `client_budgets` nicht, und die
 * Aufteilung Kassen-/Privatanteil war ungedeckelt.
 *
 * Geprueft wird
 *   1. die reine Rechenlogik (Monatsdeckel, Jahresdeckel, Uebertrag, § 42a),
 *   2. das Lesen der Budgetlage aus der DB (Quelle, Verbrauch, Fail-Closed),
 *   3. die Verdrahtung in `createInvoiceDraft()` (Reihenfolge, Schreibweg).
 *
 * Betraege sind durchgaengig EURO — so liegen sie in `invoices` und
 * `client_budgets`.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  berechneBudgetDeckel,
  budgetTopfFuer,
  istGedeckelt,
  UNGEDECKELTE_TOEPFE,
  ermittleBudgetLage,
  deckelAusLage,
  UnbekannterBudgetTypError,
  BudgetLageNichtErmittelbarError,
  uebertragVerfallsdatum,
  uebertragGiltNoch,
  UEBERTRAG_VERFALL_MONAT_TAG,
  type BudgetLage,
} from '@/lib/billing/core/budget-cap'
import { createInvoiceDraft, wendeBudgetDeckelAn } from '@/lib/billing/core/invoice-engine'
import {
  ENTLASTUNG_MONATLICH_EUR,
  ENTLASTUNG_JAEHRLICH_EUR,
  VP_KZP_KOMBINIERT_EUR,
} from '@/lib/config/budget-constants'

const CLIENT = '11111111-1111-4111-8111-111111111111'
const ORG = '00000000-0000-4000-8000-000460629986'
const ACTOR = '22222222-2222-4222-8222-222222222222'

// ---------------------------------------------------------------------------
// 1 — Reine Rechenlogik
// ---------------------------------------------------------------------------

describe('berechneBudgetDeckel — § 45b Monats- und Jahresdeckel', () => {
  const basis = {
    topf: 'entlastung' as const,
    periodMonth: '2026-01',
    jahresanspruchEuro: ENTLASTUNG_JAEHRLICH_EUR,
    monatsanspruchEuro: ENTLASTUNG_MONATLICH_EUR,
    uebertragEuro: 0,
    verbrauchtBisMonatEuro: 0,
    verbrauchtJahrEuro: 0,
  }

  it('gesetzliche Werte sind 131 EUR/Monat und 1572 EUR/Jahr — nicht 125/1500', () => {
    expect(ENTLASTUNG_MONATLICH_EUR).toBe(131)
    expect(ENTLASTUNG_JAEHRLICH_EUR).toBe(1572)
    expect(VP_KZP_KOMBINIERT_EUR).toBe(3539)
  })

  it('Betrag unter dem Monatsanspruch bleibt vollstaendig Kassenanteil', () => {
    const r = berechneBudgetDeckel({ ...basis, kassenBetragEuro: 90 })
    expect(r.gedeckelt).toBe(false)
    expect(r.budgetAnteilEuro).toBe(90)
    expect(r.privatAnteilEuro).toBe(0)
    expect(r.grund).toBeNull()
  })

  it('genau 131 EUR im Januar ist noch gedeckt', () => {
    const r = berechneBudgetDeckel({ ...basis, kassenBetragEuro: 131 })
    expect(r.gedeckelt).toBe(false)
    expect(r.budgetAnteilEuro).toBe(131)
  })

  it('400 EUR im Januar: 131 EUR Kasse, 269 EUR privat — der Kernbefund A-1', () => {
    const r = berechneBudgetDeckel({ ...basis, kassenBetragEuro: 400 })
    expect(r.gedeckelt).toBe(true)
    expect(r.budgetAnteilEuro).toBe(131)
    expect(r.privatAnteilEuro).toBe(269)
    expect(r.ueberschussEuro).toBe(269)
    expect(r.greifenderDeckel).toBe('monat')
    expect(r.grund).toContain('Monatsanspruch')
    expect(r.grund).toContain('§ 45b')
  })

  it('1572 EUR im Januar werden auf 131 EUR gedeckelt — der Jahresanspruch ist noch nicht entstanden', () => {
    const r = berechneBudgetDeckel({ ...basis, kassenBetragEuro: 1572 })
    expect(r.budgetAnteilEuro).toBe(131)
    expect(r.privatAnteilEuro).toBe(1441)
    expect(r.greifenderDeckel).toBe('monat')
  })

  it('im Dezember steht der volle Jahresanspruch zur Verfuegung, wenn nichts verbraucht wurde', () => {
    const r = berechneBudgetDeckel({
      ...basis,
      periodMonth: '2026-12',
      kassenBetragEuro: 1572,
    })
    expect(r.gedeckelt).toBe(false)
    expect(r.budgetAnteilEuro).toBe(1572)
    expect(r.limitBisMonatEuro).toBe(1572)   // 131 × 12
    expect(r.limitJahrEuro).toBe(1572)
  })

  it('unverbrauchte Vormonate sammeln sich an (Maerz: 3 × 131 = 393 EUR)', () => {
    const r = berechneBudgetDeckel({
      ...basis,
      periodMonth: '2026-03',
      kassenBetragEuro: 393,
    })
    expect(r.gedeckelt).toBe(false)
    expect(r.limitBisMonatEuro).toBe(393)
  })

  it('bereits abgerechneter Verbrauch mindert den Monatsdeckel', () => {
    const r = berechneBudgetDeckel({
      ...basis,
      periodMonth: '2026-03',
      kassenBetragEuro: 300,
      verbrauchtBisMonatEuro: 262,   // Januar + Februar voll ausgeschoepft
      verbrauchtJahrEuro: 262,
    })
    expect(r.gedeckelt).toBe(true)
    expect(r.verfuegbarEuro).toBe(131)
    expect(r.budgetAnteilEuro).toBe(131)
    expect(r.privatAnteilEuro).toBe(169)
  })

  it('Jahresdeckel greift, wenn der Jahresanspruch trotz Monatsluft erschoepft ist', () => {
    const r = berechneBudgetDeckel({
      ...basis,
      periodMonth: '2026-12',
      kassenBetragEuro: 200,
      verbrauchtBisMonatEuro: 1572,
      verbrauchtJahrEuro: 1572,
    })
    expect(r.gedeckelt).toBe(true)
    expect(r.budgetAnteilEuro).toBe(0)
    expect(r.privatAnteilEuro).toBe(200)
    expect(r.verfuegbarEuro).toBe(0)
  })

  it('Uebertrag aus dem Vorjahr erhoeht Monats- und Jahresdeckel', () => {
    const r = berechneBudgetDeckel({
      ...basis,
      periodMonth: '2026-01',
      kassenBetragEuro: 400,
      uebertragEuro: 500,
    })
    expect(r.limitBisMonatEuro).toBe(631)   // 131 + 500
    expect(r.limitJahrEuro).toBe(2072)      // 1572 + 500
    expect(r.gedeckelt).toBe(false)
    expect(r.budgetAnteilEuro).toBe(400)
  })

  it('ueberzogener Verbrauch fuehrt nie zu negativem Kassenanteil', () => {
    const r = berechneBudgetDeckel({
      ...basis,
      kassenBetragEuro: 100,
      verbrauchtBisMonatEuro: 900,
      verbrauchtJahrEuro: 900,
    })
    expect(r.verfuegbarEuro).toBe(0)
    expect(r.budgetAnteilEuro).toBe(0)
    expect(r.privatAnteilEuro).toBe(100)
  })

  it('rundet auf Cent statt auf ganze Euro', () => {
    const r = berechneBudgetDeckel({
      ...basis,
      kassenBetragEuro: 200,
      verbrauchtBisMonatEuro: 10.01,
      verbrauchtJahrEuro: 10.01,
    })
    expect(r.budgetAnteilEuro).toBe(120.99)
    expect(r.privatAnteilEuro).toBe(79.01)
    expect(r.budgetAnteilEuro + r.privatAnteilEuro).toBeCloseTo(200, 2)
  })

  it('Gutschrift (negativer Betrag) wird nicht gedeckelt', () => {
    const r = berechneBudgetDeckel({
      ...basis,
      kassenBetragEuro: -250,
      verbrauchtBisMonatEuro: 1572,
      verbrauchtJahrEuro: 1572,
    })
    expect(r.gedeckelt).toBe(false)
    expect(r.budgetAnteilEuro).toBe(-250)
    expect(r.privatAnteilEuro).toBe(0)
  })

  it('unbrauchbarer Abrechnungsmonat wirft, statt einen Monat zu raten', () => {
    expect(() => berechneBudgetDeckel({ ...basis, periodMonth: '2026', kassenBetragEuro: 10 }))
      .toThrow(/YYYY-MM/)
    expect(() => berechneBudgetDeckel({ ...basis, periodMonth: '2026-13', kassenBetragEuro: 10 }))
      .toThrow(/01–12/)
  })
})

describe('berechneBudgetDeckel — § 42a Verhinderungs-/Kurzzeitpflege', () => {
  const basis = {
    topf: 'verhinderung' as const,
    periodMonth: '2026-01',
    jahresanspruchEuro: VP_KZP_KOMBINIERT_EUR,
    monatsanspruchEuro: null,
    uebertragEuro: 0,
    verbrauchtBisMonatEuro: 0,
    verbrauchtJahrEuro: 0,
  }

  it('kennt keinen Monatsdeckel — der volle Jahresbetrag ist ab Januar abrufbar', () => {
    const r = berechneBudgetDeckel({ ...basis, kassenBetragEuro: 3539 })
    expect(r.gedeckelt).toBe(false)
    expect(r.limitBisMonatEuro).toBeNull()
    expect(r.budgetAnteilEuro).toBe(3539)
  })

  it('deckelt auf den Jahresbetrag von 3539 EUR', () => {
    const r = berechneBudgetDeckel({ ...basis, kassenBetragEuro: 4000 })
    expect(r.gedeckelt).toBe(true)
    expect(r.budgetAnteilEuro).toBe(3539)
    expect(r.privatAnteilEuro).toBe(461)
    expect(r.greifenderDeckel).toBe('jahr')
    expect(r.grund).toContain('§ 42a')
  })

  it('ignoriert einen Uebertrag — § 42a kennt keinen', () => {
    const r = berechneBudgetDeckel({ ...basis, kassenBetragEuro: 4000, uebertragEuro: 800 })
    expect(r.limitJahrEuro).toBe(3539)
    expect(r.budgetAnteilEuro).toBe(3539)
  })
})

describe('budgetTopfFuer', () => {
  it('ordnet alle fuenf von der RPC erlaubten Werte zu', () => {
    // Quelle: 20260914000000_audit_persistenz_v9.sql:174 —
    // "Erlaubt: entlastung, verhinderung, carryover, haeusliche_pflege_36, private"
    expect(budgetTopfFuer('entlastung')).toBe('entlastung')
    expect(budgetTopfFuer('carryover')).toBe('entlastung')
    expect(budgetTopfFuer('verhinderung')).toBe('verhinderung')
    expect(budgetTopfFuer('haeusliche_pflege_36')).toBe('sachleistung_36')
    expect(budgetTopfFuer('private')).toBe('privat')
  })

  it('§ 36 und privat sind ausdruecklich ungedeckelt — mit hinterlegtem Grund', () => {
    expect(istGedeckelt(budgetTopfFuer('haeusliche_pflege_36'))).toBe(false)
    expect(istGedeckelt(budgetTopfFuer('private'))).toBe(false)
    expect(istGedeckelt(budgetTopfFuer('entlastung'))).toBe(true)
    expect(istGedeckelt(budgetTopfFuer('verhinderung'))).toBe(true)
    // Die Luecke ist benannt, nicht nur unbemerkt: § 36 ist pflegegradabhaengig
    // und es wird bewusst kein Satz erfunden.
    expect(UNGEDECKELTE_TOEPFE.sachleistung_36).toMatch(/§ 36/)
    expect(UNGEDECKELTE_TOEPFE.sachleistung_36).toMatch(/kein Betrag geraten/)
    expect(Object.keys(UNGEDECKELTE_TOEPFE).sort()).toEqual(['privat', 'sachleistung_36'])
  })

  it('carryover ist kein zweiter Topf — sonst waere der Uebertrag unbegrenzt', () => {
    expect(budgetTopfFuer('carryover')).toBe(budgetTopfFuer('entlastung'))
  })

  it('faengt das Vokabular aus lib/personal (verhinderungspflege) mit ab', () => {
    expect(budgetTopfFuer('verhinderungspflege')).toBe('verhinderung')
  })

  it('wirft bei unbekanntem Wert, statt still auf privat zu fallen', () => {
    expect(() => budgetTopfFuer('sonstiges')).toThrow(UnbekannterBudgetTypError)
  })
})

// ---------------------------------------------------------------------------
// 2 — Budgetlage aus der Datenbank
// ---------------------------------------------------------------------------

/**
 * Minimaler Supabase-Doppelgaenger: gibt je Tabelle ein festgelegtes Ergebnis
 * zurueck und protokolliert die Aufrufe. Bewusst kein Mock der Rechenlogik —
 * geprueft wird, was aus den gelesenen Zeilen wird.
 */
function fakeSupabase(tabellen: Record<string, { data: unknown; error: unknown }>) {
  const aufrufe: string[] = []
  const from = vi.fn((tabelle: string) => {
    aufrufe.push(tabelle)
    const antwort = tabellen[tabelle] ?? { data: null, error: null }
    const kette: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'lte', 'in', 'is', 'neq', 'update', 'insert']) {
      kette[m] = vi.fn(() => kette)
    }
    kette.maybeSingle = vi.fn(async () => antwort)
    kette.single = vi.fn(async () => antwort)
    // Terminale Kettenglieder ohne .maybeSingle(): das Ergebnis kommt beim
    // Awaiten der Kette selbst (PostgREST-Verhalten bei Listenabfragen).
    kette.then = (resolve: (v: unknown) => unknown) => Promise.resolve(antwort).then(resolve)
    return kette
  })
  return { client: { from } as never, aufrufe, from }
}

describe('ermittleBudgetLage', () => {
  it('nimmt die gesetzlichen Werte, wenn keine Budgetzeile existiert (Selbstzahler)', async () => {
    const { client } = fakeSupabase({
      client_budgets: { data: null, error: null },
      invoices: { data: [], error: null },
    })
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-05', topf: 'entlastung',
    })
    expect(lage.anspruchQuelle).toBe('gesetzlich')
    expect(lage.jahresanspruchEuro).toBe(1572)
    expect(lage.monatsanspruchEuro).toBe(131)
    expect(lage.uebertragEuro).toBe(0)
    expect(lage.verbrauchtJahrEuro).toBe(0)
  })

  it('nimmt den individuellen Anspruch aus client_budgets samt Uebertrag', async () => {
    const { client } = fakeSupabase({
      client_budgets: {
        data: { annual_amount: 1200, carryover_amount: 300, combined_annual_amount: 0 },
        error: null,
      },
      invoices: { data: [], error: null },
    })
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-05', topf: 'entlastung',
    })
    expect(lage.anspruchQuelle).toBe('client_budgets')
    expect(lage.jahresanspruchEuro).toBe(1200)
    expect(lage.uebertragEuro).toBe(300)
    expect(lage.monatsanspruchEuro).toBe(100)   // 1200 / 12 — Monats- und Jahresdeckel bleiben konsistent
  })

  it('summiert nur Positionen des geprueften Topfes', async () => {
    const { client } = fakeSupabase({
      client_budgets: { data: null, error: null },
      invoices: {
        data: [
          { id: 'inv-1', status: 'bezahlt', period_start: '2026-01-01' },
          { id: 'inv-2', status: 'freigegeben', period_start: '2026-02-01' },
        ],
        error: null,
      },
      invoice_items: {
        data: [
          { invoice_id: 'inv-1', amount: 100, budget_type: 'entlastung' },
          { invoice_id: 'inv-1', amount: 50, budget_type: 'private' },
          { invoice_id: 'inv-2', amount: 25, budget_type: 'carryover' },
          { invoice_id: 'inv-2', amount: 999, budget_type: 'verhinderung' },
        ],
        error: null,
      },
    })
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-03', topf: 'entlastung',
    })
    // 100 (entlastung) + 25 (carryover) — private und verhinderung zaehlen nicht
    expect(lage.verbrauchtJahrEuro).toBe(125)
    expect(lage.verbrauchtBisMonatEuro).toBe(125)
  })

  it('trennt Verbrauch bis zum Abrechnungsmonat vom Jahresverbrauch', async () => {
    const { client } = fakeSupabase({
      client_budgets: { data: null, error: null },
      invoices: {
        data: [
          { id: 'inv-1', status: 'bezahlt', period_start: '2026-01-01' },
          { id: 'inv-9', status: 'bezahlt', period_start: '2026-09-01' },
        ],
        error: null,
      },
      invoice_items: {
        data: [
          { invoice_id: 'inv-1', amount: 131, budget_type: 'entlastung' },
          { invoice_id: 'inv-9', amount: 400, budget_type: 'entlastung' },
        ],
        error: null,
      },
    })
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-03', topf: 'entlastung',
    })
    expect(lage.verbrauchtBisMonatEuro).toBe(131)
    expect(lage.verbrauchtJahrEuro).toBe(531)
  })

  it('stornierte und abgeschriebene Rechnungen verbrauchen keinen Anspruch', async () => {
    const { client } = fakeSupabase({
      client_budgets: { data: null, error: null },
      invoices: {
        data: [
          { id: 'inv-1', status: 'storniert', period_start: '2026-01-01' },
          { id: 'inv-2', status: 'abgeschrieben', period_start: '2026-02-01' },
        ],
        error: null,
      },
      invoice_items: { data: [], error: null },
    })
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-03', topf: 'entlastung',
    })
    expect(lage.verbrauchtJahrEuro).toBe(0)
  })

  it('fail-closed: Lesefehler auf client_budgets wirft', async () => {
    const { client } = fakeSupabase({
      client_budgets: { data: null, error: { message: 'permission denied' } },
    })
    await expect(ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-05', topf: 'entlastung',
    })).rejects.toThrow(BudgetLageNichtErmittelbarError)
  })

  it('fail-closed: Lesefehler auf invoices wirft', async () => {
    const { client } = fakeSupabase({
      client_budgets: { data: null, error: null },
      invoices: { data: null, error: { message: '42703' } },
    })
    await expect(ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-05', topf: 'entlastung',
    })).rejects.toThrow(/bisherige Rechnungen nicht lesbar/)
  })

  it('fail-closed: Jahr ohne hinterlegte gesetzliche Werte wirft', async () => {
    const { client } = fakeSupabase({ client_budgets: { data: null, error: null } })
    await expect(ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2019-05', topf: 'entlastung',
    })).rejects.toThrow(/Budgetwerte/)
  })
})

// ---------------------------------------------------------------------------
// 3 — Verdrahtung in der Rechnungserstellung
// ---------------------------------------------------------------------------

/**
 * Doppelgaenger fuer den vollen `createInvoiceDraft`-Weg: `clients`,
 * `client_budgets`, `invoices` (Liste + Einzelzeile + Update),
 * `invoice_items`, `billing_audit_trail`, plus die RPC.
 */
function draftSupabase(opts: {
  budgetZeile?: unknown
  bestandsRechnungen?: unknown[]
  bestandsPosten?: unknown[]
  rpc: Record<string, unknown>
  rechnungNachRpc: Record<string, unknown>
}) {
  const updates: Record<string, unknown>[] = []
  const auditEintraege: Record<string, unknown>[] = []
  let invoicesSelects = 0

  const from = vi.fn((tabelle: string) => {
    const kette: Record<string, unknown> = {}
    let letzteAntwort: { data: unknown; error: unknown } = { data: null, error: null }

    if (tabelle === 'clients') {
      letzteAntwort = {
        data: {
          id: CLIENT, first_name: 'Erika', last_name: 'Muster',
          insurance_name: 'AOK Hessen', insurance_number: '123',
          organization_id: ORG, pflegekasse_ik: '105815527',
        },
        error: null,
      }
    } else if (tabelle === 'client_budgets') {
      letzteAntwort = { data: opts.budgetZeile ?? null, error: null }
    } else if (tabelle === 'invoice_items') {
      letzteAntwort = { data: opts.bestandsPosten ?? [], error: null }
    }

    for (const m of ['select', 'eq', 'gte', 'lte', 'in', 'is', 'neq']) {
      kette[m] = vi.fn(() => kette)
    }
    kette.update = vi.fn((werte: Record<string, unknown>) => {
      updates.push({ tabelle, ...werte })
      return kette
    })
    kette.insert = vi.fn(async (werte: Record<string, unknown>) => {
      if (tabelle === 'billing_audit_trail') auditEintraege.push(werte)
      return { error: null }
    })

    if (tabelle === 'invoices') {
      // 1. Aufruf: Liste der Bestandsrechnungen (await auf der Kette)
      // 2. Aufruf: Faelligkeit — maybeSingle
      // 3. Aufruf: Rechnung nach RPC — maybeSingle
      invoicesSelects += 1
      const listenAntwort = { data: opts.bestandsRechnungen ?? [], error: null }
      const zeilenAntwort = { data: opts.rechnungNachRpc, error: null }
      const faelligkeit = {
        data: { id: 'inv-neu', due_date: null, payment_terms_days: 14, created_at: '2026-01-31T10:00:00Z' },
        error: null,
      }
      const nummer = invoicesSelects
      kette.maybeSingle = vi.fn(async () => (nummer === 2 ? faelligkeit : zeilenAntwort))
      kette.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(nummer === 1 ? listenAntwort : { error: null }).then(resolve)
      return kette
    }

    kette.maybeSingle = vi.fn(async () => letzteAntwort)
    kette.single = vi.fn(async () => letzteAntwort)
    kette.then = (resolve: (v: unknown) => unknown) => Promise.resolve(letzteAntwort).then(resolve)
    return kette
  })

  const client = {
    from,
    rpc: vi.fn().mockResolvedValue({ data: opts.rpc, error: null }),
  } as never

  return { client, updates, auditEintraege, from }
}

describe('createInvoiceDraft — Budgetdeckel im Rechnungsweg', () => {
  const rpcErfolg = {
    success: true,
    invoice_id: 'inv-neu',
    invoice_number: 'RE-2026-00001',
    total_amount: 400,
    line_count: 4,
    already_exists: false,
  }

  it('deckelt eine 400-EUR-Januarrechnung auf 131 EUR Kassenanteil', async () => {
    const { client, updates, auditEintraege } = draftSupabase({
      rpc: rpcErfolg,
      rechnungNachRpc: { id: 'inv-neu', total_amount: 400, budget_amount: 400, private_amount: 0, notes: null },
    })

    const ergebnis = await createInvoiceDraft(client, {
      clientId: CLIENT, periodMonth: '2026-01', budgetType: 'entlastung', actorId: ACTOR,
    })

    expect(ergebnis.budgetDeckel?.gedeckelt).toBe(true)
    const deckelUpdate = updates.find(u => 'budget_amount' in u)
    expect(deckelUpdate).toBeDefined()
    expect(deckelUpdate!.budget_amount).toBe(131)
    expect(deckelUpdate!.private_amount).toBe(269)
    expect(String(deckelUpdate!.notes)).toContain('Budgetdeckel')
    expect(auditEintraege.some(e => e.action === 'budget_capped')).toBe(true)
  })

  it('laesst total_amount unangetastet — nur der Kostentraeger aendert sich', async () => {
    const { client, updates } = draftSupabase({
      rpc: rpcErfolg,
      rechnungNachRpc: { id: 'inv-neu', total_amount: 400, budget_amount: 400, private_amount: 0, notes: null },
    })
    await createInvoiceDraft(client, {
      clientId: CLIENT, periodMonth: '2026-01', budgetType: 'entlastung', actorId: ACTOR,
    })
    const deckelUpdate = updates.find(u => 'budget_amount' in u)!
    expect(deckelUpdate).not.toHaveProperty('total_amount')
    expect(Number(deckelUpdate.budget_amount) + Number(deckelUpdate.private_amount)).toBe(400)
  })

  it('blockiert nicht — die Rechnung entsteht trotz Ueberschreitung', async () => {
    const { client } = draftSupabase({
      rpc: rpcErfolg,
      rechnungNachRpc: { id: 'inv-neu', total_amount: 400, budget_amount: 400, private_amount: 0, notes: null },
    })
    const ergebnis = await createInvoiceDraft(client, {
      clientId: CLIENT, periodMonth: '2026-01', budgetType: 'entlastung', actorId: ACTOR,
    })
    expect(ergebnis.invoiceId).toBe('inv-neu')
    expect(ergebnis.invoiceNumber).toBe('RE-2026-00001')
    expect(ergebnis.totalAmountCents).toBe(40000)
  })

  it('schreibt nichts, wenn der Betrag im Anspruch liegt', async () => {
    const { client, updates, auditEintraege } = draftSupabase({
      rpc: { ...rpcErfolg, total_amount: 100 },
      rechnungNachRpc: { id: 'inv-neu', total_amount: 100, budget_amount: 100, private_amount: 0, notes: null },
    })
    const ergebnis = await createInvoiceDraft(client, {
      clientId: CLIENT, periodMonth: '2026-01', budgetType: 'entlastung', actorId: ACTOR,
    })
    expect(ergebnis.budgetDeckel?.gedeckelt).toBe(false)
    expect(updates.find(u => 'budget_amount' in u)).toBeUndefined()
    expect(auditEintraege.some(e => e.action === 'budget_capped')).toBe(false)
  })

  it('beruecksichtigt bereits abgerechnete Monate', async () => {
    const { client, updates } = draftSupabase({
      rpc: { ...rpcErfolg, total_amount: 300 },
      rechnungNachRpc: { id: 'inv-neu', total_amount: 300, budget_amount: 300, private_amount: 0, notes: null },
      bestandsRechnungen: [
        { id: 'inv-jan', status: 'bezahlt', period_start: '2026-01-01' },
        { id: 'inv-feb', status: 'bezahlt', period_start: '2026-02-01' },
      ],
      bestandsPosten: [
        { invoice_id: 'inv-jan', amount: 131, budget_type: 'entlastung' },
        { invoice_id: 'inv-feb', amount: 131, budget_type: 'entlastung' },
      ],
    })
    await createInvoiceDraft(client, {
      clientId: CLIENT, periodMonth: '2026-03', budgetType: 'entlastung', actorId: ACTOR,
    })
    const deckelUpdate = updates.find(u => 'budget_amount' in u)!
    expect(deckelUpdate.budget_amount).toBe(131)   // 3 × 131 − 262
    expect(deckelUpdate.private_amount).toBe(169)
  })

  it('§-36-Sachleistung wird nicht gedeckelt und liest kein Budget', async () => {
    const { client, from, updates } = draftSupabase({
      rpc: { ...rpcErfolg, total_amount: 1800 },
      rechnungNachRpc: { id: 'inv-neu', total_amount: 1800, budget_amount: 1800, private_amount: 0, notes: null },
    })
    const ergebnis = await createInvoiceDraft(client, {
      clientId: CLIENT, periodMonth: '2026-01', budgetType: 'haeusliche_pflege_36', actorId: ACTOR,
    })
    expect(ergebnis.budgetDeckel).toBeNull()
    expect(from.mock.calls.map(c => c[0])).not.toContain('client_budgets')
    expect(updates.find(u => 'budget_amount' in u)).toBeUndefined()
  })

  it('Privatrechnungen werden nicht gedeckelt und lesen kein Budget', async () => {
    const { client, from, updates } = draftSupabase({
      rpc: { ...rpcErfolg, total_amount: 2000 },
      rechnungNachRpc: { id: 'inv-neu', total_amount: 2000, budget_amount: 0, private_amount: 2000, notes: null },
    })
    const ergebnis = await createInvoiceDraft(client, {
      clientId: CLIENT, periodMonth: '2026-01', budgetType: 'private', actorId: ACTOR,
    })
    expect(ergebnis.budgetDeckel).toBeNull()
    expect(from.mock.calls.map(c => c[0])).not.toContain('client_budgets')
    expect(updates.find(u => 'budget_amount' in u)).toBeUndefined()
  })

  it('bei already_exists wird nicht erneut gedeckelt', async () => {
    const { client, updates } = draftSupabase({
      rpc: { ...rpcErfolg, already_exists: true },
      rechnungNachRpc: { id: 'inv-neu', total_amount: 400, budget_amount: 400, private_amount: 0, notes: null },
    })
    const ergebnis = await createInvoiceDraft(client, {
      clientId: CLIENT, periodMonth: '2026-01', budgetType: 'entlastung', actorId: ACTOR,
    })
    expect(ergebnis.alreadyExists).toBe(true)
    expect(ergebnis.budgetDeckel).toBeNull()
    expect(updates.find(u => 'budget_amount' in u)).toBeUndefined()
  })

  it('fail-closed: nicht lesbare Budgetlage verhindert den RPC-Aufruf', async () => {
    const from = vi.fn((tabelle: string) => {
      const kette: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'gte', 'lte', 'in']) kette[m] = vi.fn(() => kette)
      const antwort = tabelle === 'clients'
        ? { data: { id: CLIENT, organization_id: ORG }, error: null }
        : { data: null, error: { message: 'permission denied for table client_budgets' } }
      kette.single = vi.fn(async () => antwort)
      kette.maybeSingle = vi.fn(async () => antwort)
      kette.then = (resolve: (v: unknown) => unknown) => Promise.resolve(antwort).then(resolve)
      return kette
    })
    const rpc = vi.fn()
    const client = { from, rpc } as never

    await expect(createInvoiceDraft(client, {
      clientId: CLIENT, periodMonth: '2026-01', budgetType: 'entlastung', actorId: ACTOR,
    })).rejects.toThrow(BudgetLageNichtErmittelbarError)

    // Der entscheidende Punkt: es wurde nichts angelegt.
    expect(rpc).not.toHaveBeenCalled()
  })

  it('fail-closed: unbekannter budget_type verhindert den RPC-Aufruf', async () => {
    const { client } = draftSupabase({
      rpc: rpcErfolg,
      rechnungNachRpc: { id: 'inv-neu', total_amount: 10, budget_amount: 10, private_amount: 0, notes: null },
    })
    await expect(createInvoiceDraft(client, {
      clientId: CLIENT, periodMonth: '2026-01', budgetType: 'irgendwas', actorId: ACTOR,
    })).rejects.toThrow(UnbekannterBudgetTypError)
  })
})

describe('wendeBudgetDeckelAn — Fehlerverhalten beim Schreiben', () => {
  const lage: BudgetLage = {
    topf: 'entlastung',
    jahr: 2026,
    periodMonth: '2026-01',
    jahresanspruchEuro: 1572,
    monatsanspruchEuro: 131,
    uebertragEuro: 0,
    verbrauchtBisMonatEuro: 0,
    verbrauchtJahrEuro: 0,
    anspruchQuelle: 'gesetzlich',
  }

  it('wirft, wenn das Update fehlschlaegt — eine ungedeckelte Forderung bleibt nicht still stehen', async () => {
    const kette: Record<string, unknown> = {}
    for (const m of ['select', 'eq']) kette[m] = vi.fn(() => kette)
    kette.maybeSingle = vi.fn(async () => ({
      data: { id: 'inv-1', total_amount: 400, budget_amount: 400, private_amount: 0, notes: null },
      error: null,
    }))
    kette.update = vi.fn(() => ({
      eq: vi.fn(async () => ({ error: { message: 'RLS' } })),
    }))
    const client = { from: vi.fn(() => kette) } as never

    await expect(wendeBudgetDeckelAn(client, {
      invoiceId: 'inv-1', organizationId: ORG, actorId: ACTOR, lage,
    })).rejects.toThrow(/Budgetdeckel konnte nicht angewendet werden/)
  })

  it('wirft, wenn die Rechnung nach der Erstellung nicht lesbar ist', async () => {
    const kette: Record<string, unknown> = {}
    for (const m of ['select', 'eq']) kette[m] = vi.fn(() => kette)
    kette.maybeSingle = vi.fn(async () => ({ data: null, error: { message: 'weg' } }))
    const client = { from: vi.fn(() => kette) } as never

    await expect(wendeBudgetDeckelAn(client, {
      invoiceId: 'inv-1', organizationId: ORG, actorId: ACTOR, lage,
    })).rejects.toThrow(/nicht lesbar/)
  })

  it('addiert den Ueberschuss auf einen bereits vorhandenen Privatanteil', async () => {
    const updates: Record<string, unknown>[] = []
    const kette: Record<string, unknown> = {}
    for (const m of ['select', 'eq']) kette[m] = vi.fn(() => kette)
    kette.maybeSingle = vi.fn(async () => ({
      data: { id: 'inv-1', total_amount: 500, budget_amount: 400, private_amount: 100, notes: 'Bestand' },
      error: null,
    }))
    kette.update = vi.fn((werte: Record<string, unknown>) => {
      updates.push(werte)
      return { eq: vi.fn(async () => ({ error: null })) }
    })
    kette.insert = vi.fn(async () => ({ error: null }))
    const client = { from: vi.fn(() => kette) } as never

    const ergebnis = await wendeBudgetDeckelAn(client, {
      invoiceId: 'inv-1', organizationId: ORG, actorId: ACTOR, lage,
    })

    expect(ergebnis?.budgetAnteilEuro).toBe(131)
    expect(updates[0].private_amount).toBe(369)   // 100 bestehend + 269 Ueberschuss
    expect(String(updates[0].notes)).toContain('Bestand')
  })
})

describe('deckelAusLage', () => {
  it('reicht die Lage unveraendert an die Rechenlogik durch', () => {
    const lage: BudgetLage = {
      topf: 'entlastung', jahr: 2026, periodMonth: '2026-02',
      jahresanspruchEuro: 1572, monatsanspruchEuro: 131, uebertragEuro: 0,
      verbrauchtBisMonatEuro: 0, verbrauchtJahrEuro: 0, anspruchQuelle: 'gesetzlich',
    }
    const r = deckelAusLage(lage, 500)
    expect(r.budgetAnteilEuro).toBe(262)   // 2 × 131
    expect(r.privatAnteilEuro).toBe(238)
  })
})

// ---------------------------------------------------------------------------
// 5 — Befunde vom 27.08.2026
// ---------------------------------------------------------------------------
//
// Drei Wege, auf denen der Deckel eine falsche Budgetlage bekam:
//   B) der gedeckelte Privatanteil zaehlte weiter als Kassenverbrauch,
//   C) geloeschte Rechnungen verbrauchten dauerhaft Budget,
//   D) der § 45b-Uebertrag wurde ganzjaehrig gewaehrt, obwohl er am 30.06.
//      verfaellt.
// Der Doppelgaenger `fakeSupabase` ist derselbe wie oben — geprueft wird
// ausschliesslich, was aus den gelesenen Zeilen wird.

describe('uebertragVerfallsdatum / uebertragGiltNoch (§ 45b Abs. 1 S. 4)', () => {
  it('nimmt den gepflegten Verfallstag aus client_budgets', () => {
    expect(uebertragVerfallsdatum('2026-06-30', 2026)).toBe('2026-06-30')
  })

  it('schneidet einen Zeitstempel auf den Kalendertag', () => {
    expect(uebertragVerfallsdatum('2026-06-30T23:59:59Z', 2026)).toBe('2026-06-30')
  })

  it('faellt auf den gesetzlichen Stichtag zurueck, wenn nichts gepflegt ist', () => {
    // Kein geratener Ersatzwert, sondern die Regel selbst: ohne Stichtag
    // waere der Uebertrag unbegrenzt gueltig.
    expect(uebertragVerfallsdatum(null, 2026)).toBe(`2026-${UEBERTRAG_VERFALL_MONAT_TAG}`)
    expect(uebertragVerfallsdatum('', 2026)).toBe('2026-06-30')
    expect(uebertragVerfallsdatum('unsinn', 2026)).toBe('2026-06-30')
  })

  it('gilt fuer den gesamten Juni und ab Juli nicht mehr', () => {
    expect(uebertragGiltNoch('2026-01', '2026-06-30')).toBe(true)
    expect(uebertragGiltNoch('2026-06', '2026-06-30')).toBe(true)
    expect(uebertragGiltNoch('2026-07', '2026-06-30')).toBe(false)
    expect(uebertragGiltNoch('2026-12', '2026-06-30')).toBe(false)
  })
})

describe('ermittleBudgetLage — Uebertrag verfaellt zum 30.06. (Befund D)', () => {
  const mitUebertrag = (expires: string | null) => fakeSupabase({
    client_budgets: {
      data: {
        annual_amount: 1572,
        carryover_amount: 300,
        carryover_expires: expires,
        combined_annual_amount: 0,
      },
      error: null,
    },
    invoices: { data: [], error: null },
  })

  it('gewaehrt den Uebertrag im Juni noch', async () => {
    const { client } = mitUebertrag('2026-06-30')
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-06', topf: 'entlastung',
    })
    expect(lage.uebertragEuro).toBe(300)
    expect(lage.uebertragVerfallen).toBe(false)
    expect(lage.uebertragVerfaelltAm).toBe('2026-06-30')
  })

  it('streicht ihn ab Juli — vorher erhoehte er den Deckel ganzjaehrig', async () => {
    const { client } = mitUebertrag('2026-06-30')
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-07', topf: 'entlastung',
    })
    expect(lage.uebertragEuro).toBe(0)
    expect(lage.uebertragVerfallen).toBe(true)
  })

  it('unterscheidet „verfallen" von „gab es nie"', async () => {
    const { client } = fakeSupabase({
      client_budgets: {
        data: { annual_amount: 1572, carryover_amount: 0, carryover_expires: '2026-06-30', combined_annual_amount: 0 },
        error: null,
      },
      invoices: { data: [], error: null },
    })
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-07', topf: 'entlastung',
    })
    expect(lage.uebertragEuro).toBe(0)
    expect(lage.uebertragVerfallen).toBe(false)
  })

  it('wendet den gesetzlichen Stichtag auch ohne gepflegtes carryover_expires an', async () => {
    const { client } = mitUebertrag(null)
    const juni = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-06', topf: 'entlastung',
    })
    const juli = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-07', topf: 'entlastung',
    })
    expect(juni.uebertragEuro).toBe(300)
    expect(juli.uebertragEuro).toBe(0)
  })

  it('fuehrt fuer § 42a gar keinen Verfallstag — dort gibt es keinen Uebertrag', async () => {
    const { client } = mitUebertrag('2026-06-30')
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-07', topf: 'verhinderung',
    })
    expect(lage.uebertragEuro).toBe(0)
    expect(lage.uebertragVerfaelltAm).toBeNull()
    expect(lage.uebertragVerfallen).toBe(false)
  })

  it('der Deckel folgt dem Verfall — Juli hat 300 EUR weniger Spielraum', async () => {
    const { client } = mitUebertrag('2026-06-30')
    const juni = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-06', topf: 'entlastung',
    })
    const juli = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-07', topf: 'entlastung',
    })
    expect(deckelAusLage(juni, 0).limitJahrEuro).toBe(1872)
    expect(deckelAusLage(juli, 0).limitJahrEuro).toBe(1572)
  })
})

describe('ermittleBudgetLage — gedeckelter Privatanteil (Befund B)', () => {
  it('zaehlt nur den Kassenanteil, nicht die volle Positionssumme', async () => {
    // Januar: 300 EUR Leistungen, auf 131 EUR Kassenanteil gedeckelt,
    // 169 EUR privat. Die Positionen tragen weiterhin budget_type
    // 'entlastung' — `wendeBudgetDeckelAn()` fasst sie nicht an.
    const { client } = fakeSupabase({
      client_budgets: { data: null, error: null },
      invoices: {
        data: [{
          id: 'inv-1', status: 'bezahlt', period_start: '2026-01-01',
          budget_amount: 131, correction_of: null, correction_type: null,
        }],
        error: null,
      },
      invoice_items: {
        data: [{ invoice_id: 'inv-1', amount: 300, budget_type: 'entlastung' }],
        error: null,
      },
    })
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-02', topf: 'entlastung',
    })
    // Vorher: 300 — der Klient verlor 169 EUR Budget, die er privat bezahlt hat.
    expect(lage.verbrauchtJahrEuro).toBe(131)
    expect(lage.verbrauchtBisMonatEuro).toBe(131)
    // Februar: kumulierter Anspruch 262, verbraucht 131 → 131 verfuegbar.
    expect(deckelAusLage(lage, 200).verfuegbarEuro).toBe(131)
  })

  it('nimmt die Positionssumme, wenn budget_amount nicht gefuehrt wird', async () => {
    // Korrekturrechnungen setzen den Kopfbetrag nicht — dann ist die
    // Positionssumme die einzige belastbare Groesse.
    const { client } = fakeSupabase({
      client_budgets: { data: null, error: null },
      invoices: {
        data: [{ id: 'inv-1', status: 'bezahlt', period_start: '2026-01-01', budget_amount: null }],
        error: null,
      },
      invoice_items: {
        data: [{ invoice_id: 'inv-1', amount: 90, budget_type: 'entlastung' }],
        error: null,
      },
    })
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-02', topf: 'entlastung',
    })
    expect(lage.verbrauchtJahrEuro).toBe(90)
  })

  it('nimmt die Positionssumme, wenn die Rechnung mehrere Toepfe mischt', async () => {
    // Dann sagt der Kopfbetrag nichts ueber den geprueften Topf aus.
    const { client } = fakeSupabase({
      client_budgets: { data: null, error: null },
      invoices: {
        data: [{ id: 'inv-1', status: 'bezahlt', period_start: '2026-01-01', budget_amount: 500 }],
        error: null,
      },
      invoice_items: {
        data: [
          { invoice_id: 'inv-1', amount: 80, budget_type: 'entlastung' },
          { invoice_id: 'inv-1', amount: 420, budget_type: 'verhinderung' },
        ],
        error: null,
      },
    })
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-02', topf: 'entlastung',
    })
    expect(lage.verbrauchtJahrEuro).toBe(80)
  })

  it('deckelt gegen die Positionssumme, falls der Kopfbetrag darueber laege', async () => {
    const { client } = fakeSupabase({
      client_budgets: { data: null, error: null },
      invoices: {
        data: [{ id: 'inv-1', status: 'bezahlt', period_start: '2026-01-01', budget_amount: 999 }],
        error: null,
      },
      invoice_items: {
        data: [{ invoice_id: 'inv-1', amount: 100, budget_type: 'entlastung' }],
        error: null,
      },
    })
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-02', topf: 'entlastung',
    })
    expect(lage.verbrauchtJahrEuro).toBe(100)
  })

  it('eine vollstaendig gedeckelte Rechnung (budget_amount 0) verbraucht nichts', async () => {
    const { client } = fakeSupabase({
      client_budgets: { data: null, error: null },
      invoices: {
        data: [{ id: 'inv-1', status: 'bezahlt', period_start: '2026-01-01', budget_amount: 0 }],
        error: null,
      },
      invoice_items: {
        data: [{ invoice_id: 'inv-1', amount: 250, budget_type: 'entlastung' }],
        error: null,
      },
    })
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-02', topf: 'entlastung',
    })
    expect(lage.verbrauchtJahrEuro).toBe(0)
  })
})

describe('ermittleBudgetLage — geloeschte und ersetzte Rechnungen (Befund C/E)', () => {
  it('filtert geloeschte Rechnungen bereits in der Abfrage (deleted_at IS NULL)', async () => {
    // Ohne diesen Filter verbrauchte ein geloeschter Entwurf dauerhaft
    // Budget, obwohl die Rechnungs-RPC ihn ueber die Idempotenz
    // (`deleted_at IS NULL`) gar nicht mehr kennt.
    const { client, from } = fakeSupabase({
      client_budgets: { data: null, error: null },
      invoices: { data: [], error: null },
    })
    await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-03', topf: 'entlastung',
    })
    const invoiceKette = from.mock.results
      .map(r => r.value as Record<string, { mock: { calls: unknown[][] } }>)
      .find(k => (k.is as { mock: { calls: unknown[][] } }).mock.calls.length > 0)
    expect(invoiceKette).toBeDefined()
    expect((invoiceKette!.is as unknown as { mock: { calls: unknown[][] } }).mock.calls[0])
      .toEqual(['deleted_at', null])
  })

  it('zaehlt eine Korrekturrechnung statt des ersetzten Originals', async () => {
    // correctInvoice() schreibt den vollstaendigen korrigierten Betrag, nicht
    // die Differenz. Zaehlte man beide, verbrauchte eine Korrektur das
    // Budget ein zweites Mal.
    const { client } = fakeSupabase({
      client_budgets: { data: null, error: null },
      invoices: {
        data: [
          { id: 'inv-1', status: 'freigegeben', period_start: '2026-01-01', budget_amount: 200, correction_of: null, correction_type: null },
          { id: 'inv-k', status: 'entwurf', period_start: '2026-01-01', budget_amount: null, correction_of: 'inv-1', correction_type: 'korrektur' },
        ],
        error: null,
      },
      invoice_items: {
        data: [
          { invoice_id: 'inv-1', amount: 200, budget_type: 'entlastung' },
          { invoice_id: 'inv-k', amount: 120, budget_type: 'entlastung' },
        ],
        error: null,
      },
    })
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-02', topf: 'entlastung',
    })
    expect(lage.verbrauchtJahrEuro).toBe(120)
  })

  it('eine Gutschrift ersetzt das Original NICHT', async () => {
    const { client } = fakeSupabase({
      client_budgets: { data: null, error: null },
      invoices: {
        data: [
          { id: 'inv-1', status: 'freigegeben', period_start: '2026-01-01', budget_amount: 200, correction_of: null, correction_type: null },
          { id: 'inv-g', status: 'entwurf', period_start: '2026-01-01', budget_amount: null, correction_of: 'inv-1', correction_type: 'gutschrift' },
        ],
        error: null,
      },
      invoice_items: {
        data: [{ invoice_id: 'inv-1', amount: 200, budget_type: 'entlastung' }],
        error: null,
      },
    })
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-02', topf: 'entlastung',
    })
    expect(lage.verbrauchtJahrEuro).toBe(200)
  })

  it('ein storniertes Original bleibt storniert, auch wenn eine Korrektur darauf zeigt', async () => {
    const { client } = fakeSupabase({
      client_budgets: { data: null, error: null },
      invoices: {
        data: [
          { id: 'inv-1', status: 'storniert', period_start: '2026-01-01', budget_amount: 200 },
          { id: 'inv-k', status: 'entwurf', period_start: '2026-01-01', budget_amount: null, correction_of: 'inv-1', correction_type: 'korrektur' },
        ],
        error: null,
      },
      invoice_items: {
        data: [
          { invoice_id: 'inv-1', amount: 200, budget_type: 'entlastung' },
          { invoice_id: 'inv-k', amount: 120, budget_type: 'entlastung' },
        ],
        error: null,
      },
    })
    const lage = await ermittleBudgetLage(client, {
      clientId: CLIENT, organizationId: ORG, periodMonth: '2026-02', topf: 'entlastung',
    })
    expect(lage.verbrauchtJahrEuro).toBe(120)
  })
})
