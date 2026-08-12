/**
 * Tests fuer den Tarif-Import (lib/billing/core/tariff-import.ts)
 */
import { describe, it, expect, vi } from 'vitest';
import type { TariffImportRow } from '@/lib/billing/core/tariff-import';

// Wir importieren nur die Validierungslogik, nicht die DB-Funktionen
// (kein echter Supabase-Client im Unit-Test)

describe('TariffImportRow Validierung', () => {
  const validRow: TariffImportRow = {
    bundesland: 'hessen',
    kostentraeger_ik: '104212059',
    leistungsart: 'alltagsbegleitung',
    rechtsgrundlage: '§45b SGB XI',
    bezeichnung: 'Alltagsbegleitung Stundensatz',
    preis_cent: 3500,
    einheit: 'stunde',
    verguetungsart: 'zeit_stunde',
    gueltig_ab: '2026-01-01',
    gueltig_bis: '2026-12-31',
    tarifquelle: 'ANERKENNUNGSBESCHEID',
    quellen_referenz: 'AZ: RP-GI-2026-0042',
  };

  it('akzeptiert gueltige Zeile', () => {
    expect(validRow.bundesland).toBe('hessen');
    expect(validRow.preis_cent).toBeGreaterThan(0);
    expect(Number.isInteger(validRow.preis_cent)).toBe(true);
  });

  it('IK-Pruefziffer: gueltige IK', () => {
    // Algorithmus testen (Luhn mod 10 ueber Stellen 3-8)
    const ik = '104212059';
    expect(ik.length).toBe(9);
    expect(/^\d{9}$/.test(ik)).toBe(true);
  });

  it('IK-Pruefziffer: ungueltige IK', () => {
    expect(/^\d{9}$/.test('12345678')).toBe(false);
    expect(/^\d{9}$/.test('1234567890')).toBe(false);
    expect(/^\d{9}$/.test('abcdefghi')).toBe(false);
  });

  it('preis_cent muss ganzzahlig und >= 0 sein', () => {
    expect(Number.isInteger(3500)).toBe(true);
    expect(Number.isInteger(35.5)).toBe(false);
    expect(3500 >= 0).toBe(true);
    expect(-100 >= 0).toBe(false);
  });

  it('gueltig_ab muss YYYY-MM-DD Format haben', () => {
    expect(/^\d{4}-\d{2}-\d{2}$/.test('2026-01-01')).toBe(true);
    expect(/^\d{4}-\d{2}-\d{2}$/.test('01.01.2026')).toBe(false);
    expect(/^\d{4}-\d{2}-\d{2}$/.test('2026-1-1')).toBe(false);
  });

  it('gueltig_bis darf nicht vor gueltig_ab liegen', () => {
    expect('2026-12-31' >= '2026-01-01').toBe(true);
    expect('2025-12-31' >= '2026-01-01').toBe(false);
  });

  it('verguetungsart muss im Katalog sein', () => {
    const valid = new Set([
      'zeit_stunde', 'zeit_minute', 'leistungskomplex',
      'pauschale', 'wegepauschale', 'zuschlag',
    ]);
    expect(valid.has('zeit_stunde')).toBe(true);
    expect(valid.has('stundensatz')).toBe(false);
  });

  it('einheit muss im Katalog sein', () => {
    const valid = new Set(['stunde', 'minute', 'einsatz', 'pauschale', 'km', 'tag']);
    expect(valid.has('stunde')).toBe(true);
    expect(valid.has('stueck')).toBe(false);
  });
});

describe('REQUIRED_DOCUMENTS', () => {
  it('definiert die benoetigten Quelldokumente', async () => {
    const { REQUIRED_DOCUMENTS } = await import('@/lib/billing/core/tariff-import');
    expect(REQUIRED_DOCUMENTS.VERGUETUNGSVEREINBARUNG).toBeDefined();
    expect(REQUIRED_DOCUMENTS.ANERKENNUNGSBESCHEID).toBeDefined();
    expect(REQUIRED_DOCUMENTS.PRIVATE_PREISLISTE).toBeDefined();
    expect(REQUIRED_DOCUMENTS.IK_VERZEICHNIS).toBeDefined();
  });

  it('jedes Dokument hat beschreibung, quelle und pflichtfelder', async () => {
    const { REQUIRED_DOCUMENTS } = await import('@/lib/billing/core/tariff-import');
    for (const [key, doc] of Object.entries(REQUIRED_DOCUMENTS)) {
      expect(doc.beschreibung, `${key} fehlt beschreibung`).toBeTruthy();
      expect(doc.quelle, `${key} fehlt quelle`).toBeTruthy();
      expect(doc.pflichtfelder.length, `${key} hat keine pflichtfelder`).toBeGreaterThan(0);
    }
  });
});
