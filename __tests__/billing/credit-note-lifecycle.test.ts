/**
 * Tests fuer den Gutschrift-Lebenszyklus (Block 16)
 * @see lib/billing/core/credit-notes.ts
 */
import {
  releaseCreditNote,
  discardCreditNote,
  getRemainingCreditableCents,
} from '@/lib/billing/core/credit-notes';

const ORG = '00000000-0000-4000-8000-000460629986';
const OTHER_ORG = '11111111-1111-4111-8111-111111111111';
const ACTOR = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

interface Op {
  table: string;
  op: 'insert' | 'update';
  payload: Record<string, unknown>;
  filters: Record<string, unknown>;
}

/**
 * Minimaler Supabase-Doppelgaenger: liefert je Tabelle eine feste Antwort und
 * protokolliert alle Schreiboperationen, damit die Reihenfolge der
 * Statuswechsel geprueft werden kann.
 */
function makeDb(rows: Record<string, unknown>) {
  const ops: Op[] = [];

  function from(table: string) {
    const filters: Record<string, unknown> = {};
    let op: 'select' | 'insert' | 'update' = 'select';
    let payload: Record<string, unknown> = {};

    const result = () => {
      if (op === 'select') return { data: rows[table] ?? null, error: null };
      return { data: null, error: null };
    };

    const chain: any = {
      select: () => chain,
      insert: (p: Record<string, unknown>) => { op = 'insert'; payload = p; return chain; },
      update: (p: Record<string, unknown>) => { op = 'update'; payload = p; return chain; },
      eq: (col: string, val: unknown) => { filters[col] = val; return chain; },
      is: (col: string, val: unknown) => { filters[col] = val; return chain; },
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      single: async () => result(),
      maybeSingle: async () => result(),
      // Update/Insert-Ketten werden ohne single() awaited — deshalb thenable.
      then: (resolve: (v: unknown) => unknown) => {
        if (op !== 'select') ops.push({ table, op, payload, filters: { ...filters } });
        return Promise.resolve(result()).then(resolve);
      },
    };
    return chain;
  }

  return { db: { from } as any, ops };
}

const draftCorrection = {
  id: 'corr-1',
  correction_type: 'gutschrift',
  status: 'entwurf',
  original_invoice_id: 'inv-1',
  correction_invoice_id: 'credit-1',
  original_amount_cents: 3500,
  corrected_amount_cents: 2500,
  difference_cents: -1000,
  reason: 'Leistung doppelt abgerechnet',
  organization_id: ORG,
  deleted_at: null,
};

const draftCreditInvoice = {
  id: 'credit-1',
  status: 'entwurf',
  total_amount: -10,
  invoice_number: 'GS-2026-0001',
  invoice_number_formatted: 'GS-2026-0001',
  organization_id: ORG,
  frozen_at: null,
};

describe('releaseCreditNote', () => {
  it('hebt die Gutschrift-Rechnung regelkonform ueber geprueft nach freigegeben', async () => {
    const { db, ops } = makeDb({
      invoice_corrections: draftCorrection,
      invoices: draftCreditInvoice,
    });

    const result = await releaseCreditNote(db, 'corr-1', ACTOR, ORG);

    expect(result.status).toBe('freigegeben');
    expect(result.creditInvoiceId).toBe('credit-1');

    // Der direkte Sprung entwurf → freigegeben ist laut Statusmaschine
    // verboten; erwartet werden deshalb ZWEI Statusupdates in Reihenfolge.
    const statusUpdates = ops.filter(o => o.table === 'invoices' && 'status' in o.payload);
    expect(statusUpdates.map(o => o.payload.status)).toEqual(['geprueft', 'freigegeben']);
    // Race-Schutz: jedes Update filtert auf den erwarteten Ausgangsstatus.
    expect(statusUpdates[0].filters.status).toBe('entwurf');
    expect(statusUpdates[1].filters.status).toBe('geprueft');
  });

  it('schreibt die Gutschrift fest und legt einen Freigabe-Snapshot an', async () => {
    const { db, ops } = makeDb({
      invoice_corrections: draftCorrection,
      invoices: draftCreditInvoice,
    });

    await releaseCreditNote(db, 'corr-1', ACTOR, ORG);

    const freeze = ops.find(o => o.table === 'invoices' && 'frozen_at' in o.payload);
    expect(freeze).toBeDefined();

    const snapshot = ops.find(o => o.table === 'invoice_snapshots' && o.op === 'insert');
    expect(snapshot).toBeDefined();
    expect(snapshot!.payload.snapshot_type).toBe('gutschrift');
    // Version 1 gehoert der Erzeugung, die Freigabe ist Version 2.
    expect(snapshot!.payload.version).toBe(2);
    expect(snapshot!.payload.organization_id).toBe(ORG);
    expect(typeof snapshot!.payload.checksum).toBe('string');
  });

  it('setzt die Korrektur auf freigegeben mit Freigabevermerk', async () => {
    const { db, ops } = makeDb({
      invoice_corrections: draftCorrection,
      invoices: draftCreditInvoice,
    });

    await releaseCreditNote(db, 'corr-1', ACTOR, ORG);

    const corrUpdate = ops.find(o => o.table === 'invoice_corrections' && o.op === 'update');
    expect(corrUpdate!.payload.status).toBe('freigegeben');
    expect(corrUpdate!.payload.approved_by).toBe(ACTOR);
    expect(corrUpdate!.filters.status).toBe('entwurf');
  });

  it('schreibt einen Audit-Trail-Eintrag', async () => {
    const { db, ops } = makeDb({
      invoice_corrections: draftCorrection,
      invoices: draftCreditInvoice,
    });

    await releaseCreditNote(db, 'corr-1', ACTOR, ORG);

    const audit = ops.find(o => o.table === 'billing_audit_trail' && o.op === 'insert');
    expect(audit).toBeDefined();
    expect(audit!.payload.entity_type).toBe('credit_note');
    expect(audit!.payload.action).toBe('freigegeben');
    expect(audit!.payload.organization_id).toBe(ORG);
  });

  it('verweigert den Zugriff auf eine Korrektur eines anderen Mandanten', async () => {
    const { db } = makeDb({
      invoice_corrections: { ...draftCorrection, organization_id: OTHER_ORG },
      invoices: draftCreditInvoice,
    });

    await expect(releaseCreditNote(db, 'corr-1', ACTOR, ORG)).rejects.toThrow(/Organisation/);
  });

  it('lehnt eine bereits freigegebene Korrektur ab', async () => {
    const { db } = makeDb({
      invoice_corrections: { ...draftCorrection, status: 'freigegeben' },
      invoices: draftCreditInvoice,
    });

    await expect(releaseCreditNote(db, 'corr-1', ACTOR, ORG))
      .rejects.toThrow(/Statusübergang/);
  });

  it('lehnt eine bereits verworfene Korrektur ab', async () => {
    const { db } = makeDb({
      invoice_corrections: { ...draftCorrection, deleted_at: '2026-08-01T00:00:00Z' },
      invoices: draftCreditInvoice,
    });

    await expect(releaseCreditNote(db, 'corr-1', ACTOR, ORG)).rejects.toThrow(/verworfen/);
  });

  it('lehnt eine Gutschrift-Rechnung eines anderen Mandanten ab', async () => {
    const { db } = makeDb({
      invoice_corrections: draftCorrection,
      invoices: { ...draftCreditInvoice, organization_id: OTHER_ORG },
    });

    await expect(releaseCreditNote(db, 'corr-1', ACTOR, ORG)).rejects.toThrow(/Organisation/);
  });
});

describe('discardCreditNote', () => {
  it('storniert die Gutschrift-Rechnung und soft-deletet die Korrektur', async () => {
    const { db, ops } = makeDb({
      invoice_corrections: draftCorrection,
      invoices: draftCreditInvoice,
    });

    const result = await discardCreditNote(db, 'corr-1', 'Falsch angelegt', ACTOR, ORG);
    expect(result.status).toBe('verworfen');

    const invUpdate = ops.find(o => o.table === 'invoices' && o.op === 'update');
    expect(invUpdate!.payload.status).toBe('storniert');
    expect(invUpdate!.payload.deleted_at).toBeTruthy();

    const corrUpdate = ops.find(o => o.table === 'invoice_corrections' && o.op === 'update');
    expect(corrUpdate!.payload.deleted_at).toBeTruthy();
  });

  it('lehnt das Verwerfen einer freigegebenen Korrektur ab', async () => {
    const { db } = makeDb({
      invoice_corrections: { ...draftCorrection, status: 'freigegeben' },
      invoices: draftCreditInvoice,
    });

    await expect(discardCreditNote(db, 'corr-1', 'Grund', ACTOR, ORG))
      .rejects.toThrow(/Entwurf/);
  });

  it('lehnt das Verwerfen einer festgeschriebenen Gutschrift-Rechnung ab', async () => {
    const { db } = makeDb({
      invoice_corrections: draftCorrection,
      invoices: { ...draftCreditInvoice, frozen_at: '2026-08-01T00:00:00Z' },
    });

    await expect(discardCreditNote(db, 'corr-1', 'Grund', ACTOR, ORG))
      .rejects.toThrow(/festgeschrieben/);
  });

  it('protokolliert das Verwerfen im Audit-Trail', async () => {
    const { db, ops } = makeDb({
      invoice_corrections: draftCorrection,
      invoices: draftCreditInvoice,
    });

    await discardCreditNote(db, 'corr-1', 'Falsch angelegt', ACTOR, ORG);

    const audit = ops.find(o => o.table === 'billing_audit_trail' && o.op === 'insert');
    expect(audit!.payload.action).toBe('verworfen');
    expect(audit!.payload.reason).toBe('Falsch angelegt');
  });
});

describe('getRemainingCreditableCents', () => {
  it('zieht bereits vergebene Gutschriften ab', async () => {
    // 3500 Cent Rechnung, davon 1000 gutgeschrieben → 2500 verbleiben
    const { db } = makeDb({ invoice_corrections: [{ corrected_amount_cents: 2500 }] });
    await expect(getRemainingCreditableCents(db, 'inv-1', 3500)).resolves.toBe(2500);
  });

  it('summiert mehrere Teilgutschriften', async () => {
    const { db } = makeDb({
      invoice_corrections: [{ corrected_amount_cents: 3000 }, { corrected_amount_cents: 3200 }],
    });
    // 500 + 300 bereits gutgeschrieben → 2700 verbleiben
    await expect(getRemainingCreditableCents(db, 'inv-1', 3500)).resolves.toBe(2700);
  });

  it('gibt den vollen Betrag zurueck, wenn noch nichts gutgeschrieben ist', async () => {
    const { db } = makeDb({ invoice_corrections: [] });
    await expect(getRemainingCreditableCents(db, 'inv-1', 3500)).resolves.toBe(3500);
  });

  it('wird nie negativ', async () => {
    const { db } = makeDb({ invoice_corrections: [{ corrected_amount_cents: 0 }, { corrected_amount_cents: 0 }] });
    await expect(getRemainingCreditableCents(db, 'inv-1', 3500)).resolves.toBe(0);
  });
});
