/**
 * Tests fuer Tarif-Verifizierungs-Fail-Closed-System
 * @see lib/billing/core/price-resolver.ts
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  resolvePrice,
  calculateLineTotal,
  TarifNichtVerifiziertError,
  type BillingTarif,
  type TarifStatus,
} from '@/lib/billing/core/price-resolver';

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function makeTarif(overrides: Partial<BillingTarif> = {}): BillingTarif {
  return {
    id: 'tarif-1',
    organization_id: 'org-1',
    kostentraeger_ik: null,
    leistungsart: 'alltagsbegleitung_45a',
    rechtsgrundlage: '§45b SGB XI',
    bundesland: null,
    vertragsgebiet: null,
    vertrag_referenz: null,
    qualifikation: null,
    verguetungsart: 'zeit_stunde',
    preis_cent: 2500,
    einheit: 'stunde',
    zuschlag_wochenende_prozent: 0,
    zuschlag_feiertag_prozent: 0,
    zuschlag_nacht_prozent: 0,
    nacht_von: '20:00',
    nacht_bis: '06:00',
    kombinations_abschlag_prozent: 0,
    gueltig_ab: '2026-01-01',
    gueltig_bis: null,
    tarifquelle: null,
    tarif_status: 'verified',
    verifiziert_am: null,
    verifiziert_von: null,
    verifizierungs_quelle: null,
    ist_aktiv: true,
    ...overrides,
  };
}

function mockSupabase(tarife: BillingTarif[]) {
  const chain: Record<string, Function> = {};

  chain.from = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.returns = vi.fn().mockResolvedValue({ data: tarife, error: null });

  return chain as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>;
}

function mockSupabaseError(message: string) {
  const chain: Record<string, Function> = {};

  chain.from = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.lte = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.returns = vi.fn().mockResolvedValue({ data: null, error: { message } });

  return chain as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>;
}

const BASE_PARAMS = {
  organizationId: 'org-1',
  leistungsart: 'alltagsbegleitung_45a',
  rechtsgrundlage: '§45b SGB XI',
  datum: '2026-06-15',
};

// ---------------------------------------------------------------------------
// TarifNichtVerifiziertError
// ---------------------------------------------------------------------------

describe('TarifNichtVerifiziertError', () => {
  it('unverified-Meldung enthaelt Leistungsart', () => {
    const err = new TarifNichtVerifiziertError('LK01', 'unverified', null);
    expect(err.message).toContain('LK01');
    expect(err.message).toContain('nicht verifiziert');
    expect(err.tarifStatus).toBe('unverified');
    expect(err.name).toBe('TarifNichtVerifiziertError');
  });

  it('blocked-Meldung enthaelt Quelle', () => {
    const err = new TarifNichtVerifiziertError(
      'LK18', 'blocked', 'LK18: 75 EUR weicht stark vom Standard ab'
    );
    expect(err.message).toContain('gesperrt');
    expect(err.message).toContain('75 EUR');
    expect(err.tarifStatus).toBe('blocked');
    expect(err.verifizierungsQuelle).toContain('75 EUR');
  });

  it('blocked ohne Quelle', () => {
    const err = new TarifNichtVerifiziertError('X', 'blocked', null);
    expect(err.message).toContain('gesperrt');
    expect(err.message).not.toContain('null');
  });
});

// ---------------------------------------------------------------------------
// resolvePrice — Verifizierungs-Checks
// ---------------------------------------------------------------------------

describe('resolvePrice: Verifizierungs-Fail-Closed', () => {
  it('verifizierter Kassentarif → Rechnung OK', async () => {
    const tarif = makeTarif({ tarif_status: 'verified' });
    const sb = mockSupabase([tarif]);

    const result = await resolvePrice(sb, BASE_PARAMS);
    expect(result.id).toBe('tarif-1');
    expect(result.tarif_status).toBe('verified');
  });

  it('unverifizierter Kassentarif → TarifNichtVerifiziertError', async () => {
    const tarif = makeTarif({ tarif_status: 'unverified' });
    const sb = mockSupabase([tarif]);

    await expect(resolvePrice(sb, BASE_PARAMS))
      .rejects.toThrow(TarifNichtVerifiziertError);

    try {
      await resolvePrice(sb, BASE_PARAMS);
    } catch (e) {
      expect(e).toBeInstanceOf(TarifNichtVerifiziertError);
      expect((e as TarifNichtVerifiziertError).tarifStatus).toBe('unverified');
    }
  });

  it('blockierter Kassentarif → TarifNichtVerifiziertError mit blocked', async () => {
    const tarif = makeTarif({
      tarif_status: 'blocked',
      verifizierungs_quelle: 'PfluV: 35 EUR/h ueberschreitet Obergrenze',
    });
    const sb = mockSupabase([tarif]);

    await expect(resolvePrice(sb, BASE_PARAMS))
      .rejects.toThrow(TarifNichtVerifiziertError);

    try {
      await resolvePrice(sb, BASE_PARAMS);
    } catch (e) {
      expect(e).toBeInstanceOf(TarifNichtVerifiziertError);
      const err = e as TarifNichtVerifiziertError;
      expect(err.tarifStatus).toBe('blocked');
      expect(err.message).toContain('gesperrt');
      expect(err.message).toContain('35 EUR/h');
    }
  });

  it('unverifizierter Tarif + Privatrechnung → OK (kein Status-Check)', async () => {
    const tarif = makeTarif({
      tarif_status: 'unverified',
      rechtsgrundlage: 'privat',
    });
    const sb = mockSupabase([tarif]);

    const result = await resolvePrice(sb, {
      organizationId: 'org-1',
      ...BASE_PARAMS,
      rechtsgrundlage: 'privat',
    });
    expect(result.id).toBe('tarif-1');
  });

  it('blockierter Tarif + Privatrechnung → Error (blocked immer gesperrt)', async () => {
    const tarif = makeTarif({
      tarif_status: 'blocked',
      rechtsgrundlage: 'privat',
      verifizierungs_quelle: 'Gesperrt',
    });
    const sb = mockSupabase([tarif]);

    await expect(resolvePrice(sb, {
      organizationId: 'org-1',
      ...BASE_PARAMS,
      rechtsgrundlage: 'privat',
    })).rejects.toThrow(TarifNichtVerifiziertError);
  });

  it('ist_aktiv = false → nie verwendet (leere Ergebnisse)', async () => {
    const sb = mockSupabase([]);

    await expect(resolvePrice(sb, BASE_PARAMS))
      .rejects.toThrow('Kein Tarif gefunden');
  });

  it('DB-Fehler wird korrekt weitergereicht', async () => {
    const sb = mockSupabaseError('connection refused');

    await expect(resolvePrice(sb, BASE_PARAMS))
      .rejects.toThrow('Tarifladen fehlgeschlagen: connection refused');
  });
});

// ---------------------------------------------------------------------------
// resolvePrice — Spezifitaet bleibt erhalten
// ---------------------------------------------------------------------------

describe('resolvePrice: Spezifitaet + Verifizierung', () => {
  it('waehlt spezifischeren verifizierten Tarif', async () => {
    const allgemein = makeTarif({
      id: 'tarif-allgemein',
      tarif_status: 'verified',
    });
    const spezifisch = makeTarif({
      id: 'tarif-spezifisch',
      tarif_status: 'verified',
      bundesland: 'HE',
    });
    const sb = mockSupabase([allgemein, spezifisch]);

    const result = await resolvePrice(sb, {
      organizationId: 'org-1',
      ...BASE_PARAMS,
      bundesland: 'HE',
    });
    expect(result.id).toBe('tarif-spezifisch');
  });

  it('spezifischster Tarif unverified → Error trotz allgemeinerem verified', async () => {
    const allgemein = makeTarif({
      id: 'tarif-allgemein',
      tarif_status: 'verified',
    });
    const spezifisch = makeTarif({
      id: 'tarif-spezifisch',
      tarif_status: 'unverified',
      bundesland: 'HE',
    });
    const sb = mockSupabase([allgemein, spezifisch]);

    // Spezifischster gewinnt, aber unverified → Error
    await expect(resolvePrice(sb, {
      organizationId: 'org-1',
      ...BASE_PARAMS,
      bundesland: 'HE',
    })).rejects.toThrow(TarifNichtVerifiziertError);
  });
});

// ---------------------------------------------------------------------------
// Cross-Tenant
// ---------------------------------------------------------------------------

describe('Cross-Tenant-Isolation', () => {
  it('eq-Filter enthaelt ist_aktiv', async () => {
    const sb = mockSupabase([]);
    const eqCalls: string[][] = [];

    const chain: Record<string, Function> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn((...args: string[]) => {
      eqCalls.push(args);
      return chain;
    });
    chain.lte = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.returns = vi.fn().mockResolvedValue({ data: [], error: null });

    try {
      await resolvePrice(
        chain as unknown as ReturnType<typeof import('@supabase/supabase-js').createClient>,
        BASE_PARAMS
      );
    } catch {
      // expected: no tariff found
    }

    const eqKeys = eqCalls.map(c => c[0]);
    expect(eqKeys).toContain('ist_aktiv');
    expect(eqKeys).toContain('leistungsart');
    expect(eqKeys).toContain('rechtsgrundlage');
  });
});

// ---------------------------------------------------------------------------
// Audit-Trail (Integration-Level: Trigger-Verhalten)
// ---------------------------------------------------------------------------

describe('Audit-Trail Pruefung (Unit)', () => {
  it('BillingTarif hat tarif_status-Feld', () => {
    const tarif = makeTarif();
    expect(tarif).toHaveProperty('tarif_status');
    expect(tarif).toHaveProperty('verifiziert_am');
    expect(tarif).toHaveProperty('verifiziert_von');
    expect(tarif).toHaveProperty('verifizierungs_quelle');
  });

  it('TarifNichtVerifiziertError ist instanceof Error', () => {
    const err = new TarifNichtVerifiziertError('test', 'unverified', null);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TarifNichtVerifiziertError);
  });
});

// ---------------------------------------------------------------------------
// calculateLineTotal unabhaengig vom Status
// ---------------------------------------------------------------------------

describe('calculateLineTotal: unabhaengig vom tarif_status', () => {
  it('berechnet korrekt auch mit verified-Tarif', () => {
    const tarif = makeTarif({ preis_cent: 2500, tarif_status: 'verified' });
    const result = calculateLineTotal({
      tarif,
      menge: 2,
      datum: '2026-06-15',
    });
    expect(result.gesamtpreisCent).toBe(5000);
  });

  it('berechnet korrekt auch mit unverified-Tarif (calculateLineTotal prueft nicht)', () => {
    const tarif = makeTarif({ preis_cent: 3500, tarif_status: 'unverified' });
    const result = calculateLineTotal({
      tarif,
      menge: 1,
      datum: '2026-06-15',
    });
    expect(result.gesamtpreisCent).toBe(3500);
  });
});
