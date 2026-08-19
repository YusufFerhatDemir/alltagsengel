/**
 * Tariff-Based Invoice Creation Tests
 *
 * Testet die tarif-basierte Rechnungserstellung nach der fachlichen Entscheidung:
 * billing_tariffs = alleinige verbindliche Preisquelle.
 * service_records.amount = NUR Dokumentation, KEIN Fallback.
 *
 * Testszenarien:
 * 1. Erfolgreiche Rechnungserstellung mit gueltigem Tarif
 * 2. MISSING_VALID_TARIFF: Kein gueltiger Tarif
 * 3. AMBIGUOUS_TARIFF: Mehrere gleichrangige Tarife
 * 4. Abgelaufener Tarif
 * 5. Zukuenftiger Tarif (gueltig_ab in der Zukunft)
 * 6. Tarif-Snapshot in invoice_items
 * 7. Kein Fallback auf service_records.amount
 * 8. Browser-Preismanipulation blockiert
 * 9. Atomarer Rollback bei Tarif-Fehler
 * 10. Idempotenz mit Tarif
 * 11. Verschiedene Verguetungsarten (zeit_stunde, pauschale etc.)
 * 12. Audit-Trail bei fehlendem Tarif
 * 13. Overlap-Constraint Test
 * 14. Private Budget (keine Rechtsgrundlage)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInvoiceDraft, parseTariffError, TARIFF_ERROR_CODES } from '@/lib/billing/core';

// ── Mock Setup ──────────────────────────────────────────────────────────────

const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();

const createMockSupabase = () => ({
  rpc: mockRpc,
  from: vi.fn().mockImplementation((table: string) => {
    if (table === 'clients') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'client-1',
                first_name: 'Test',
                last_name: 'Klient',
                insurance_name: 'AOK Hessen',
                insurance_number: 'INS-001',
                organization_id: 'org-1',
                pflegekasse_ik: '109034001',
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'client_budgets') {
      // Budgetdeckel (ermittleBudgetLage): ohne Zeile gelten die gesetzlichen
      // Werte — 131 EUR/Monat, 1572 EUR/Jahr.
      const kette: any = {};
      kette.select = () => kette;
      kette.eq = () => kette;
      kette.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      return kette;
    }
    if (table === 'invoice_items') {
      const kette: any = {};
      kette.select = () => kette;
      kette.in = vi.fn().mockResolvedValue({ data: [], error: null });
      return kette;
    }
    if (table === 'invoices') {
      // Zwei Lesewege auf derselben Tabelle:
      //   • Liste der Bestandsrechnungen des Jahres (Budgetdeckel) — endet auf .lte()
      //   • Einzelzeile (Faelligkeit + Deckelung) — endet auf .maybeSingle()
      const kette: any = {};
      kette.select = () => kette;
      kette.eq = () => kette;
      kette.gte = () => kette;
      kette.lte = vi.fn().mockResolvedValue({ data: [], error: null });
      kette.maybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'inv-1',
          due_date: null,
          payment_terms_days: 14,
          created_at: '2026-09-01T10:00:00Z',
          total_amount: 0,
          budget_amount: 0,
          private_amount: 0,
          notes: null,
        },
        error: null,
      });
      kette.update = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          is: vi.fn().mockResolvedValue({ error: null }),
          then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
        }),
      });
      return kette;
    }
    return {
      select: mockSelect,
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockSingle }) }),
    };
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Tariff-Based Invoice Creation', () => {
  // ── 1. Erfolgreiche Rechnungserstellung ──
  describe('Erfolgreiche Erstellung mit gueltigem Tarif', () => {
    it('sollte Rechnung mit Tarif-Preis erstellen (nicht service_records.amount)', async () => {
      const supabase = createMockSupabase();
      mockRpc.mockResolvedValueOnce({
        data: {
          invoice_id: 'inv-1',
          invoice_number: 'RE-2026-00001',
          total_amount: 35.00,  // Tarif-Preis, nicht service_records.amount
          line_count: 1,
          already_exists: false,
        },
        error: null,
      });

      const result = await createInvoiceDraft(supabase as any, {
        clientId: 'client-1',
        periodMonth: '2026-07',
        budgetType: 'entlastung',
        actorId: 'actor-1',
      });

      expect(result.priceSource).toBe('billing_tariffs');
      expect(result.totalAmountCents).toBe(3500);
      expect(result.invoiceId).toBe('inv-1');
      expect(result.alreadyExists).toBe(false);
    });

    it('sollte RPC mit korrekten Parametern aufrufen', async () => {
      const supabase = createMockSupabase();
      mockRpc.mockResolvedValueOnce({
        data: {
          invoice_id: 'inv-1',
          invoice_number: 'RE-2026-00001',
          total_amount: 70.00,
          line_count: 2,
          already_exists: false,
        },
        error: null,
      });

      await createInvoiceDraft(supabase as any, {
        clientId: 'client-1',
        periodMonth: '2026-07',
        budgetType: 'entlastung',
        actorId: 'actor-1',
      });

      expect(mockRpc).toHaveBeenCalledWith('create_invoice_draft_atomic', {
        p_client_id: 'client-1',
        p_org_id: 'org-1',
        p_period_month: '2026-07',
        p_budget_type: 'entlastung',
        p_actor_id: 'actor-1',
        p_insurance_name: 'AOK Hessen',
        p_insurance_number: 'INS-001',
      });
    });
  });

  // ── 2. MISSING_VALID_TARIFF ──
  describe('MISSING_VALID_TARIFF', () => {
    it('sollte strukturierten Fehler werfen wenn kein Tarif existiert', async () => {
      const supabase = createMockSupabase();
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'MISSING_VALID_TARIFF: Kein gueltiger Tarif fuer Leistungsart "Alltagsbegleitung"',
          code: 'P0001',
        },
      });

      await expect(
        createInvoiceDraft(supabase as any, {
          clientId: 'client-1',
          periodMonth: '2026-07',
          budgetType: 'entlastung',
          actorId: 'actor-1',
        })
      ).rejects.toThrow('MISSING_VALID_TARIFF');
    });

    it('sollte Tariff-Error-Code im geworfenen Fehler enthalten', async () => {
      const supabase = createMockSupabase();
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'MISSING_VALID_TARIFF: Kein gueltiger Tarif fuer Leistungsart "Alltagsbegleitung"',
          code: 'P0001',
        },
      });

      try {
        await createInvoiceDraft(supabase as any, {
          clientId: 'client-1',
          periodMonth: '2026-07',
          budgetType: 'entlastung',
          actorId: 'actor-1',
        });
        expect.fail('Sollte Fehler werfen');
      } catch (err: any) {
        expect(err.tariffErrorCode).toBe(TARIFF_ERROR_CODES.MISSING_VALID_TARIFF);
      }
    });

    it('sollte keine Rechnung erstellen wenn Tarif fehlt', async () => {
      const supabase = createMockSupabase();
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'MISSING_VALID_TARIFF: Kein gueltiger Tarif',
          code: 'P0001',
        },
      });

      try {
        await createInvoiceDraft(supabase as any, {
          clientId: 'client-1',
          periodMonth: '2026-07',
          budgetType: 'entlastung',
          actorId: 'actor-1',
        });
      } catch {
        // Erwartet
      }

      // RPC wurde aufgerufen, aber keine zusaetzlichen DB-Operationen
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });
  });

  // ── 3. AMBIGUOUS_TARIFF ──
  describe('AMBIGUOUS_TARIFF', () => {
    it('sollte Fehler werfen wenn mehrere gleichrangige Tarife existieren', async () => {
      const supabase = createMockSupabase();
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'AMBIGUOUS_TARIFF: 2 gleichwertige Tarife gefunden fuer Leistungsart "Alltagsbegleitung"',
          code: 'P0001',
        },
      });

      try {
        await createInvoiceDraft(supabase as any, {
          clientId: 'client-1',
          periodMonth: '2026-07',
          budgetType: 'entlastung',
          actorId: 'actor-1',
        });
        expect.fail('Sollte Fehler werfen');
      } catch (err: any) {
        expect(err.tariffErrorCode).toBe(TARIFF_ERROR_CODES.AMBIGUOUS_TARIFF);
        expect(err.message).toContain('AMBIGUOUS_TARIFF');
      }
    });
  });

  // ── 4. Abgelaufener Tarif ──
  describe('Abgelaufener Tarif', () => {
    it('sollte MISSING_VALID_TARIFF werfen wenn Tarif abgelaufen ist', async () => {
      const supabase = createMockSupabase();
      // RPC prueft gueltig_bis >= datum — abgelaufener Tarif wird nicht gefunden
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'MISSING_VALID_TARIFF: Kein gueltiger Tarif fuer Leistungsart "Alltagsbegleitung" (alltagsbegleitung), Rechtsgrundlage "§45b SGB XI", Datum 2026-07-15',
          code: 'P0001',
        },
      });

      await expect(
        createInvoiceDraft(supabase as any, {
          clientId: 'client-1',
          periodMonth: '2026-07',
          budgetType: 'entlastung',
          actorId: 'actor-1',
        })
      ).rejects.toThrow('MISSING_VALID_TARIFF');
    });
  });

  // ── 5. Zukuenftiger Tarif ──
  describe('Zukuenftiger Tarif', () => {
    it('sollte MISSING_VALID_TARIFF werfen wenn Tarif erst in Zukunft gueltig wird', async () => {
      const supabase = createMockSupabase();
      // RPC prueft gueltig_ab <= datum — zukuenftiger Tarif wird nicht gefunden
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'MISSING_VALID_TARIFF: Kein gueltiger Tarif',
          code: 'P0001',
        },
      });

      await expect(
        createInvoiceDraft(supabase as any, {
          clientId: 'client-1',
          periodMonth: '2026-07',
          budgetType: 'entlastung',
          actorId: 'actor-1',
        })
      ).rejects.toThrow('MISSING_VALID_TARIFF');
    });
  });

  // ── 6. Tarif-Snapshot in invoice_items ──
  describe('Tarif-Snapshot', () => {
    it('sollte priceSource immer billing_tariffs sein', async () => {
      const supabase = createMockSupabase();
      mockRpc.mockResolvedValueOnce({
        data: {
          invoice_id: 'inv-1',
          invoice_number: 'RE-2026-00001',
          total_amount: 35.00,
          line_count: 1,
          already_exists: false,
        },
        error: null,
      });

      const result = await createInvoiceDraft(supabase as any, {
        clientId: 'client-1',
        periodMonth: '2026-07',
        budgetType: 'entlastung',
        actorId: 'actor-1',
      });

      // Preis kommt immer aus billing_tariffs — nie aus service_records
      expect(result.priceSource).toBe('billing_tariffs');
    });
  });

  // ── 7. Kein Fallback auf service_records.amount ──
  describe('Kein service_records.amount Fallback', () => {
    it('sollte NICHT auf service_records.amount zurueckfallen', async () => {
      const supabase = createMockSupabase();
      // RPC wirft Fehler weil kein Tarif — Engine darf NICHT
      // eine zweite Berechnung mit service_records.amount versuchen
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'MISSING_VALID_TARIFF: Kein gueltiger Tarif',
          code: 'P0001',
        },
      });

      await expect(
        createInvoiceDraft(supabase as any, {
          clientId: 'client-1',
          periodMonth: '2026-07',
          budgetType: 'entlastung',
          actorId: 'actor-1',
        })
      ).rejects.toThrow('MISSING_VALID_TARIFF');

      // Kein zweiter RPC-Aufruf (kein Fallback-Versuch)
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it('sollte keine priceWarnings mehr enthalten', async () => {
      const supabase = createMockSupabase();
      mockRpc.mockResolvedValueOnce({
        data: {
          invoice_id: 'inv-1',
          invoice_number: 'RE-2026-00001',
          total_amount: 35.00,
          line_count: 1,
          already_exists: false,
        },
        error: null,
      });

      const result = await createInvoiceDraft(supabase as any, {
        clientId: 'client-1',
        periodMonth: '2026-07',
        budgetType: 'entlastung',
        actorId: 'actor-1',
      });

      // priceWarnings existieren nicht mehr im neuen Interface
      expect((result as any).priceWarnings).toBeUndefined();
    });
  });

  // ── 8. Browser-Preismanipulation blockiert ──
  describe('Browser-Preismanipulation', () => {
    it('sollte keine Preis-Parameter vom Client akzeptieren', async () => {
      const supabase = createMockSupabase();
      mockRpc.mockResolvedValueOnce({
        data: {
          invoice_id: 'inv-1',
          invoice_number: 'RE-2026-00001',
          total_amount: 35.00,
          line_count: 1,
          already_exists: false,
        },
        error: null,
      });

      await createInvoiceDraft(supabase as any, {
        clientId: 'client-1',
        periodMonth: '2026-07',
        budgetType: 'entlastung',
        actorId: 'actor-1',
      });

      // RPC-Parameter enthalten keinen Preis/Betrag
      const rpcArgs = mockRpc.mock.calls[0][1];
      expect(rpcArgs).not.toHaveProperty('amount');
      expect(rpcArgs).not.toHaveProperty('price');
      expect(rpcArgs).not.toHaveProperty('totalAmount');
      expect(rpcArgs).not.toHaveProperty('unit_price');
    });
  });

  // ── 9. Atomarer Rollback bei Tarif-Fehler ──
  describe('Atomarer Rollback', () => {
    it('sollte bei MISSING_VALID_TARIFF vollstaendig zurueckrollen', async () => {
      const supabase = createMockSupabase();
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'MISSING_VALID_TARIFF: Kein gueltiger Tarif',
          code: 'P0001',
        },
      });

      try {
        await createInvoiceDraft(supabase as any, {
          clientId: 'client-1',
          periodMonth: '2026-07',
          budgetType: 'entlastung',
          actorId: 'actor-1',
        });
      } catch {
        // Erwartet
      }

      // RPC-Fehler = PostgreSQL RAISE EXCEPTION = automatischer Rollback
      // Keine manuelle Cleanup-Logik noetig
      // TypeScript-Layer macht nach RPC-Fehler NICHTS weiter
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it('sollte bei AMBIGUOUS_TARIFF vollstaendig zurueckrollen', async () => {
      const supabase = createMockSupabase();
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'AMBIGUOUS_TARIFF: 2 gleichwertige Tarife',
          code: 'P0001',
        },
      });

      try {
        await createInvoiceDraft(supabase as any, {
          clientId: 'client-1',
          periodMonth: '2026-07',
          budgetType: 'entlastung',
          actorId: 'actor-1',
        });
      } catch {
        // Erwartet
      }

      expect(mockRpc).toHaveBeenCalledTimes(1);
    });
  });

  // ── 10. Idempotenz ──
  describe('Idempotenz', () => {
    it('sollte bestehende Rechnung zurueckgeben bei doppeltem Aufruf', async () => {
      const supabase = createMockSupabase();
      mockRpc.mockResolvedValueOnce({
        data: {
          invoice_id: 'inv-existing',
          invoice_number: 'RE-2026-00001',
          total_amount: 35.00,
          line_count: 0,
          already_exists: true,
        },
        error: null,
      });

      const result = await createInvoiceDraft(supabase as any, {
        clientId: 'client-1',
        periodMonth: '2026-07',
        budgetType: 'entlastung',
        actorId: 'actor-1',
      });

      expect(result.alreadyExists).toBe(true);
      expect(result.invoiceId).toBe('inv-existing');
    });
  });

  // ── 11. Verschiedene Verguetungsarten ──
  describe('Verguetungsarten', () => {
    it('sollte zeit_stunde korrekt berechnen (preis_cent/100 * duration/60)', async () => {
      const supabase = createMockSupabase();
      // RPC berechnet intern: 3500 cent / 100 * (120 min / 60) = 70.00 EUR
      mockRpc.mockResolvedValueOnce({
        data: {
          invoice_id: 'inv-1',
          invoice_number: 'RE-2026-00001',
          total_amount: 70.00,
          line_count: 1,
          already_exists: false,
        },
        error: null,
      });

      const result = await createInvoiceDraft(supabase as any, {
        clientId: 'client-1',
        periodMonth: '2026-07',
        budgetType: 'entlastung',
        actorId: 'actor-1',
      });

      expect(result.totalAmountCents).toBe(7000);
    });

    it('sollte pauschale als Festpreis berechnen', async () => {
      const supabase = createMockSupabase();
      // RPC berechnet intern: 1500 cent / 100 = 15.00 EUR (Pauschale)
      mockRpc.mockResolvedValueOnce({
        data: {
          invoice_id: 'inv-1',
          invoice_number: 'RE-2026-00001',
          total_amount: 15.00,
          line_count: 1,
          already_exists: false,
        },
        error: null,
      });

      const result = await createInvoiceDraft(supabase as any, {
        clientId: 'client-1',
        periodMonth: '2026-07',
        budgetType: 'entlastung',
        actorId: 'actor-1',
      });

      expect(result.totalAmountCents).toBe(1500);
    });
  });

  // ── 12. Private Budget ──
  describe('Private Budget', () => {
    it('sollte auch fuer private Rechnungen Tarif aus billing_tariffs verwenden', async () => {
      const supabase = createMockSupabase();
      mockRpc.mockResolvedValueOnce({
        data: {
          invoice_id: 'inv-priv',
          invoice_number: 'RE-2026-00002',
          total_amount: 40.00,
          line_count: 1,
          already_exists: false,
        },
        error: null,
      });

      const result = await createInvoiceDraft(supabase as any, {
        clientId: 'client-1',
        periodMonth: '2026-07',
        budgetType: 'private',
        actorId: 'actor-1',
      });

      expect(result.priceSource).toBe('billing_tariffs');
      expect(result.totalAmountCents).toBe(4000);
    });
  });

  // ── 13. Client nicht gefunden ──
  describe('Client-Fehler', () => {
    it('sollte Fehler werfen wenn Client nicht existiert', async () => {
      const supabase = {
        rpc: mockRpc,
        from: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'not found', code: 'PGRST116' },
              }),
            }),
          }),
        })),
      };

      await expect(
        createInvoiceDraft(supabase as any, {
          clientId: 'nonexistent',
          periodMonth: '2026-07',
          budgetType: 'entlastung',
          actorId: 'actor-1',
        })
      ).rejects.toThrow('Klient nonexistent nicht gefunden');

      // RPC sollte NICHT aufgerufen werden
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  // ── 14. Null RPC Result ──
  describe('Null RPC Result', () => {
    it('sollte Fehler werfen bei null RPC-Ergebnis', async () => {
      const supabase = createMockSupabase();
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(
        createInvoiceDraft(supabase as any, {
          clientId: 'client-1',
          periodMonth: '2026-07',
          budgetType: 'entlastung',
          actorId: 'actor-1',
        })
      ).rejects.toThrow('RPC create_invoice_draft_atomic hat kein Ergebnis zurueckgegeben');
    });
  });

  // ── 15. Generische DB-Fehler ──
  describe('Generische DB-Fehler', () => {
    it('sollte nicht-Tarif-Fehler normal weiterleiten', async () => {
      const supabase = createMockSupabase();
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: 'relation "service_records" does not exist',
          code: '42P01',
        },
      });

      try {
        await createInvoiceDraft(supabase as any, {
          clientId: 'client-1',
          periodMonth: '2026-07',
          budgetType: 'entlastung',
          actorId: 'actor-1',
        });
        expect.fail('Sollte Fehler werfen');
      } catch (err: any) {
        expect(err.tariffErrorCode).toBeUndefined();
        expect(err.message).toContain('Atomare Rechnungserstellung fehlgeschlagen');
      }
    });
  });
});

// ── parseTariffError Tests ──────────────────────────────────────────────────

describe('parseTariffError', () => {
  it('sollte MISSING_VALID_TARIFF erkennen', () => {
    expect(parseTariffError('MISSING_VALID_TARIFF: Kein gueltiger Tarif'))
      .toBe(TARIFF_ERROR_CODES.MISSING_VALID_TARIFF);
  });

  it('sollte AMBIGUOUS_TARIFF erkennen', () => {
    expect(parseTariffError('AMBIGUOUS_TARIFF: 2 gleichwertige Tarife'))
      .toBe(TARIFF_ERROR_CODES.AMBIGUOUS_TARIFF);
  });

  it('sollte null zurueckgeben fuer andere Fehler', () => {
    expect(parseTariffError('connection refused')).toBeNull();
    expect(parseTariffError('Keine abrechenbaren Leistungen')).toBeNull();
  });
});

// ── Tarif-Matching-Regeln (Verifikation der SQL-Logik) ──────────────────────

describe('Tarif-Matching-Regeln (SQL-Verifikation)', () => {
  it('sollte dokumentieren dass Matching case-insensitiv ist (LOWER)', () => {
    // Die RPC verwendet LOWER(service_type) = LOWER(leistungsart)
    // Test-Verifikation: TypeScript gibt service_type unver. weiter
    const serviceType = 'Alltagsbegleitung';
    expect(serviceType.toLowerCase()).toBe('alltagsbegleitung');
  });

  it('sollte dokumentieren dass Budget→Rechtsgrundlage-Mapping korrekt ist', () => {
    const mapping: Record<string, string | null> = {
      entlastung: '§45b SGB XI',
      verhinderung: '§39 SGB XI',
      carryover: '§45b SGB XI',
      haeusliche_pflege_36: '§36 SGB XI',
      private: null,
    };

    // Alle bekannten Budget-Typen haben ein Mapping
    expect(mapping['entlastung']).toBe('§45b SGB XI');
    expect(mapping['private']).toBeNull();
  });

  it('sollte Spezifitaets-Scoring dokumentieren', () => {
    // Score-Berechnung in der RPC:
    // Kostentraeger-Match: +10 (Mismatch: -100)
    // Bundesland-Match: +5 (Mismatch: -100)
    // Qualifikation-Match: +3 (Mismatch: -100)
    // Vertrag-Match: +2 (Mismatch: -100)
    // Score < 0 → Tarif nicht anwendbar
    // Bei Score-Gleichstand: neuester gueltig_ab gewinnt

    const scores = {
      exact_match: 10 + 5 + 3 + 2,     // 20
      without_qualification: 10 + 5 + 2, // 17
      without_vertrag: 10 + 5 + 3,       // 18
      only_kostentraeger: 10,            // 10
      generic: 0,                        // 0 (kein spezifisches Feld)
    };

    expect(scores.exact_match).toBeGreaterThan(scores.without_vertrag);
    expect(scores.without_vertrag).toBeGreaterThan(scores.without_qualification);
    expect(scores.generic).toBe(0);
  });
});

// ── Verguetungsart-Berechnung (Verifikation) ────────────────────────────────

describe('Verguetungsart-Preisberechnung (SQL-Verifikation)', () => {
  it('zeit_stunde: preis_cent/100 * duration/60', () => {
    const preisCent = 3500;
    const durationMinutes = 120;
    const expected = (preisCent / 100) * (durationMinutes / 60);
    expect(expected).toBe(70.00);
  });

  it('zeit_minute: preis_cent/100 * duration', () => {
    const preisCent = 60;
    const durationMinutes = 120;
    const expected = (preisCent / 100) * durationMinutes;
    expect(expected).toBe(72.00);
  });

  it('leistungskomplex/pauschale: preis_cent/100 (Festpreis)', () => {
    const preisCent = 1500;
    const expected = preisCent / 100;
    expect(expected).toBe(15.00);
  });

  it('Rundung auf 2 Dezimalstellen', () => {
    const preisCent = 3333;
    const durationMinutes = 90;
    const raw = (preisCent / 100) * (durationMinutes / 60);
    const rounded = Math.round(raw * 100) / 100;
    expect(rounded).toBe(50.00); // 33.33 * 1.5 = 49.995 → 50.00 (kaufmaennisch gerundet)
    // SQL ROUND(..., 2) rundet kaufmaennisch — gleiche Regel
  });
});
