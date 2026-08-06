/**
 * Tests fuer den Price Resolver
 * @see lib/billing/core/price-resolver.ts
 */
import { vi } from 'vitest';
import {
  calculateLineTotal,
  snapshotPrice,
  type BillingTarif,
  type LineTotalParams,
} from '@/lib/billing/core/price-resolver';

// ---------------------------------------------------------------------------
// Hilfsfunktion: Mock-Tarif erstellen
// ---------------------------------------------------------------------------

function makeTarif(overrides: Partial<BillingTarif> = {}): BillingTarif {
  return {
    id: 'tarif-1',
    organization_id: 'org-1',
    kostentraeger_ik: null,
    leistungsart: 'alltagsbegleitung',
    rechtsgrundlage: 'sgb_xi_45b',
    bundesland: null,
    vertragsgebiet: null,
    vertrag_referenz: null,
    qualifikation: null,
    verguetungsart: 'zeit_stunde',
    preis_cent: 3500,
    einheit: 'stunde',
    zuschlag_wochenende_prozent: 0,
    zuschlag_feiertag_prozent: 0,
    zuschlag_nacht_prozent: 0,
    nacht_von: '20:00',
    nacht_bis: '06:00',
    kombinations_abschlag_prozent: 0,
    gueltig_ab: '2026-01-01',
    gueltig_bis: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateLineTotal
// ---------------------------------------------------------------------------

describe('calculateLineTotal', () => {
  it('Basispreis ohne Zuschlage', () => {
    const tarif = makeTarif({ preis_cent: 3500 });
    const result = calculateLineTotal({
      tarif,
      menge: 2,
      datum: '2026-06-10',
    });

    expect(result.einzelpreisCent).toBe(3500);
    expect(result.zuschlagProzent).toBe(0);
    expect(result.zuschlagGrund).toBeNull();
    expect(result.gesamtpreisCent).toBe(7000); // 3500 * 2
  });

  it('Wochenendzuschlag', () => {
    const tarif = makeTarif({
      preis_cent: 4000,
      zuschlag_wochenende_prozent: 25,
    });
    const result = calculateLineTotal({
      tarif,
      menge: 1,
      datum: '2026-06-13', // Samstag
      istWochenende: true,
    });

    expect(result.zuschlagProzent).toBe(25);
    expect(result.zuschlagGrund).toBe('wochenende');
    // 4000 * 1 = 4000 Basis, Zuschlag = 4000 * 25/100 = 1000, Gesamt = 5000
    expect(result.gesamtpreisCent).toBe(5000);
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
    expect(result.zuschlagGrund).toBe('feiertag');
    // 4000 * 1 = 4000 Basis, Zuschlag = 4000 * 50/100 = 2000, Gesamt = 6000
    expect(result.gesamtpreisCent).toBe(6000);
  });

  it('Nachtzuschlag kumulativ mit Wochenende', () => {
    const tarif = makeTarif({
      preis_cent: 4000,
      zuschlag_wochenende_prozent: 25,
      zuschlag_nacht_prozent: 30,
      nacht_von: '20:00',
      nacht_bis: '06:00',
    });
    const result = calculateLineTotal({
      tarif,
      menge: 1,
      datum: '2026-06-13',
      zeitVon: '21:00',
      zeitBis: '23:00',
      istWochenende: true,
    });

    // Wochenende 25% + Nacht 30% = 55%
    expect(result.zuschlagProzent).toBe(55);
    expect(result.zuschlagGrund).toBe('wochenende+nacht');
    // 4000 * 1 = 4000, Zuschlag = 4000 * 55/100 = 2200, Gesamt = 6200
    expect(result.gesamtpreisCent).toBe(6200);
  });

  it('Kein Zuschlag bei 0 Prozent', () => {
    const tarif = makeTarif({
      preis_cent: 3500,
      zuschlag_wochenende_prozent: 0,
    });
    const result = calculateLineTotal({
      tarif,
      menge: 3,
      datum: '2026-06-13',
      istWochenende: true,
    });

    expect(result.zuschlagProzent).toBe(0);
    expect(result.zuschlagGrund).toBeNull();
    expect(result.gesamtpreisCent).toBe(10500); // 3500 * 3
  });

  it('Menge 0 ergibt 0 Cent', () => {
    const tarif = makeTarif({ preis_cent: 5000 });
    const result = calculateLineTotal({
      tarif,
      menge: 0,
      datum: '2026-06-10',
    });

    expect(result.gesamtpreisCent).toBe(0);
  });

  it('Nur Nachtzuschlag ohne Wochenende/Feiertag', () => {
    const tarif = makeTarif({
      preis_cent: 3000,
      zuschlag_nacht_prozent: 20,
      nacht_von: '20:00',
      nacht_bis: '06:00',
    });
    const result = calculateLineTotal({
      tarif,
      menge: 2,
      datum: '2026-06-10',
      zeitVon: '22:00',
      zeitBis: '02:00',
    });

    expect(result.zuschlagProzent).toBe(20);
    expect(result.zuschlagGrund).toBe('nacht');
    // 3000 * 2 = 6000, Zuschlag = 6000 * 20/100 = 1200, Gesamt = 7200
    expect(result.gesamtpreisCent).toBe(7200);
  });
});

// ---------------------------------------------------------------------------
// snapshotPrice
// ---------------------------------------------------------------------------

describe('snapshotPrice', () => {
  it('Erzeugt korrekten Snapshot', () => {
    const tarif = makeTarif({
      id: 'tarif-abc',
      leistungsart: 'alltagsbegleitung',
      verguetungsart: 'zeit_stunde',
      preis_cent: 3500,
      einheit: 'stunde',
      rechtsgrundlage: 'sgb_xi_45b',
    });

    const lineResult = {
      einzelpreisCent: 3500,
      zuschlagProzent: 25,
      zuschlagGrund: 'wochenende' as string | null,
      gesamtpreisCent: 4375,
    };

    const snapshot = snapshotPrice(tarif, lineResult);

    expect(snapshot).toEqual({
      tarif_id: 'tarif-abc',
      leistungsart: 'alltagsbegleitung',
      verguetungsart: 'zeit_stunde',
      einzelpreis_cent: 3500,
      einheit: 'stunde',
      zuschlag_prozent: 25,
      zuschlag_grund: 'wochenende',
      gesamtpreis_cent: 4375,
      rechtsgrundlage: 'sgb_xi_45b',
    });
  });

  it('Snapshot ohne Zuschlag', () => {
    const tarif = makeTarif();
    const lineResult = {
      einzelpreisCent: 3500,
      zuschlagProzent: 0,
      zuschlagGrund: null,
      gesamtpreisCent: 7000,
    };

    const snapshot = snapshotPrice(tarif, lineResult);

    expect(snapshot.zuschlag_prozent).toBe(0);
    expect(snapshot.zuschlag_grund).toBeNull();
    expect(snapshot.gesamtpreis_cent).toBe(7000);
  });
});
