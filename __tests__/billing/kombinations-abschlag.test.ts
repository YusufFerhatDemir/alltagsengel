/**
 * Kombinationsabschlag — Regressionstests (Lueckenanalyse Bereich 7, P3).
 *
 * `billing_tariffs.kombinations_abschlag_prozent` existiert seit Migration
 * 20260806200000, wurde von `calculateLineTotal()` aber nie gelesen. Ein im
 * Tarif hinterlegter Abschlag waere STILL ignoriert und die Position zum
 * vollen Satz abgerechnet worden.
 *
 * Diese Tests halten die drei Regeln fest, die den Fall jetzt schliessen:
 *   1. Kein Abschlag im Tarif → unveraendertes Verhalten (0 %).
 *   2. Abschlag im Tarif, aber Aufrufer schweigt → Fehler statt Raten.
 *   3. Abschlag angewandt → auf den bezuschlagten Betrag, und der
 *      Preis-Snapshot sagt ab, weil er keine Abschlagsspalte hat.
 */
import {
  calculateLineTotal,
  snapshotPrice,
  type BillingTarif,
} from '@/lib/billing/core/price-resolver';

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
    preis_cent: 3000,
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
    ...overrides,
  } as BillingTarif;
}

describe('Kombinationsabschlag', () => {
  it('Tarif ohne Abschlag: Verhalten unveraendert, abschlagProzent = 0', () => {
    const result = calculateLineTotal({
      tarif: makeTarif({ kombinations_abschlag_prozent: 0 }),
      menge: 2,
      datum: '2026-06-10',
    });

    expect(result.abschlagProzent).toBe(0);
    expect(result.gesamtpreisCent).toBe(6000);
  });

  it('Tarif ohne Abschlag: istKombination bleibt folgenlos', () => {
    const result = calculateLineTotal({
      tarif: makeTarif({ kombinations_abschlag_prozent: 0 }),
      menge: 1,
      datum: '2026-06-10',
      istKombination: true,
    });

    expect(result.abschlagProzent).toBe(0);
    expect(result.gesamtpreisCent).toBe(3000);
  });

  it('Abschlag im Tarif ohne Angabe des Aufrufers: Fehler statt geratenem Betrag', () => {
    expect(() =>
      calculateLineTotal({
        tarif: makeTarif({ kombinations_abschlag_prozent: 10 }),
        menge: 1,
        datum: '2026-06-10',
      }),
    ).toThrow(/Kombinationsabschlag/);
  });

  it('istKombination=false: Abschlag wird bewusst nicht angewandt', () => {
    const result = calculateLineTotal({
      tarif: makeTarif({ kombinations_abschlag_prozent: 10 }),
      menge: 1,
      datum: '2026-06-10',
      istKombination: false,
    });

    expect(result.abschlagProzent).toBe(0);
    expect(result.gesamtpreisCent).toBe(3000);
  });

  it('istKombination=true: Abschlag wird angewandt', () => {
    const result = calculateLineTotal({
      tarif: makeTarif({ kombinations_abschlag_prozent: 10 }),
      menge: 2,
      datum: '2026-06-10',
      istKombination: true,
    });

    expect(result.abschlagProzent).toBe(10);
    // 3000 * 2 = 6000, minus 10 % = 5400
    expect(result.gesamtpreisCent).toBe(5400);
  });

  it('Abschlag rechnet auf den bezuschlagten Betrag, nicht auf den Grundpreis', () => {
    const result = calculateLineTotal({
      tarif: makeTarif({
        kombinations_abschlag_prozent: 10,
        zuschlag_feiertag_prozent: 25,
      }),
      menge: 1,
      datum: '2026-12-25',
      istFeiertag: true,
      istKombination: true,
    });

    // 3000 + 25 % = 3750, davon 10 % Abschlag = 3375
    expect(result.zuschlagProzent).toBe(25);
    expect(result.abschlagProzent).toBe(10);
    expect(result.gesamtpreisCent).toBe(3375);
  });

  it('snapshotPrice sagt ab, solange invoice_line_snapshots keine Abschlagsspalte hat', () => {
    const tarif = makeTarif({ kombinations_abschlag_prozent: 10 });
    const result = calculateLineTotal({
      tarif,
      menge: 1,
      datum: '2026-06-10',
      istKombination: true,
    });

    expect(() => snapshotPrice(tarif, result)).toThrow(/Abschlagsspalte|Kombinationsabschlag/);
  });

  it('snapshotPrice bleibt fuer Positionen ohne Abschlag unveraendert nutzbar', () => {
    const tarif = makeTarif();
    const result = calculateLineTotal({ tarif, menge: 1, datum: '2026-06-10' });
    const snapshot = snapshotPrice(tarif, result);

    expect(snapshot.gesamtpreis_cent).toBe(3000);
    expect(snapshot.zuschlag_prozent).toBe(0);
  });
});
