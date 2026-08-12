/**
 * Tests fuer Feiertage-Berechnung (lib/billing/core/feiertage.ts)
 */
import { describe, it, expect } from 'vitest';
import {
  bundesweiteFeiertage,
  landesFeiertage,
} from '@/lib/billing/core/feiertage';

describe('bundesweiteFeiertage', () => {
  const feiertage2026 = bundesweiteFeiertage(2026);

  it('gibt genau 9 bundesweite Feiertage zurueck', () => {
    expect(feiertage2026.length).toBe(9);
  });

  it('alle haben bundesland = null', () => {
    for (const f of feiertage2026) {
      expect(f.bundesland).toBeNull();
    }
  });

  it('Neujahr ist am 1. Januar', () => {
    const neujahr = feiertage2026.find(f => f.bezeichnung === 'Neujahr');
    expect(neujahr?.datum).toBe('2026-01-01');
  });

  it('Weihnachten ist am 25. und 26. Dezember', () => {
    const w1 = feiertage2026.find(f => f.bezeichnung === '1. Weihnachtsfeiertag');
    const w2 = feiertage2026.find(f => f.bezeichnung === '2. Weihnachtsfeiertag');
    expect(w1?.datum).toBe('2026-12-25');
    expect(w2?.datum).toBe('2026-12-26');
  });

  it('Tag der Deutschen Einheit ist am 3. Oktober', () => {
    const tde = feiertage2026.find(f => f.bezeichnung === 'Tag der Deutschen Einheit');
    expect(tde?.datum).toBe('2026-10-03');
  });

  it('Tag der Arbeit ist am 1. Mai', () => {
    const mai = feiertage2026.find(f => f.bezeichnung === 'Tag der Arbeit');
    expect(mai?.datum).toBe('2026-05-01');
  });

  it('Karfreitag 2026 ist am 3. April', () => {
    const kf = feiertage2026.find(f => f.bezeichnung === 'Karfreitag');
    expect(kf?.datum).toBe('2026-04-03');
  });

  it('Ostermontag 2026 ist am 6. April', () => {
    const om = feiertage2026.find(f => f.bezeichnung === 'Ostermontag');
    expect(om?.datum).toBe('2026-04-06');
  });
});

describe('landesFeiertage', () => {
  it('Hessen hat Fronleichnam', () => {
    const hessen = landesFeiertage(2026, 'hessen');
    const fl = hessen.find(f => f.bezeichnung === 'Fronleichnam');
    expect(fl).toBeDefined();
    expect(fl?.bundesland).toBe('hessen');
  });

  it('Bayern hat 4 zusaetzliche Feiertage', () => {
    const bayern = landesFeiertage(2026, 'bayern');
    expect(bayern.length).toBe(4);
    const namen = bayern.map(f => f.bezeichnung);
    expect(namen).toContain('Heilige Drei Koenige');
    expect(namen).toContain('Fronleichnam');
    expect(namen).toContain('Mariae Himmelfahrt');
    expect(namen).toContain('Allerheiligen');
  });

  it('Niedersachsen hat Reformationstag', () => {
    const nds = landesFeiertage(2026, 'niedersachsen');
    expect(nds.find(f => f.bezeichnung === 'Reformationstag')).toBeDefined();
  });

  it('NRW hat Fronleichnam und Allerheiligen', () => {
    const nrw = landesFeiertage(2026, 'nordrhein-westfalen');
    expect(nrw.length).toBe(2);
  });
});

describe('Ostern-Berechnung (Gauss-Algorithmus)', () => {
  it('berechnet korrekte Osterdaten', () => {
    const testcases = [
      { jahr: 2025, erwartung: '2025-04-21' },
      { jahr: 2026, erwartung: '2026-04-06' },
      { jahr: 2027, erwartung: '2027-03-29' },
    ];

    for (const tc of testcases) {
      const feiertage = bundesweiteFeiertage(tc.jahr);
      const ostermontag = feiertage.find(f => f.bezeichnung === 'Ostermontag');
      expect(ostermontag?.datum, `Ostermontag ${tc.jahr}`).toBe(tc.erwartung);
    }
  });
});
