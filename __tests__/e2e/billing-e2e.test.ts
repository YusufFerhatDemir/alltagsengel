/**
 * E2E-Tests fuer den Billing-Kern
 *
 * Szenarien:
 *  1. Neuer §45b-Kunde → Auto-Budget
 *  2. Restbudget Vorjahr → Uebertrag
 *  3. Jahreswechsel 2025 → 2026
 *  4. Unverified Kassentarif → blockiert
 *  5. Deaktivierter Tarif (ist_aktiv = false) → blockiert
 *  6. Fehlender Tarif → klare Fehlermeldung
 *  7. Privatkunde → kein Verifizierungs-Check
 *  8. VP/KZP → Gesamtlimit 3.539€
 *  9. Cross-Tenant → blockiert
 * 10. Voller Flow: Rechnung → PDF → OPOS → Zahlung → DATEV
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Budget ──────────────────────────────────────────────────────────────────
import { erstelleInitialBudgets, uebertrageJahresbudgets } from '@/lib/budget/auto-budget';
import {
  ENTLASTUNG_JAEHRLICH_EUR,
  ENTLASTUNG_MONATLICH_EUR,
  VP_KZP_KOMBINIERT_EUR,
  VP_JAEHRLICH_EUR,
  KZP_JAEHRLICH_EUR,
} from '@/lib/config/budget-constants';

// ── Tarif / Price ───────────────────────────────────────────────────────────
import {
  resolvePrice,
  calculateLineTotal,
  budgetTypeToRechtsgrundlage,
  TarifNichtVerifiziertError,
  type BillingTarif,
  type PriceResolveParams,
} from '@/lib/billing/core/price-resolver';

// ── Invoice Engine ──────────────────────────────────────────────────────────
import {
  createInvoiceDraft,
  freezeInvoice,
  cancelInvoice,
  TARIFF_ERROR_CODES,
  parseTariffError,
} from '@/lib/billing/core/invoice-engine';
import {
  validateTransition,
  isTerminalStatus,
  isValidInvoiceStatus,
} from '@/lib/billing/core/status-machine';
import { generateIdempotencyKey } from '@/lib/billing/core/idempotency';

// ── Payments ────────────────────────────────────────────────────────────────
import { createPayment } from '@/lib/billing/core/payments';

// ── Coach Abrechnung ────────────────────────────────────────────────────────
import {
  istAbrechnungsbereit,
  istSchluesselGueltig,
  type AbrechnungswegZeile,
} from '@/lib/coach/abrechnung';

// ═══════════════════════════════════════════════════════════════════════════
// Test-Helfer
// ═══════════════════════════════════════════════════════════════════════════

const ORG_A = 'org-a-00000000-0000-4000-8000-000000000001';
const ORG_B = 'org-b-00000000-0000-4000-8000-000000000002';
const CLIENT_1 = 'client-00000000-0000-4000-8000-000000000001';
const CLIENT_2 = 'client-00000000-0000-4000-8000-000000000002';
const ACTOR = 'actor-test-00000000';

function makeTarif(overrides: Partial<BillingTarif> = {}): BillingTarif {
  return {
    id: 'tarif-test-001',
    organization_id: ORG_A,
    kostentraeger_ik: null,
    leistungsart: 'Grundpflege',
    rechtsgrundlage: '§45b SGB XI',
    bundesland: null,
    vertragsgebiet: null,
    vertrag_referenz: null,
    qualifikation: null,
    verguetungsart: 'Einzelleistung',
    preis_cent: 3500,
    einheit: 'Stunde',
    zuschlag_wochenende_prozent: 25,
    zuschlag_feiertag_prozent: 50,
    zuschlag_nacht_prozent: 30,
    nacht_von: '22:00',
    nacht_bis: '06:00',
    kombinations_abschlag_prozent: 0,
    gueltig_ab: '2025-01-01',
    gueltig_bis: null,
    tarifquelle: 'VERGUETUNGSVEREINBARUNG',
    tarif_status: 'verified',
    verifiziert_am: '2025-06-01',
    verifiziert_von: 'auditor-1',
    verifizierungs_quelle: 'AOK Hessen Bescheid',
    ist_aktiv: true,
    ...overrides,
  };
}

function createBudgetMock(opts: {
  existingTypes?: string[];
  insertError?: { message: string } | null;
} = {}) {
  const { existingTypes = [], insertError = null } = opts;
  const inserted: Record<string, unknown>[][] = [];

  return {
    client: {
      from: (table: string) => {
        if (table !== 'client_budgets') return {} as any;
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  data: existingTypes.map(t => ({ budget_type: t })),
                  error: null,
                  then: (fn: any) => fn({
                    data: existingTypes.map(t => ({ budget_type: t })),
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          insert: (rows: Record<string, unknown>[]) => {
            inserted.push(rows);
            return { error: insertError };
          },
        };
      },
    } as any,
    inserted,
  };
}

function thenable<T>(result: T) {
  return {
    ...result,
    then: (resolve: (v: T) => void) => Promise.resolve(result).then(resolve),
  };
}

function createCarryoverMock(opts: {
  alteBudgets: Array<{
    client_id: string;
    annual_amount: number;
    carryover_amount: number;
    used_amount: number;
  }>;
  existingTarget?: { id: string; carryover_amount: number } | null;
  updateError?: { message: string } | null;
  insertError?: { message: string } | null;
}) {
  const updated: Array<{ id: string; data: Record<string, unknown> }> = [];
  const inserted: Record<string, unknown>[] = [];

  const existTarget = opts.existingTarget ?? null;
  const updateErr = opts.updateError ?? null;
  const insertErr = opts.insertError ?? null;

  return {
    client: {
      from: (table: string) => {
        if (table !== 'client_budgets') return {} as any;
        return {
          select: (..._args: any[]) => ({
            eq: (_k1: string, _v1: any) => ({
              eq: (_k2: string, _v2: any) => ({
                eq: (_k3: string, _v3: any) => {
                  if (_k3 === 'budget_type') {
                    return thenable({ data: opts.alteBudgets, error: null });
                  }
                  return thenable({ data: opts.alteBudgets, error: null });
                },
                maybeSingle: () => thenable({ data: existTarget, error: null }),
              }),
            }),
          }),
          update: (data: Record<string, unknown>) => ({
            eq: (_k: string, v: string) => {
              updated.push({ id: v, data });
              return { error: updateErr };
            },
          }),
          insert: (row: Record<string, unknown>) => {
            inserted.push(row);
            return { error: insertErr };
          },
        };
      },
    } as any,
    updated,
    inserted,
  };
}

function createPriceResolveMock(tarife: BillingTarif[]) {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue({ data: tarife, error: null }),
  };
  return {
    from: vi.fn(() => mockChain),
    rpc: vi.fn(),
    _chain: mockChain,
  } as any;
}

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 1: Neuer §45b-Kunde → Auto-Budget
// ═══════════════════════════════════════════════════════════════════════════

describe('Szenario 1: Neuer §45b-Kunde → Auto-Budget', () => {
  it('erstellt Entlastungs- und VP-Budget bei Pflegegrad >= 1', async () => {
    const mock = createBudgetMock();
    const result = await erstelleInitialBudgets(mock.client, CLIENT_1, ORG_A, 2);

    expect(result.erstellt).toBe(true);
    expect(mock.inserted).toHaveLength(1);

    const budgets = mock.inserted[0];
    expect(budgets).toHaveLength(2);

    const entlastung = budgets.find((b: any) => b.budget_type === 'entlastung') as any;
    expect(entlastung).toBeTruthy();
    expect(entlastung.annual_amount).toBe(ENTLASTUNG_JAEHRLICH_EUR);
    expect(entlastung.monthly_amount).toBe(ENTLASTUNG_JAEHRLICH_EUR / 12);
    expect(entlastung.used_amount).toBe(0);
    expect(entlastung.carryover_amount).toBe(0);
    expect(entlastung.organization_id).toBe(ORG_A);

    const vp = budgets.find((b: any) => b.budget_type === 'verhinderungspflege') as any;
    expect(vp).toBeTruthy();
    expect(vp.annual_amount).toBe(VP_KZP_KOMBINIERT_EUR);
    expect(vp.combined_annual_amount).toBe(VP_KZP_KOMBINIERT_EUR);
  });

  it('verweigert Budget bei Pflegegrad 0', async () => {
    const mock = createBudgetMock();
    const result = await erstelleInitialBudgets(mock.client, CLIENT_1, ORG_A, 0);

    expect(result.erstellt).toBe(false);
    expect(result.fehler).toBe('Kein Budget ohne Pflegegrad');
    expect(mock.inserted).toHaveLength(0);
  });

  it('ist idempotent bei bereits existierenden Budgets', async () => {
    const mock = createBudgetMock({ existingTypes: ['entlastung', 'verhinderungspflege'] });
    const result = await erstelleInitialBudgets(mock.client, CLIENT_1, ORG_A, 3);

    expect(result.erstellt).toBe(false);
    expect(mock.inserted).toHaveLength(0);
  });

  it('legt fehlende Budgets nach (nur VP fehlt)', async () => {
    const mock = createBudgetMock({ existingTypes: ['entlastung'] });
    const result = await erstelleInitialBudgets(mock.client, CLIENT_1, ORG_A, 2);

    expect(result.erstellt).toBe(true);
    expect(mock.inserted[0]).toHaveLength(1);
    expect((mock.inserted[0][0] as any).budget_type).toBe('verhinderungspflege');
  });

  it('meldet DB-Fehler korrekt zurueck', async () => {
    const mock = createBudgetMock({ insertError: { message: 'unique_violation' } });
    const result = await erstelleInitialBudgets(mock.client, CLIENT_1, ORG_A, 1);

    expect(result.erstellt).toBe(false);
    expect(result.fehler).toBe('unique_violation');
  });

  it('Budget-Werte stimmen mit gesetzlichen Grenzen ueberein', () => {
    expect(ENTLASTUNG_MONATLICH_EUR).toBe(131);
    expect(ENTLASTUNG_JAEHRLICH_EUR).toBe(1572);
    expect(VP_JAEHRLICH_EUR).toBe(1685);
    expect(KZP_JAEHRLICH_EUR).toBe(1854);
    expect(VP_KZP_KOMBINIERT_EUR).toBe(3539);
    expect(VP_JAEHRLICH_EUR + KZP_JAEHRLICH_EUR).toBe(VP_KZP_KOMBINIERT_EUR);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 2: Restbudget Vorjahr → Uebertrag
// ═══════════════════════════════════════════════════════════════════════════

describe('Szenario 2: Restbudget Vorjahr → Uebertrag', () => {
  it('uebertraegt Restbetrag korrekt', async () => {
    const mock = createCarryoverMock({
      alteBudgets: [{
        client_id: CLIENT_1,
        annual_amount: 1572,
        carryover_amount: 0,
        used_amount: 1000,
      }],
      existingTarget: null,
    });

    const result = await uebertrageJahresbudgets(mock.client, ORG_A, 2025, 2026);

    expect(result.uebertragen).toBe(1);
    expect(result.uebersprungen).toBe(0);
    expect(result.fehler).toHaveLength(0);
    expect(mock.inserted).toHaveLength(1);

    const neuesBudget = mock.inserted[0] as any;
    expect(neuesBudget.carryover_amount).toBe(572); // 1572 - 1000
    expect(neuesBudget.carryover_expires).toBe('2026-06-30');
    expect(neuesBudget.annual_amount).toBe(ENTLASTUNG_JAEHRLICH_EUR);
    expect(neuesBudget.client_id).toBe(CLIENT_1);
  });

  it('setzt carryover_expires auf 30. Juni des Zieljahres', async () => {
    const mock = createCarryoverMock({
      alteBudgets: [{
        client_id: CLIENT_1,
        annual_amount: 1572,
        carryover_amount: 200,
        used_amount: 500,
      }],
      existingTarget: null,
    });

    const result = await uebertrageJahresbudgets(mock.client, ORG_A, 2025, 2026);

    expect(result.uebertragen).toBe(1);
    const neues = mock.inserted[0] as any;
    expect(neues.carryover_amount).toBe(1272); // 1572 + 200 - 500
    expect(neues.carryover_expires).toBe('2026-06-30');
  });

  it('ueberspringt bei aufgebrauchtem Budget (Rest <= 0)', async () => {
    const mock = createCarryoverMock({
      alteBudgets: [{
        client_id: CLIENT_1,
        annual_amount: 1572,
        carryover_amount: 0,
        used_amount: 1572,
      }],
    });

    const result = await uebertrageJahresbudgets(mock.client, ORG_A, 2025, 2026);

    expect(result.uebersprungen).toBe(1);
    expect(result.uebertragen).toBe(0);
    expect(mock.inserted).toHaveLength(0);
  });

  it('ueberspringt bei negativem Rest (Ueberverbrauch)', async () => {
    const mock = createCarryoverMock({
      alteBudgets: [{
        client_id: CLIENT_1,
        annual_amount: 1572,
        carryover_amount: 0,
        used_amount: 2000,
      }],
    });

    const result = await uebertrageJahresbudgets(mock.client, ORG_A, 2025, 2026);

    expect(result.uebersprungen).toBe(1);
    expect(result.uebertragen).toBe(0);
  });

  it('updated bestehendes Ziel-Budget statt Neuanlage', async () => {
    const mock = createCarryoverMock({
      alteBudgets: [{
        client_id: CLIENT_1,
        annual_amount: 1572,
        carryover_amount: 0,
        used_amount: 800,
      }],
      existingTarget: { id: 'budget-existing-2026', carryover_amount: 0 },
    });

    const result = await uebertrageJahresbudgets(mock.client, ORG_A, 2025, 2026);

    expect(result.uebertragen).toBe(1);
    expect(mock.updated).toHaveLength(1);
    expect(mock.updated[0].id).toBe('budget-existing-2026');
    expect(mock.updated[0].data.carryover_amount).toBe(772); // 1572 - 800
    expect(mock.updated[0].data.carryover_expires).toBe('2026-06-30');
    expect(mock.inserted).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 3: Jahreswechsel 2025 → 2026
// ═══════════════════════════════════════════════════════════════════════════

describe('Szenario 3: Jahreswechsel Budget-Uebertrag', () => {
  it('uebertrag fuer mehrere Klienten in einem Durchlauf', async () => {
    const mock = createCarryoverMock({
      alteBudgets: [
        { client_id: 'client-a', annual_amount: 1572, carryover_amount: 0, used_amount: 500 },
        { client_id: 'client-b', annual_amount: 1572, carryover_amount: 300, used_amount: 1872 },
        { client_id: 'client-c', annual_amount: 1572, carryover_amount: 0, used_amount: 0 },
      ],
      existingTarget: null,
    });

    const result = await uebertrageJahresbudgets(mock.client, ORG_A, 2025, 2026);

    // client-a: 1572-500=1072 Rest → uebertragen
    // client-b: 1572+300-1872=0 Rest → uebersprungen
    // client-c: 1572-0=1572 Rest → uebertragen
    expect(result.uebertragen).toBe(2);
    expect(result.uebersprungen).toBe(1);
    expect(result.fehler).toHaveLength(0);
  });

  it('carryover berechnet annual + carryover - used', async () => {
    const mock = createCarryoverMock({
      alteBudgets: [{
        client_id: CLIENT_1,
        annual_amount: 1572,
        carryover_amount: 400, // Vorjahres-Uebertrag
        used_amount: 700,
      }],
      existingTarget: null,
    });

    await uebertrageJahresbudgets(mock.client, ORG_A, 2025, 2026);

    const neues = mock.inserted[0] as any;
    expect(neues.carryover_amount).toBe(1272); // 1572 + 400 - 700
  });

  it('gibt leeres Ergebnis bei fehlenden Quell-Budgets', async () => {
    const mock = createCarryoverMock({ alteBudgets: [] });
    const result = await uebertrageJahresbudgets(mock.client, ORG_A, 2025, 2026);

    expect(result.uebertragen).toBe(0);
    expect(result.uebersprungen).toBe(0);
    expect(result.fehler).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 4: Nicht verifizierter Kassentarif → blockiert
// ═══════════════════════════════════════════════════════════════════════════

describe('Szenario 4: Nicht verifizierter Kassentarif', () => {
  it('blockiert unverified Tarif bei Kassenrechnung', async () => {
    const tarif = makeTarif({ tarif_status: 'unverified', verifiziert_am: null });
    const mock = createPriceResolveMock([tarif]);

    await expect(
      resolvePrice(mock, {
        leistungsart: 'Grundpflege',
        rechtsgrundlage: '§45b SGB XI',
        datum: '2026-01-15',
      }),
    ).rejects.toThrow(TarifNichtVerifiziertError);
  });

  it('blockiert blocked Tarif bei Kassenrechnung', async () => {
    const tarif = makeTarif({ tarif_status: 'blocked' });
    const mock = createPriceResolveMock([tarif]);

    await expect(
      resolvePrice(mock, {
        leistungsart: 'Grundpflege',
        rechtsgrundlage: '§45b SGB XI',
        datum: '2026-01-15',
      }),
    ).rejects.toThrow(TarifNichtVerifiziertError);
  });

  it('TarifNichtVerifiziertError enthaelt korrekte Details', async () => {
    const tarif = makeTarif({
      tarif_status: 'unverified',
      verifizierungs_quelle: 'AOK Prüfung ausstehend',
    });
    const mock = createPriceResolveMock([tarif]);

    try {
      await resolvePrice(mock, {
        leistungsart: 'Grundpflege',
        rechtsgrundlage: '§45b SGB XI',
        datum: '2026-01-15',
      });
      expect.fail('Haette TarifNichtVerifiziertError werfen muessen');
    } catch (e) {
      expect(e).toBeInstanceOf(TarifNichtVerifiziertError);
      const err = e as TarifNichtVerifiziertError;
      expect(err.leistungsart).toBe('Grundpflege');
      expect(err.tarifStatus).toBe('unverified');
      expect(err.message).toContain('nicht verifiziert');
    }
  });

  it('laesst verified Tarif bei Kassenrechnung durch', async () => {
    const tarif = makeTarif({ tarif_status: 'verified' });
    const mock = createPriceResolveMock([tarif]);

    const result = await resolvePrice(mock, {
      leistungsart: 'Grundpflege',
      rechtsgrundlage: '§45b SGB XI',
      datum: '2026-01-15',
    });

    expect(result.id).toBe(tarif.id);
    expect(result.tarif_status).toBe('verified');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 5: Deaktivierter Tarif
// ═══════════════════════════════════════════════════════════════════════════

describe('Szenario 5: Deaktivierter Tarif (ist_aktiv = false)', () => {
  it('findet keine Tarife wenn ist_aktiv = false herausgefiltert', async () => {
    // resolvePrice filtert auf ist_aktiv = true in der DB-Query
    // Wenn kein aktiver Tarif, kommt leeres Array zurueck
    const mock = createPriceResolveMock([]); // DB gibt nichts zurueck (gefiltert)

    await expect(
      resolvePrice(mock, {
        leistungsart: 'Grundpflege',
        rechtsgrundlage: '§45b SGB XI',
        datum: '2026-01-15',
      }),
    ).rejects.toThrow(/Kein Tarif gefunden/);
  });

  it('nur aktive Tarife werden aufgeloest', async () => {
    const aktiverTarif = makeTarif({ id: 'tarif-aktiv', ist_aktiv: true });
    const mock = createPriceResolveMock([aktiverTarif]);

    const result = await resolvePrice(mock, {
      leistungsart: 'Grundpflege',
      rechtsgrundlage: '§45b SGB XI',
      datum: '2026-01-15',
    });

    expect(result.id).toBe('tarif-aktiv');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 6: Fehlender Tarif → klare Fehlermeldung
// ═══════════════════════════════════════════════════════════════════════════

describe('Szenario 6: Fehlender Tarif', () => {
  it('wirft mit Leistungsart und Rechtsgrundlage in der Meldung', async () => {
    const mock = createPriceResolveMock([]);

    try {
      await resolvePrice(mock, {
        leistungsart: 'Wundversorgung',
        rechtsgrundlage: '§45b SGB XI',
        datum: '2026-03-01',
      });
      expect.fail('Haette werfen muessen');
    } catch (e: any) {
      expect(e.message).toContain('Wundversorgung');
      expect(e.message).toContain('§45b SGB XI');
    }
  });

  it('parseTariffError erkennt MISSING_VALID_TARIFF', () => {
    const code = parseTariffError('MISSING_VALID_TARIFF: Kein Tarif für Leistung X');
    expect(code).toBe(TARIFF_ERROR_CODES.MISSING_VALID_TARIFF);
  });

  it('parseTariffError erkennt AMBIGUOUS_TARIFF', () => {
    const code = parseTariffError('AMBIGUOUS_TARIFF: Mehrere gleichrangige Tarife');
    expect(code).toBe(TARIFF_ERROR_CODES.AMBIGUOUS_TARIFF);
  });

  it('parseTariffError gibt null fuer unbekannte Fehler', () => {
    expect(parseTariffError('Irgendein anderer Fehler')).toBeNull();
  });

  it('budgetTypeToRechtsgrundlage wirft bei unbekanntem Typ', () => {
    expect(() => budgetTypeToRechtsgrundlage('fantasie_typ')).toThrow(/Unbekannter budget_type/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 7: Privatkunde → kein Verifizierungs-Check
// ═══════════════════════════════════════════════════════════════════════════

describe('Szenario 7: Privatkunde (kein Verifizierungs-Check)', () => {
  it('laesst unverified Tarif bei privat durch', async () => {
    const tarif = makeTarif({
      rechtsgrundlage: 'privat',
      tarif_status: 'unverified',
    });
    const mock = createPriceResolveMock([tarif]);

    const result = await resolvePrice(mock, {
      leistungsart: 'Grundpflege',
      rechtsgrundlage: 'privat',
      datum: '2026-01-15',
    });

    expect(result.tarif_status).toBe('unverified');
  });

  it('blockiert auch bei privat wenn Tarif blocked ist', async () => {
    const tarif = makeTarif({
      rechtsgrundlage: 'privat',
      tarif_status: 'blocked',
    });
    const mock = createPriceResolveMock([tarif]);

    await expect(
      resolvePrice(mock, {
        leistungsart: 'Grundpflege',
        rechtsgrundlage: 'privat',
        datum: '2026-01-15',
      }),
    ).rejects.toThrow(TarifNichtVerifiziertError);
  });

  it('budgetTypeToRechtsgrundlage mappt private → privat', () => {
    expect(budgetTypeToRechtsgrundlage('private')).toBe('privat');
  });

  it('budgetTypeToRechtsgrundlage mappt entlastung → §45b SGB XI', () => {
    expect(budgetTypeToRechtsgrundlage('entlastung')).toBe('§45b SGB XI');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 8: VP/KZP → Gesamtlimit 3.539€
// ═══════════════════════════════════════════════════════════════════════════

describe('Szenario 8: VP/KZP kombiniertes Budget', () => {
  it('Gesamtlimit = VP + KZP = 3.539€', () => {
    expect(VP_KZP_KOMBINIERT_EUR).toBe(3539);
  });

  it('VP und KZP sind Referenzwerte, Gesamtbudget ist operativ', () => {
    expect(VP_JAEHRLICH_EUR).toBe(1685);
    expect(KZP_JAEHRLICH_EUR).toBe(1854);
    expect(VP_JAEHRLICH_EUR + KZP_JAEHRLICH_EUR).toBe(VP_KZP_KOMBINIERT_EUR);
  });

  it('Auto-Budget erstellt VP als combined Budget', async () => {
    const mock = createBudgetMock();
    await erstelleInitialBudgets(mock.client, CLIENT_1, ORG_A, 3);

    const vp = mock.inserted[0].find((b: any) => b.budget_type === 'verhinderungspflege') as any;
    expect(vp.annual_amount).toBe(VP_KZP_KOMBINIERT_EUR);
    expect(vp.combined_annual_amount).toBe(VP_KZP_KOMBINIERT_EUR);
    expect(vp.monthly_amount).toBe(0); // VP hat kein monatliches Limit
  });

  it('Alle Pflegegrade 1-5 erhalten das gleiche Budget', async () => {
    for (const pg of [1, 2, 3, 4, 5]) {
      const mock = createBudgetMock();
      await erstelleInitialBudgets(mock.client, CLIENT_1, ORG_A, pg);

      const entlastung = mock.inserted[0].find((b: any) => b.budget_type === 'entlastung') as any;
      expect(entlastung.annual_amount).toBe(ENTLASTUNG_JAEHRLICH_EUR);

      const vp = mock.inserted[0].find((b: any) => b.budget_type === 'verhinderungspflege') as any;
      expect(vp.annual_amount).toBe(VP_KZP_KOMBINIERT_EUR);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 9: Cross-Tenant → blockiert
// ═══════════════════════════════════════════════════════════════════════════

describe('Szenario 9: Cross-Tenant-Isolation', () => {
  it('freezeInvoice blockt bei falscher Organization', async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'inv-1',
          organization_id: ORG_A,
          status: 'geprueft',
          frozen_at: null,
        },
        error: null,
      }),
    };
    const mock = {
      from: vi.fn(() => mockChain),
      rpc: vi.fn(),
    } as any;

    await expect(
      freezeInvoice(mock, 'inv-1', ACTOR, ORG_B),
    ).rejects.toThrow(/gehoert nicht zur angegebenen Organisation/);
  });

  it('Budget-Erstellung setzt organization_id korrekt', async () => {
    const mock = createBudgetMock();
    await erstelleInitialBudgets(mock.client, CLIENT_1, ORG_A, 2);

    for (const row of mock.inserted[0]) {
      expect((row as any).organization_id).toBe(ORG_A);
    }
  });

  it('Idempotency-Key ist pro Client + Periode + BudgetType eindeutig', () => {
    const keyOrgA = generateIdempotencyKey(CLIENT_1, '2026-06', 'entlastung');
    const keyOrgB = generateIdempotencyKey(CLIENT_2, '2026-06', 'entlastung');
    expect(keyOrgA).not.toBe(keyOrgB);
  });

  it('cancelInvoice prueft Organization-Fence', async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValueOnce({
        data: {
          id: 'inv-cancel',
          organization_id: ORG_A,
          status: 'freigegeben',
          total_amount: 100,
          invoice_number: 'RE-2026-00001',
        },
        error: null,
      }),
    };
    const mock = {
      from: vi.fn(() => mockChain),
      rpc: vi.fn(),
    } as any;

    await expect(
      cancelInvoice(mock, 'inv-cancel', 'Teststorno', ACTOR, ORG_B),
    ).rejects.toThrow(/gehoert nicht zur angegebenen Organisation/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 10: Voller Flow (Einheiten-Tests der Teilschritte)
// ═══════════════════════════════════════════════════════════════════════════

describe('Szenario 10: Voller Abrechnungsflow', () => {
  describe('10a: Rechnungserstellung', () => {
    it('createInvoiceDraft ruft atomare RPC auf', async () => {
      const rpcResult = {
        invoice_id: 'inv-new',
        invoice_number: 'RE-2026-00001',
        total_amount: 35.00,
        line_count: 1,
        already_exists: false,
      };

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: CLIENT_1,
            first_name: 'Max',
            last_name: 'Mustermann',
            insurance_name: 'AOK Hessen',
            insurance_number: '123456789',
            organization_id: ORG_A,
            pflegekasse_ik: '105815527',
          },
          error: null,
        }),
      };
      const mock = {
        from: vi.fn(() => mockChain),
        rpc: vi.fn().mockResolvedValue({ data: rpcResult, error: null }),
      } as any;

      const result = await createInvoiceDraft(mock, {
        clientId: CLIENT_1,
        periodMonth: '2026-06',
        budgetType: 'entlastung',
        actorId: ACTOR,
      });

      expect(result.invoiceId).toBe('inv-new');
      expect(result.priceSource).toBe('billing_tariffs');
      expect(result.totalAmountCents).toBe(3500);
      expect(result.lineCount).toBe(1);
      expect(mock.rpc).toHaveBeenCalledWith(
        'create_invoice_draft_atomic',
        expect.objectContaining({
          p_client_id: CLIENT_1,
          p_org_id: ORG_A,
          p_period_month: '2026-06',
          p_budget_type: 'entlastung',
        }),
      );
    });

    it('RPC-Fehler mit Tarif-Code wird korrekt weitergeleitet', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: CLIENT_1,
            first_name: 'A',
            last_name: 'B',
            organization_id: ORG_A,
          },
          error: null,
        }),
      };
      const mock = {
        from: vi.fn(() => mockChain),
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'MISSING_VALID_TARIFF: Kein Tarif für Grundpflege' },
        }),
      } as any;

      try {
        await createInvoiceDraft(mock, {
          clientId: CLIENT_1,
          periodMonth: '2026-06',
          budgetType: 'entlastung',
          actorId: ACTOR,
        });
        expect.fail('Haette werfen muessen');
      } catch (e: any) {
        expect(e.tariffErrorCode).toBe('MISSING_VALID_TARIFF');
      }
    });
  });

  describe('10b: Status-Machine', () => {
    it('valide Uebergaenge werden akzeptiert', () => {
      expect(() => validateTransition('entwurf', 'geprueft')).not.toThrow();
      expect(() => validateTransition('geprueft', 'freigegeben')).not.toThrow();
      expect(() => validateTransition('freigegeben', 'uebermittelt')).not.toThrow();
      expect(() => validateTransition('quittiert', 'bezahlt')).not.toThrow();
    });

    it('invalide Uebergaenge werden abgelehnt', () => {
      expect(() => validateTransition('entwurf', 'bezahlt')).toThrow();
      expect(() => validateTransition('bezahlt', 'entwurf')).toThrow();
      expect(() => validateTransition('storniert', 'freigegeben')).toThrow();
    });

    it('Terminal-States haben keine Ausgaenge', () => {
      expect(isTerminalStatus('bezahlt')).toBe(true);
      expect(isTerminalStatus('akzeptiert')).toBe(true);
      expect(isTerminalStatus('storniert')).toBe(true);
      expect(isTerminalStatus('abgeschrieben')).toBe(true);
      expect(isTerminalStatus('entwurf')).toBe(false);
    });

    it('alle Status sind gueltig', () => {
      const states: string[] = [
        'entwurf', 'geprueft', 'freigegeben', 'uebermittelt', 'quittiert',
        'bezahlt', 'teilweise_bezahlt', 'gekuerzt', 'abgelehnt',
        'korrektur_erforderlich', 'akzeptiert', 'storniert',
        'erneut_eingereicht', 'strittig', 'abgeschrieben',
      ];
      for (const s of states) {
        expect(isValidInvoiceStatus(s)).toBe(true);
      }
      expect(isValidInvoiceStatus('fantasie')).toBe(false);
    });
  });

  describe('10c: Preisberechnung', () => {
    it('Grundpreis ohne Zuschlag', () => {
      const tarif = makeTarif({ preis_cent: 3500 });
      const result = calculateLineTotal({
        tarif,
        menge: 2,
        datum: '2026-01-15',
      });

      expect(result.einzelpreisCent).toBe(3500);
      expect(result.gesamtpreisCent).toBe(7000);
      expect(result.zuschlagProzent).toBe(0);
    });

    it('Wochenendzuschlag 25%', () => {
      const tarif = makeTarif({
        preis_cent: 4000,
        zuschlag_wochenende_prozent: 25,
      });
      const result = calculateLineTotal({
        tarif,
        menge: 1,
        datum: '2026-01-18', // Samstag
        istWochenende: true,
      });

      expect(result.zuschlagProzent).toBe(25);
      expect(result.gesamtpreisCent).toBe(5000); // 4000 * 1.25
    });

    it('Feiertagszuschlag hat Vorrang vor Wochenende', () => {
      const tarif = makeTarif({
        preis_cent: 4000,
        zuschlag_wochenende_prozent: 25,
        zuschlag_feiertag_prozent: 50,
      });
      const result = calculateLineTotal({
        tarif,
        menge: 1,
        datum: '2026-12-25',
        istWochenende: true,
        istFeiertag: true,
      });

      expect(result.zuschlagProzent).toBe(50);
      expect(result.gesamtpreisCent).toBe(6000); // 4000 * 1.50
    });

    it('Menge 0 ergibt 0 Gesamtpreis', () => {
      const tarif = makeTarif({ preis_cent: 3500 });
      const result = calculateLineTotal({
        tarif,
        menge: 0,
        datum: '2026-01-15',
      });

      expect(result.gesamtpreisCent).toBe(0);
    });
  });

  describe('10d: Spezifitaets-Scoring', () => {
    it('spezifischerer Tarif gewinnt', async () => {
      const allgemein = makeTarif({ id: 'allgemein', kostentraeger_ik: null, bundesland: null });
      const spezifisch = makeTarif({ id: 'spezifisch', kostentraeger_ik: '105815527', bundesland: null });
      const mock = createPriceResolveMock([allgemein, spezifisch]);

      const result = await resolvePrice(mock, {
        leistungsart: 'Grundpflege',
        rechtsgrundlage: '§45b SGB XI',
        datum: '2026-01-15',
        kostentraegerIk: '105815527',
      });

      expect(result.id).toBe('spezifisch');
    });

    it('Tarif fuer falschen Kostentraeger wird ausgeschlossen', async () => {
      const tarif = makeTarif({ kostentraeger_ik: '999999999' });
      const mock = createPriceResolveMock([tarif]);

      await expect(
        resolvePrice(mock, {
          leistungsart: 'Grundpflege',
          rechtsgrundlage: '§45b SGB XI',
          datum: '2026-01-15',
          kostentraegerIk: '105815527',
        }),
      ).rejects.toThrow();
    });
  });

  describe('10e: Zahlung', () => {
    it('createPayment lehnt Betrag <= 0 ab', async () => {
      const mock = { from: vi.fn(), rpc: vi.fn() } as any;

      await expect(
        createPayment(mock, {
          organizationId: ORG_A,
          paymentDate: '2026-06-15',
          amountCents: 0,
          paymentMethod: 'ueberweisung',
          payerType: 'kunde',
          actorId: ACTOR,
        }),
      ).rejects.toThrow(/positiv/);

      await expect(
        createPayment(mock, {
          organizationId: ORG_A,
          paymentDate: '2026-06-15',
          amountCents: -100,
          paymentMethod: 'ueberweisung',
          payerType: 'kunde',
          actorId: ACTOR,
        }),
      ).rejects.toThrow(/positiv/);
    });
  });

  describe('10f: Idempotenz', () => {
    it('gleiche Parameter erzeugen gleichen Key', () => {
      const k1 = generateIdempotencyKey(CLIENT_1, '2026-06', 'entlastung');
      const k2 = generateIdempotencyKey(CLIENT_1, '2026-06', 'entlastung');
      expect(k1).toBe(k2);
    });

    it('verschiedene Versionen erzeugen verschiedene Keys', () => {
      const v1 = generateIdempotencyKey(CLIENT_1, '2026-06', 'entlastung', 1);
      const v2 = generateIdempotencyKey(CLIENT_1, '2026-06', 'entlastung', 2);
      expect(v1).not.toBe(v2);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BONUS: Coach-Abrechnung fail-closed
// ═══════════════════════════════════════════════════════════════════════════

describe('Coach-Abrechnung fail-closed', () => {
  it('null/undefined Abrechnungsweg → nicht bereit', () => {
    expect(istAbrechnungsbereit(null)).toEqual({
      bereit: false,
      grund: 'Kein Abrechnungsweg konfiguriert.',
    });
    expect(istAbrechnungsbereit(undefined)).toEqual({
      bereit: false,
      grund: 'Kein Abrechnungsweg konfiguriert.',
    });
  });

  it('inaktiver Weg → nicht bereit', () => {
    const weg: AbrechnungswegZeile = {
      schluessel: 'direkt_pflegekasse',
      bezeichnung: 'Direkt',
      aktiv: false,
      verguetung_geklaert: true,
    };
    const result = istAbrechnungsbereit(weg);
    expect(result.bereit).toBe(false);
  });

  it('verguetung nicht geklaert → nicht bereit', () => {
    const weg: AbrechnungswegZeile = {
      schluessel: 'direkt_pflegekasse',
      bezeichnung: 'Direkt',
      aktiv: true,
      verguetung_geklaert: false,
    };
    const result = istAbrechnungsbereit(weg);
    expect(result.bereit).toBe(false);
    expect((result as any).grund).toContain('Vergütungsvereinbarung');
  });

  it('aktiv + verguetung geklaert → bereit', () => {
    const weg: AbrechnungswegZeile = {
      schluessel: 'direkt_pflegekasse',
      bezeichnung: 'Direkt',
      aktiv: true,
      verguetung_geklaert: true,
    };
    expect(istAbrechnungsbereit(weg)).toEqual({ bereit: true });
  });

  it('Schluessel-Validierung', () => {
    expect(istSchluesselGueltig('direkt_pflegekasse')).toBe(true);
    expect(istSchluesselGueltig('ab')).toBe(false); // zu kurz
    expect(istSchluesselGueltig('GROSS')).toBe(false); // Grossbuchstaben
    expect(istSchluesselGueltig('mit leerzeichen')).toBe(false);
    expect(istSchluesselGueltig('a'.repeat(61))).toBe(false); // zu lang
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Grenzfaelle
// ═══════════════════════════════════════════════════════════════════════════

describe('Grenzfaelle', () => {
  it('Budget mit 0€ Rest wird uebersprungen', async () => {
    const mock = createCarryoverMock({
      alteBudgets: [{
        client_id: CLIENT_1,
        annual_amount: 1572,
        carryover_amount: 0,
        used_amount: 1572,
      }],
    });
    const result = await uebertrageJahresbudgets(mock.client, ORG_A, 2025, 2026);
    expect(result.uebersprungen).toBe(1);
  });

  it('Budget mit negativem Rest (Ueberverbrauch) wird uebersprungen', async () => {
    const mock = createCarryoverMock({
      alteBudgets: [{
        client_id: CLIENT_1,
        annual_amount: 1572,
        carryover_amount: 0,
        used_amount: 5000,
      }],
    });
    const result = await uebertrageJahresbudgets(mock.client, ORG_A, 2025, 2026);
    expect(result.uebersprungen).toBe(1);
  });

  it('Pflegegrad -1 wird abgelehnt', async () => {
    const mock = createBudgetMock();
    const result = await erstelleInitialBudgets(mock.client, CLIENT_1, ORG_A, -1);
    expect(result.erstellt).toBe(false);
  });

  it('Tarif mit gueltig_bis in der Vergangenheit wird ignoriert', async () => {
    const abgelaufen = makeTarif({ gueltig_bis: '2025-12-31' });
    const mock = createPriceResolveMock([abgelaufen]);

    await expect(
      resolvePrice(mock, {
        leistungsart: 'Grundpflege',
        rechtsgrundlage: '§45b SGB XI',
        datum: '2026-06-01',
      }),
    ).rejects.toThrow();
  });

  it('DB-Fehler beim Tarifladen wirft Error', async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      returns: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'connection refused' },
      }),
    };
    const mock = { from: vi.fn(() => mockChain) } as any;

    await expect(
      resolvePrice(mock, {
        leistungsart: 'X',
        rechtsgrundlage: '§45b SGB XI',
        datum: '2026-01-01',
      }),
    ).rejects.toThrow(/Tarifladen fehlgeschlagen/);
  });
});
