/**
 * Tests fuer den Invoice Engine
 * @see lib/billing/core/invoice-engine.ts
 * @see lib/billing/core/idempotency.ts
 * @see lib/billing/core/audit.ts
 */
import { vi } from 'vitest';
import { generateIdempotencyKey, checkIdempotency } from '@/lib/billing/core/idempotency';
import { computeChecksum, computeSnapshotChecksum } from '@/lib/billing/core/audit';

// Re-export-Check: stelle sicher, dass die Engine-Typen importierbar sind
import type {
  CreateDraftParams,
  CreateDraftResult,
  FreezeResult,
  CorrectionLineInput,
  CorrectionResult,
  CreditNoteResult,
} from '@/lib/billing/core/invoice-engine';

// ---------------------------------------------------------------------------
// Hilfsfunktionen: Mock-Supabase
// ---------------------------------------------------------------------------

function createMockSupabase() {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    returns: vi.fn().mockReturnThis(),
  };

  return {
    from: vi.fn(() => mockChain),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
    _chain: mockChain,
  };
}

// ---------------------------------------------------------------------------
// generateIdempotencyKey
// ---------------------------------------------------------------------------

describe('generateIdempotencyKey', () => {
  it('erzeugt deterministischen Key', () => {
    const key1 = generateIdempotencyKey('client-1', '2026-06', 'entlastung');
    const key2 = generateIdempotencyKey('client-1', '2026-06', 'entlastung');
    expect(key1).toBe(key2);
  });

  it('verschiedene Inputs erzeugen verschiedene Keys', () => {
    const keyA = generateIdempotencyKey('client-1', '2026-06', 'entlastung');
    const keyB = generateIdempotencyKey('client-2', '2026-06', 'entlastung');
    const keyC = generateIdempotencyKey('client-1', '2026-07', 'entlastung');
    const keyD = generateIdempotencyKey('client-1', '2026-06', 'verhinderung');

    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyC);
    expect(keyA).not.toBe(keyD);
  });

  it('enthaelt alle Bestandteile im Key', () => {
    const key = generateIdempotencyKey('client-abc', '2026-08', 'entlastung');
    expect(key).toContain('client-abc');
    expect(key).toContain('2026-08');
    expect(key).toContain('entlastung');
  });

  it('beruecksichtigt Version', () => {
    const v1 = generateIdempotencyKey('c1', '2026-06', 'budget', 1);
    const v2 = generateIdempotencyKey('c1', '2026-06', 'budget', 2);
    expect(v1).not.toBe(v2);
    expect(v1).toContain('v1');
    expect(v2).toContain('v2');
  });
});

// ---------------------------------------------------------------------------
// checkIdempotency
// ---------------------------------------------------------------------------

describe('checkIdempotency', () => {
  it('findet bestehende Rechnung', async () => {
    const mock = createMockSupabase();
    mock._chain.maybeSingle.mockResolvedValueOnce({
      data: { id: 'inv-existing-123' },
      error: null,
    });

    const result = await checkIdempotency(mock as any, 'inv_c1_2026-06_entlastung_v1');

    expect(result.exists).toBe(true);
    expect(result.invoiceId).toBe('inv-existing-123');
    expect(mock.from).toHaveBeenCalledWith('invoices');
  });

  it('meldet keine existierende Rechnung', async () => {
    const mock = createMockSupabase();
    mock._chain.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const result = await checkIdempotency(mock as any, 'inv_c1_2026-06_entlastung_v1');

    expect(result.exists).toBe(false);
    expect(result.invoiceId).toBeUndefined();
  });

  it('wirft bei Supabase-Fehler', async () => {
    const mock = createMockSupabase();
    mock._chain.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'Connection refused' },
    });

    await expect(
      checkIdempotency(mock as any, 'inv_c1_2026-06_entlastung_v1'),
    ).rejects.toThrow('Idempotenz-Prüfung fehlgeschlagen');
  });
});

// ---------------------------------------------------------------------------
// computeChecksum (Audit)
// ---------------------------------------------------------------------------

describe('computeChecksum', () => {
  it('erzeugt konsistente Hashes', async () => {
    const input = {
      entityType: 'invoice',
      entityId: 'inv-1',
      action: 'created',
      previousState: null,
      newState: { status: 'entwurf' },
      actorId: 'user-1',
      createdAt: '2026-06-10T10:00:00.000Z',
    };

    const hash1 = await computeChecksum(input);
    const hash2 = await computeChecksum(input);

    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('string');
    expect(hash1.length).toBe(64); // SHA-256 Hex = 64 Zeichen
  });

  it('unterscheidet verschiedene Inputs', async () => {
    const base = {
      entityType: 'invoice',
      entityId: 'inv-1',
      action: 'created',
      previousState: null,
      newState: { status: 'entwurf' },
      actorId: 'user-1',
      createdAt: '2026-06-10T10:00:00.000Z',
    };

    const hashA = await computeChecksum(base);
    const hashB = await computeChecksum({ ...base, entityId: 'inv-2' });
    const hashC = await computeChecksum({ ...base, action: 'frozen' });
    const hashD = await computeChecksum({
      ...base,
      createdAt: '2026-06-11T10:00:00.000Z',
    });

    expect(hashA).not.toBe(hashB);
    expect(hashA).not.toBe(hashC);
    expect(hashA).not.toBe(hashD);
  });
});

// ---------------------------------------------------------------------------
// computeSnapshotChecksum
// ---------------------------------------------------------------------------

describe('computeSnapshotChecksum', () => {
  it('produziert einen Hex-String', async () => {
    const snapshot = {
      invoice: { id: 'inv-1', total_amount: 100 },
      items: [{ id: 'item-1', amount: 50 }],
      frozen_at: '2026-06-10T12:00:00.000Z',
    };

    const checksum = await computeSnapshotChecksum(snapshot);

    expect(typeof checksum).toBe('string');
    expect(checksum.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(checksum)).toBe(true);
  });

  it('gleicher Input ergibt gleichen Hash', async () => {
    const snapshot = { data: 'test', version: 1 };
    const a = await computeSnapshotChecksum(snapshot);
    const b = await computeSnapshotChecksum(snapshot);
    expect(a).toBe(b);
  });

  it('verschiedener Input ergibt verschiedenen Hash', async () => {
    const a = await computeSnapshotChecksum({ data: 'test', version: 1 });
    const b = await computeSnapshotChecksum({ data: 'test', version: 2 });
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Typ-Pruefungen (Compile-Time-Validierung)
// ---------------------------------------------------------------------------

describe('Invoice Engine Typ-Exporte', () => {
  it('CreateDraftParams ist korrekt typisiert', () => {
    const params: CreateDraftParams = {
      clientId: 'c1',
      periodMonth: '2026-06',
      budgetType: 'entlastung',
      actorId: 'user-1',
    };
    expect(params.clientId).toBe('c1');
    expect(params.periodMonth).toBe('2026-06');
  });

  it('CorrectionLineInput ist korrekt typisiert', () => {
    const line: CorrectionLineInput = {
      leistungsart: 'alltagsbegleitung',
      leistungsdatum: '2026-06-10',
      menge: 2,
      einheit: 'stunde',
      einzelpreisCent: 3500,
      gesamtpreisCent: 7000,
    };
    expect(line.menge).toBe(2);
    expect(line.gesamtpreisCent).toBe(7000);
  });

  it('CreateDraftResult hat alle erwarteten Felder', () => {
    const result: CreateDraftResult = {
      invoiceId: 'inv-1',
      invoiceNumber: 'RE-2026-00001',
      totalAmountCents: 10000,
      lineCount: 3,
      alreadyExists: false,
    };
    expect(result.alreadyExists).toBe(false);
    expect(result.lineCount).toBe(3);
  });

  it('FreezeResult hat alle erwarteten Felder', () => {
    const result: FreezeResult = {
      snapshotId: 'snap-1',
      invoiceNumber: 'RE-2026-00001',
      checksum: 'abc123',
      version: 1,
    };
    expect(result.version).toBe(1);
  });

  it('CorrectionResult hat alle erwarteten Felder', () => {
    const result: CorrectionResult = {
      correctionId: 'corr-1',
      correctionInvoiceId: 'inv-2',
      correctionInvoiceNumber: 'KR-2026-00001',
      differenceCents: -5000,
    };
    expect(result.differenceCents).toBe(-5000);
  });

  it('CreditNoteResult hat alle erwarteten Felder', () => {
    const result: CreditNoteResult = {
      correctionId: 'corr-1',
      creditInvoiceId: 'inv-3',
      creditInvoiceNumber: 'GS-2026-00001',
      amountCents: 5000,
    };
    expect(result.amountCents).toBe(5000);
  });
});
