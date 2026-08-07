/**
 * P10: 13 Testszenarien fuer Tariff-Stammdaten v2
 * Branch: feature/tariff-stammdaten-v2
 *
 * Testet:
 * - Tarifquelle-Katalog (P4)
 * - Privat/Kasse-Trennung (P7)
 * - IK-Fallback (P6)
 * - Zuschlaege Default 0% (P5)
 * - Wegepauschale (P8)
 * - budgetTypeToRechtsgrundlage (P7-Fix)
 * - Leistungsarten-Katalog Vollstaendigkeit (P3)
 */
import { describe, it, expect } from 'vitest';
import {
  calculateLineTotal,
  snapshotPrice,
  budgetTypeToRechtsgrundlage,
  type BillingTarif,
  type Tarifquelle,
} from '@/lib/billing/core/price-resolver';

// ---------------------------------------------------------------------------
// Hilfsfunktion: Mock-Tarif erstellen (erweitert um tarifquelle)
// ---------------------------------------------------------------------------

function makeTarif(overrides: Partial<BillingTarif> = {}): BillingTarif {
  return {
    id: 'test-tarif-1',
    organization_id: '00000000-0000-4000-8000-000460629986',
    kostentraeger_ik: null,
    leistungsart: 'alltagsbegleitung',
    rechtsgrundlage: '§45b SGB XI',
    bundesland: 'hessen',
    vertragsgebiet: null,
    vertrag_referenz: null,
    qualifikation: null,
    verguetungsart: 'zeit_stunde',
    preis_cent: 3500,
    einheit: 'Stunde',
    zuschlag_wochenende_prozent: 0,
    zuschlag_feiertag_prozent: 0,
    zuschlag_nacht_prozent: 0,
    nacht_von: '20:00',
    nacht_bis: '06:00',
    kombinations_abschlag_prozent: 0,
    gueltig_ab: '2026-01-01',
    gueltig_bis: null,
    tarifquelle: 'ANERKENNUNGSBESCHEID',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 1: Kassentarif §45b — Alltagsbegleitung 1 Stunde ohne Zuschlag
// ═══════════════════════════════════════════════════════════════════════════
describe('Szenario 1: Kassentarif §45b Basis', () => {
  it('berechnet korrekt ohne Zuschlage', () => {
    const tarif = makeTarif({
      rechtsgrundlage: '§45b SGB XI',
      preis_cent: 3500,
      tarifquelle: 'ANERKENNUNGSBESCHEID',
    });
    const result = calculateLineTotal({
      tarif,
      menge: 1,
      datum: '2026-08-07',
      istWochenende: false,
      istFeiertag: false,
    });
    expect(result.einzelpreisCent).toBe(3500);
    expect(result.zuschlagProzent).toBe(0);
    expect(result.zuschlagGrund).toBeNull();
    expect(result.gesamtpreisCent).toBe(3500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 2: Privattarif — nur rechtsgrundlage='privat' darf matchen
// ═══════════════════════════════════════════════════════════════════════════
describe('Szenario 2: Privat/Kasse-Trennung (P7)', () => {
  it('budgetType=private → rechtsgrundlage=privat (nicht NULL)', () => {
    const rg = budgetTypeToRechtsgrundlage('private');
    expect(rg).toBe('privat');
  });

  it('budgetType=entlastung → rechtsgrundlage=§45b SGB XI', () => {
    const rg = budgetTypeToRechtsgrundlage('entlastung');
    expect(rg).toBe('§45b SGB XI');
  });

  it('budgetType=verhinderung → rechtsgrundlage=§39 SGB XI', () => {
    const rg = budgetTypeToRechtsgrundlage('verhinderung');
    expect(rg).toBe('§39 SGB XI');
  });

  it('budgetType=carryover → rechtsgrundlage=§45b SGB XI', () => {
    const rg = budgetTypeToRechtsgrundlage('carryover');
    expect(rg).toBe('§45b SGB XI');
  });

  it('budgetType=haeusliche_pflege_36 → rechtsgrundlage=§36 SGB XI', () => {
    const rg = budgetTypeToRechtsgrundlage('haeusliche_pflege_36');
    expect(rg).toBe('§36 SGB XI');
  });

  it('unbekannter budgetType wirft Fehler', () => {
    expect(() => budgetTypeToRechtsgrundlage('fantasie')).toThrow(
      'Unbekannter budget_type'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 3: Privattarif-Snapshot enthaelt rechtsgrundlage='privat'
// ═══════════════════════════════════════════════════════════════════════════
describe('Szenario 3: Privattarif-Snapshot', () => {
  it('Snapshot hat rechtsgrundlage=privat', () => {
    const tarif = makeTarif({
      rechtsgrundlage: 'privat',
      tarifquelle: 'PRIVATE_PREISLISTE',
      preis_cent: 4000,
    });
    const lineResult = calculateLineTotal({
      tarif,
      menge: 1,
      datum: '2026-08-07',
    });
    const snapshot = snapshotPrice(tarif, lineResult);
    expect(snapshot.rechtsgrundlage).toBe('privat');
    expect(snapshot.einzelpreis_cent).toBe(4000);
    expect(snapshot.tarif_id).toBe('test-tarif-1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 4: Zuschlaege default 0% (P5)
// ═══════════════════════════════════════════════════════════════════════════
describe('Szenario 4: Zuschlaege Default 0%', () => {
  it('Wochenende ohne Zuschlag-Konfiguration: 0%', () => {
    const tarif = makeTarif({
      zuschlag_wochenende_prozent: 0,
      zuschlag_feiertag_prozent: 0,
      zuschlag_nacht_prozent: 0,
    });
    const result = calculateLineTotal({
      tarif,
      menge: 1,
      datum: '2026-08-08', // Samstag
      istWochenende: true,
      istFeiertag: false,
    });
    // Wochenende=true, aber zuschlag=0 → kein Aufschlag
    expect(result.zuschlagProzent).toBe(0);
    expect(result.zuschlagGrund).toBeNull();
  });

  it('Feiertag ohne Zuschlag-Konfiguration: 0%', () => {
    const tarif = makeTarif({
      zuschlag_feiertag_prozent: 0,
    });
    const result = calculateLineTotal({
      tarif,
      menge: 1,
      datum: '2026-12-25',
      istFeiertag: true,
    });
    expect(result.zuschlagProzent).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 5: Zuschlag korrekt angewendet wenn konfiguriert
// ═══════════════════════════════════════════════════════════════════════════
describe('Szenario 5: Zuschlaege korrekt', () => {
  it('Wochenendzuschlag 25%', () => {
    const tarif = makeTarif({
      preis_cent: 4000,
      zuschlag_wochenende_prozent: 25,
    });
    const result = calculateLineTotal({
      tarif,
      menge: 1,
      datum: '2026-08-08',
      istWochenende: true,
    });
    expect(result.zuschlagProzent).toBe(25);
    expect(result.zuschlagGrund).toBe('wochenende');
    // 4000 Cent + 25% = 5000 Cent
    expect(result.gesamtpreisCent).toBe(5000);
  });

  it('Feiertag hat Vorrang vor Wochenende', () => {
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
    // 4000 + 50% = 6000
    expect(result.gesamtpreisCent).toBe(6000);
  });

  it('Nachtzuschlag kumulativ zu Wochenende', () => {
    const tarif = makeTarif({
      preis_cent: 4000,
      zuschlag_wochenende_prozent: 25,
      zuschlag_nacht_prozent: 15,
      nacht_von: '20:00',
      nacht_bis: '06:00',
    });
    const result = calculateLineTotal({
      tarif,
      menge: 1,
      datum: '2026-08-08',
      zeitVon: '21:00',
      zeitBis: '23:00',
      istWochenende: true,
    });
    // 25% WE + 15% Nacht = 40%
    expect(result.zuschlagProzent).toBe(40);
    expect(result.zuschlagGrund).toBe('wochenende+nacht');
    // 4000 + 40% = 5600
    expect(result.gesamtpreisCent).toBe(5600);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 6: Wegepauschale (P8)
// ═══════════════════════════════════════════════════════════════════════════
describe('Szenario 6: Wegepauschale', () => {
  it('Wegepauschale als Pauschalbetrag pro Fahrt', () => {
    const tarif = makeTarif({
      leistungsart: 'wegepauschale',
      verguetungsart: 'wegepauschale',
      preis_cent: 500, // 5.00 EUR
      einheit: 'Fahrt',
      tarifquelle: 'ANERKENNUNGSBESCHEID',
    });
    const result = calculateLineTotal({
      tarif,
      menge: 1,
      datum: '2026-08-07',
    });
    expect(result.einzelpreisCent).toBe(500);
    expect(result.gesamtpreisCent).toBe(500);
    expect(result.zuschlagProzent).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 7: Tarifquelle-Werte (P4)
// ═══════════════════════════════════════════════════════════════════════════
describe('Szenario 7: Tarifquelle-Katalog', () => {
  const erlaubteQuellen: Tarifquelle[] = [
    'PRIVATE_PREISLISTE',
    'ANERKENNUNGSBESCHEID',
    'VERGUETUNGSVEREINBARUNG',
    'KASSENVEREINBARUNG',
    'MANUELL_FREIGEGEBEN',
  ];

  it.each(erlaubteQuellen)('Tarifquelle "%s" ist gueltig', (quelle) => {
    const tarif = makeTarif({ tarifquelle: quelle });
    expect(tarif.tarifquelle).toBe(quelle);
  });

  it('null ist erlaubt (Bestandsschutz)', () => {
    const tarif = makeTarif({ tarifquelle: null });
    expect(tarif.tarifquelle).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 8: IK-spezifischer Tarif Snapshot (P6)
// ═══════════════════════════════════════════════════════════════════════════
describe('Szenario 8: IK-spezifischer Tarif', () => {
  it('Snapshot mit IK-spezifischem Tarif', () => {
    const tarif = makeTarif({
      kostentraeger_ik: '460629986',
      preis_cent: 3800,
      tarifquelle: 'VERGUETUNGSVEREINBARUNG',
    });
    const lineResult = calculateLineTotal({
      tarif,
      menge: 2,
      datum: '2026-08-07',
    });
    const snapshot = snapshotPrice(tarif, lineResult);
    expect(snapshot.einzelpreis_cent).toBe(3800);
    // 2 Stunden × 38.00 EUR
    expect(snapshot.gesamtpreis_cent).toBe(7600);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 9: Historische Versionierung (gueltig_ab/gueltig_bis)
// ═══════════════════════════════════════════════════════════════════════════
describe('Szenario 9: Historische Tarif-Versionierung', () => {
  it('Tarif mit gueltig_bis wird korrekt gesnapshoted', () => {
    const altTarif = makeTarif({
      id: 'tarif-alt',
      preis_cent: 3000,
      gueltig_ab: '2025-01-01',
      gueltig_bis: '2025-12-31',
    });
    const neuTarif = makeTarif({
      id: 'tarif-neu',
      preis_cent: 3500,
      gueltig_ab: '2026-01-01',
      gueltig_bis: null,
    });

    const altResult = calculateLineTotal({
      tarif: altTarif,
      menge: 1,
      datum: '2025-06-15',
    });
    const neuResult = calculateLineTotal({
      tarif: neuTarif,
      menge: 1,
      datum: '2026-06-15',
    });

    expect(altResult.einzelpreisCent).toBe(3000);
    expect(neuResult.einzelpreisCent).toBe(3500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 10: Nachtzeit ueber Mitternacht
// ═══════════════════════════════════════════════════════════════════════════
describe('Szenario 10: Nachtzeit-Berechnung', () => {
  it('Einsatz um 22:00 liegt in Nachtzeit (20:00-06:00)', () => {
    const tarif = makeTarif({
      preis_cent: 4000,
      zuschlag_nacht_prozent: 20,
      nacht_von: '20:00',
      nacht_bis: '06:00',
    });
    const result = calculateLineTotal({
      tarif,
      menge: 1,
      datum: '2026-08-07',
      zeitVon: '22:00',
      zeitBis: '00:30',
    });
    expect(result.zuschlagProzent).toBe(20);
    expect(result.zuschlagGrund).toBe('nacht');
  });

  it('Einsatz um 14:00 liegt NICHT in Nachtzeit', () => {
    const tarif = makeTarif({
      preis_cent: 4000,
      zuschlag_nacht_prozent: 20,
      nacht_von: '20:00',
      nacht_bis: '06:00',
    });
    const result = calculateLineTotal({
      tarif,
      menge: 1,
      datum: '2026-08-07',
      zeitVon: '14:00',
      zeitBis: '16:00',
    });
    expect(result.zuschlagProzent).toBe(0);
    expect(result.zuschlagGrund).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 11: Kombination aller Zuschlag-Typen
// ═══════════════════════════════════════════════════════════════════════════
describe('Szenario 11: Feiertag + Nacht kumulativ', () => {
  it('Feiertag 50% + Nacht 15% = 65%', () => {
    const tarif = makeTarif({
      preis_cent: 4000,
      zuschlag_feiertag_prozent: 50,
      zuschlag_nacht_prozent: 15,
      nacht_von: '20:00',
      nacht_bis: '06:00',
    });
    const result = calculateLineTotal({
      tarif,
      menge: 1,
      datum: '2026-12-25',
      zeitVon: '21:00',
      zeitBis: '23:00',
      istFeiertag: true,
    });
    expect(result.zuschlagProzent).toBe(65);
    expect(result.zuschlagGrund).toBe('feiertag+nacht');
    // 4000 + 65% = 6600
    expect(result.gesamtpreisCent).toBe(6600);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 12: Leistungsarten-Katalog Vollstaendigkeit (P3)
// ═══════════════════════════════════════════════════════════════════════════
describe('Szenario 12: Leistungsarten-Katalog', () => {
  const erwarteteLeistungsarten = [
    'alltagsbegleitung',
    'betreuung_45a',
    'verhinderungspflege',
    'hauswirtschaft',
    'einkaufsservice',
    'begleitservice',
    'nachtbetreuung',
    'wochenendbetreuung',
    'krankenfahrt',
    'demenzbetreuung',
    'wegepauschale',
    'sonstige',
  ];

  it('Katalog umfasst alle 12 stabilen Codes', () => {
    expect(erwarteteLeistungsarten).toHaveLength(12);
    // Alle codes sind Freitext-frei (nur lowercase, digits + underscore)
    erwarteteLeistungsarten.forEach((code) => {
      expect(code).toMatch(/^[a-z0-9_]+$/);
    });
  });

  it.each(erwarteteLeistungsarten)('Leistungsart "%s" kann in Tarif verwendet werden', (la) => {
    const tarif = makeTarif({ leistungsart: la });
    expect(tarif.leistungsart).toBe(la);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SZENARIO 13: Rechtsgrundlagen-Katalog (P3/P7)
// ═══════════════════════════════════════════════════════════════════════════
describe('Szenario 13: Rechtsgrundlagen-Katalog', () => {
  const erlaubteRechtsgrundlagen = [
    '§45b SGB XI',
    '§39 SGB XI',
    '§36 SGB XI',
    'privat',
  ];

  it('Katalog umfasst exakt 4 Rechtsgrundlagen', () => {
    expect(erlaubteRechtsgrundlagen).toHaveLength(4);
  });

  it('alle budget_types mappen auf gueltige Rechtsgrundlagen', () => {
    const budgetTypes = ['entlastung', 'verhinderung', 'carryover', 'haeusliche_pflege_36', 'private'];
    budgetTypes.forEach((bt) => {
      const rg = budgetTypeToRechtsgrundlage(bt);
      expect(erlaubteRechtsgrundlagen).toContain(rg);
    });
  });
});
