/**
 * Tests fuer Feiertage-Berechnung (lib/billing/core/feiertage.ts)
 *
 * Alle 16 Bundeslaender, Jahre 2026 und 2027.
 * Ostersonntag 2026 = 05.04.2026, Ostersonntag 2027 = 28.03.2027.
 */
import { describe, it, expect } from 'vitest';
import {
  bundesweiteFeiertage,
  landesFeiertage,
} from '@/lib/billing/core/feiertage';

// ── Bundesweite Feiertage ──────────────────────────────────────

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

  it('Christi Himmelfahrt 2026 ist am 14. Mai (Ostern + 39)', () => {
    const hf = feiertage2026.find(f => f.bezeichnung === 'Christi Himmelfahrt');
    expect(hf?.datum).toBe('2026-05-14');
  });

  it('Pfingstmontag 2026 ist am 25. Mai (Ostern + 50)', () => {
    const pm = feiertage2026.find(f => f.bezeichnung === 'Pfingstmontag');
    expect(pm?.datum).toBe('2026-05-25');
  });

  it('2027: Karfreitag am 26. Maerz, Ostermontag am 29. Maerz', () => {
    const f2027 = bundesweiteFeiertage(2027);
    expect(f2027.find(f => f.bezeichnung === 'Karfreitag')?.datum).toBe('2027-03-26');
    expect(f2027.find(f => f.bezeichnung === 'Ostermontag')?.datum).toBe('2027-03-29');
  });
});

// ── Ostern-Berechnung (Gauss-Algorithmus) ──────────────────────

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

// ── Landesfeiertage: alle 16 Bundeslaender ─────────────────────

describe('landesFeiertage', () => {

  // -- Baden-Wuerttemberg (BW): Heilige Drei Koenige, Fronleichnam, Allerheiligen
  describe('Baden-Wuerttemberg', () => {
    it('hat 3 Landesfeiertage', () => {
      const bw = landesFeiertage(2026, 'baden_wuerttemberg');
      expect(bw.length).toBe(3);
      const namen = bw.map(f => f.bezeichnung);
      expect(namen).toContain('Heilige Drei Koenige');
      expect(namen).toContain('Fronleichnam');
      expect(namen).toContain('Allerheiligen');
    });

    it('Heilige Drei Koenige am 6. Januar', () => {
      const bw = landesFeiertage(2026, 'baden_wuerttemberg');
      expect(bw.find(f => f.bezeichnung === 'Heilige Drei Koenige')?.datum).toBe('2026-01-06');
    });

    it('Fronleichnam 2026 am 4. Juni (Ostern + 60)', () => {
      const bw = landesFeiertage(2026, 'baden_wuerttemberg');
      expect(bw.find(f => f.bezeichnung === 'Fronleichnam')?.datum).toBe('2026-06-04');
    });

    it('akzeptiert auch Bindestrich-Format', () => {
      const bw = landesFeiertage(2026, 'baden-wuerttemberg');
      expect(bw.length).toBe(3);
    });
  });

  // -- Bayern (BY): Heilige Drei Koenige, Fronleichnam, Mariae Himmelfahrt, Allerheiligen
  describe('Bayern', () => {
    it('hat 4 Landesfeiertage', () => {
      const by = landesFeiertage(2026, 'bayern');
      expect(by.length).toBe(4);
      const namen = by.map(f => f.bezeichnung);
      expect(namen).toContain('Heilige Drei Koenige');
      expect(namen).toContain('Fronleichnam');
      expect(namen).toContain('Mariae Himmelfahrt');
      expect(namen).toContain('Allerheiligen');
    });

    it('Mariae Himmelfahrt am 15. August', () => {
      const by = landesFeiertage(2026, 'bayern');
      expect(by.find(f => f.bezeichnung === 'Mariae Himmelfahrt')?.datum).toBe('2026-08-15');
    });
  });

  // -- Berlin (BE): Frauentag
  describe('Berlin', () => {
    it('hat 1 Landesfeiertag: Frauentag', () => {
      const be = landesFeiertage(2026, 'berlin');
      expect(be.length).toBe(1);
      expect(be[0].bezeichnung).toBe('Frauentag');
      expect(be[0].datum).toBe('2026-03-08');
      expect(be[0].bundesland).toBe('berlin');
    });
  });

  // -- Brandenburg (BB): Reformationstag
  describe('Brandenburg', () => {
    it('hat 1 Landesfeiertag: Reformationstag', () => {
      const bb = landesFeiertage(2026, 'brandenburg');
      expect(bb.length).toBe(1);
      expect(bb[0].bezeichnung).toBe('Reformationstag');
      expect(bb[0].datum).toBe('2026-10-31');
    });
  });

  // -- Bremen (HB): Reformationstag
  describe('Bremen', () => {
    it('hat 1 Landesfeiertag: Reformationstag', () => {
      const hb = landesFeiertage(2026, 'bremen');
      expect(hb.length).toBe(1);
      expect(hb[0].bezeichnung).toBe('Reformationstag');
      expect(hb[0].datum).toBe('2026-10-31');
    });
  });

  // -- Hamburg (HH): Reformationstag
  describe('Hamburg', () => {
    it('hat 1 Landesfeiertag: Reformationstag', () => {
      const hh = landesFeiertage(2026, 'hamburg');
      expect(hh.length).toBe(1);
      expect(hh[0].bezeichnung).toBe('Reformationstag');
      expect(hh[0].datum).toBe('2026-10-31');
    });
  });

  // -- Hessen (HE): Fronleichnam
  describe('Hessen', () => {
    it('hat 1 Landesfeiertag: Fronleichnam', () => {
      const he = landesFeiertage(2026, 'hessen');
      expect(he.length).toBe(1);
      expect(he[0].bezeichnung).toBe('Fronleichnam');
      expect(he[0].bundesland).toBe('hessen');
    });

    it('Fronleichnam 2026 am 4. Juni', () => {
      const he = landesFeiertage(2026, 'hessen');
      expect(he[0].datum).toBe('2026-06-04');
    });

    it('Fronleichnam 2027 am 27. Mai', () => {
      const he = landesFeiertage(2027, 'hessen');
      expect(he[0].datum).toBe('2027-05-27');
    });
  });

  // -- Mecklenburg-Vorpommern (MV): Frauentag, Reformationstag
  describe('Mecklenburg-Vorpommern', () => {
    it('hat 2 Landesfeiertage', () => {
      const mv = landesFeiertage(2026, 'mecklenburg_vorpommern');
      expect(mv.length).toBe(2);
      const namen = mv.map(f => f.bezeichnung);
      expect(namen).toContain('Frauentag');
      expect(namen).toContain('Reformationstag');
    });

    it('Frauentag am 8. Maerz', () => {
      const mv = landesFeiertage(2026, 'mecklenburg_vorpommern');
      expect(mv.find(f => f.bezeichnung === 'Frauentag')?.datum).toBe('2026-03-08');
    });

    it('akzeptiert Bindestrich-Format', () => {
      const mv = landesFeiertage(2026, 'mecklenburg-vorpommern');
      expect(mv.length).toBe(2);
    });
  });

  // -- Niedersachsen (NI): Reformationstag
  describe('Niedersachsen', () => {
    it('hat 1 Landesfeiertag: Reformationstag', () => {
      const ni = landesFeiertage(2026, 'niedersachsen');
      expect(ni.length).toBe(1);
      expect(ni[0].bezeichnung).toBe('Reformationstag');
    });
  });

  // -- Nordrhein-Westfalen (NW): Fronleichnam, Allerheiligen
  describe('Nordrhein-Westfalen', () => {
    it('hat 2 Landesfeiertage', () => {
      const nw = landesFeiertage(2026, 'nordrhein_westfalen');
      expect(nw.length).toBe(2);
      const namen = nw.map(f => f.bezeichnung);
      expect(namen).toContain('Fronleichnam');
      expect(namen).toContain('Allerheiligen');
    });

    it('akzeptiert Bindestrich-Format', () => {
      const nw = landesFeiertage(2026, 'nordrhein-westfalen');
      expect(nw.length).toBe(2);
    });

    it('akzeptiert Kurzform nrw', () => {
      const nw = landesFeiertage(2026, 'nrw');
      expect(nw.length).toBe(2);
    });

    it('bundesland-Feld nutzt kanonisches Format', () => {
      const nw = landesFeiertage(2026, 'nordrhein_westfalen');
      for (const f of nw) {
        expect(f.bundesland).toBe('nordrhein_westfalen');
      }
    });
  });

  // -- Rheinland-Pfalz (RP): Fronleichnam, Allerheiligen
  describe('Rheinland-Pfalz', () => {
    it('hat 2 Landesfeiertage', () => {
      const rp = landesFeiertage(2026, 'rheinland_pfalz');
      expect(rp.length).toBe(2);
      const namen = rp.map(f => f.bezeichnung);
      expect(namen).toContain('Fronleichnam');
      expect(namen).toContain('Allerheiligen');
    });
  });

  // -- Saarland (SL): Fronleichnam, Mariae Himmelfahrt, Allerheiligen
  describe('Saarland', () => {
    it('hat 3 Landesfeiertage', () => {
      const sl = landesFeiertage(2026, 'saarland');
      expect(sl.length).toBe(3);
      const namen = sl.map(f => f.bezeichnung);
      expect(namen).toContain('Fronleichnam');
      expect(namen).toContain('Mariae Himmelfahrt');
      expect(namen).toContain('Allerheiligen');
    });

    it('Mariae Himmelfahrt am 15. August', () => {
      const sl = landesFeiertage(2026, 'saarland');
      expect(sl.find(f => f.bezeichnung === 'Mariae Himmelfahrt')?.datum).toBe('2026-08-15');
    });
  });

  // -- Sachsen (SN): Reformationstag, Buss und Bettag
  describe('Sachsen', () => {
    it('hat 2 Landesfeiertage', () => {
      const sn = landesFeiertage(2026, 'sachsen');
      expect(sn.length).toBe(2);
      const namen = sn.map(f => f.bezeichnung);
      expect(namen).toContain('Reformationstag');
      expect(namen).toContain('Buss und Bettag');
    });

    it('Buss und Bettag 2026 am 18. November (Mi vor 23.11.)', () => {
      // 23.11.2026 = Montag → Mittwoch davor = 18.11.
      const sn = landesFeiertage(2026, 'sachsen');
      expect(sn.find(f => f.bezeichnung === 'Buss und Bettag')?.datum).toBe('2026-11-18');
    });

    it('Buss und Bettag 2027 am 17. November (Mi vor 23.11.)', () => {
      // 23.11.2027 = Dienstag → Mittwoch davor = 17.11.
      const sn = landesFeiertage(2027, 'sachsen');
      expect(sn.find(f => f.bezeichnung === 'Buss und Bettag')?.datum).toBe('2027-11-17');
    });
  });

  // -- Sachsen-Anhalt (ST): Heilige Drei Koenige, Reformationstag
  describe('Sachsen-Anhalt', () => {
    it('hat 2 Landesfeiertage', () => {
      const st = landesFeiertage(2026, 'sachsen_anhalt');
      expect(st.length).toBe(2);
      const namen = st.map(f => f.bezeichnung);
      expect(namen).toContain('Heilige Drei Koenige');
      expect(namen).toContain('Reformationstag');
    });

    it('Heilige Drei Koenige am 6. Januar', () => {
      const st = landesFeiertage(2026, 'sachsen_anhalt');
      expect(st.find(f => f.bezeichnung === 'Heilige Drei Koenige')?.datum).toBe('2026-01-06');
    });
  });

  // -- Schleswig-Holstein (SH): Reformationstag
  describe('Schleswig-Holstein', () => {
    it('hat 1 Landesfeiertag: Reformationstag', () => {
      const sh = landesFeiertage(2026, 'schleswig_holstein');
      expect(sh.length).toBe(1);
      expect(sh[0].bezeichnung).toBe('Reformationstag');
    });
  });

  // -- Thueringen (TH): Weltkindertag, Reformationstag
  describe('Thueringen', () => {
    it('hat 2 Landesfeiertage', () => {
      const th = landesFeiertage(2026, 'thueringen');
      expect(th.length).toBe(2);
      const namen = th.map(f => f.bezeichnung);
      expect(namen).toContain('Weltkindertag');
      expect(namen).toContain('Reformationstag');
    });

    it('Weltkindertag am 20. September', () => {
      const th = landesFeiertage(2026, 'thueringen');
      expect(th.find(f => f.bezeichnung === 'Weltkindertag')?.datum).toBe('2026-09-20');
    });
  });

  // -- Unbekanntes Bundesland → leeres Array
  describe('Unbekanntes Bundesland', () => {
    it('gibt leeres Array zurueck', () => {
      expect(landesFeiertage(2026, 'atlantis')).toEqual([]);
    });
  });
});

// ── Bewegliche Feiertage 2027 ──────────────────────────────────

describe('Bewegliche Feiertage 2027', () => {
  const f2027 = bundesweiteFeiertage(2027);

  it('Karfreitag 2027 am 26. Maerz (Ostern 28.03. - 2)', () => {
    expect(f2027.find(f => f.bezeichnung === 'Karfreitag')?.datum).toBe('2027-03-26');
  });

  it('Ostermontag 2027 am 29. Maerz (Ostern + 1)', () => {
    expect(f2027.find(f => f.bezeichnung === 'Ostermontag')?.datum).toBe('2027-03-29');
  });

  it('Christi Himmelfahrt 2027 am 6. Mai (Ostern + 39)', () => {
    expect(f2027.find(f => f.bezeichnung === 'Christi Himmelfahrt')?.datum).toBe('2027-05-06');
  });

  it('Pfingstmontag 2027 am 17. Mai (Ostern + 50)', () => {
    expect(f2027.find(f => f.bezeichnung === 'Pfingstmontag')?.datum).toBe('2027-05-17');
  });

  it('Fronleichnam 2027 in Hessen am 27. Mai (Ostern + 60)', () => {
    const he = landesFeiertage(2027, 'hessen');
    expect(he.find(f => f.bezeichnung === 'Fronleichnam')?.datum).toBe('2027-05-27');
  });
});

// ── Gesamtzahl: bundesweit + Landesfeiertage ───────────────────

describe('Gesamtzahl Feiertage je Bundesland', () => {
  const expected: Record<string, number> = {
    baden_wuerttemberg: 12,      // 9 + 3 (Drei Koenige, Fronleichnam, Allerheiligen)
    bayern: 13,                  // 9 + 4 (Drei Koenige, Fronleichnam, Mariae Hf., Allerheiligen)
    berlin: 10,                  // 9 + 1 (Frauentag)
    brandenburg: 10,             // 9 + 1 (Reformationstag)
    bremen: 10,                  // 9 + 1 (Reformationstag)
    hamburg: 10,                 // 9 + 1 (Reformationstag)
    hessen: 10,                  // 9 + 1 (Fronleichnam)
    mecklenburg_vorpommern: 11,  // 9 + 2 (Frauentag, Reformationstag)
    niedersachsen: 10,           // 9 + 1 (Reformationstag)
    nordrhein_westfalen: 11,     // 9 + 2 (Fronleichnam, Allerheiligen)
    rheinland_pfalz: 11,        // 9 + 2 (Fronleichnam, Allerheiligen)
    saarland: 12,                // 9 + 3 (Fronleichnam, Mariae Hf., Allerheiligen)
    sachsen: 11,                 // 9 + 2 (Reformationstag, Buss und Bettag)
    sachsen_anhalt: 11,          // 9 + 2 (Drei Koenige, Reformationstag)
    schleswig_holstein: 10,      // 9 + 1 (Reformationstag)
    thueringen: 11,              // 9 + 2 (Weltkindertag, Reformationstag)
  };

  for (const [bl, total] of Object.entries(expected)) {
    it(`${bl}: ${total} Feiertage gesamt`, () => {
      const gesamt = bundesweiteFeiertage(2026).length + landesFeiertage(2026, bl).length;
      expect(gesamt).toBe(total);
    });
  }
});
