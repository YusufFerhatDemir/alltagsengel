// ═══════════════════════════════════════════════════════════════════
// Fix 2: OPOS — invoices.due_date wird automatisch gesetzt
// ═══════════════════════════════════════════════════════════════════
// Live-Befund vom 13.08.2026: ALLE Rechnungen hatten due_date = NULL.
// Ohne Fälligkeit fällt die zahlungszielbasierte Auswertung aus:
// OPOS-Altersklassen leer, Mahnwesen rechnet ab "heute", die
// Fälligkeits-Workflows finden nie etwas.
//
// Standard-Zahlungsziel: 14 Tage ab Rechnungsdatum. Eine Konfiguration je
// Organisation oder Klient existiert im Schema nicht — was es gibt, ist
// invoices.payment_terms_days je Rechnung; dieser Wert hat Vorrang.
// ═══════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  ZAHLUNGSZIEL_STANDARD_TAGE,
  berechneFaelligkeit,
  zahlungszielFelder,
} from '@/lib/billing/core/zahlungsziel'
import { setzeFaelligkeitFallsLeer } from '@/lib/billing/core/invoice-engine'

describe('Standard-Zahlungsziel', () => {
  it('beträgt 14 Tage', () => {
    expect(ZAHLUNGSZIEL_STANDARD_TAGE).toBe(14)
  })
})

describe('berechneFaelligkeit', () => {
  it('rechnet 14 Tage auf das Rechnungsdatum', () => {
    expect(berechneFaelligkeit('2026-08-13')).toBe('2026-08-27')
  })

  it('rechnet über den Monatswechsel hinweg', () => {
    expect(berechneFaelligkeit('2026-08-25')).toBe('2026-09-08')
  })

  it('rechnet über den Jahreswechsel hinweg', () => {
    expect(berechneFaelligkeit('2026-12-24')).toBe('2027-01-07')
  })

  it('rechnet über den Schaltjahr-Februar', () => {
    expect(berechneFaelligkeit('2028-02-20')).toBe('2028-03-05')
  })

  it('respektiert ein abweichendes Zahlungsziel', () => {
    expect(berechneFaelligkeit('2026-08-13', 30)).toBe('2026-09-12')
    expect(berechneFaelligkeit('2026-08-13', 0)).toBe('2026-08-13')
  })

  it('akzeptiert einen ISO-Zeitstempel als Rechnungsdatum', () => {
    expect(berechneFaelligkeit('2026-08-13T22:40:00+02:00')).toBe('2026-08-27')
  })

  it('akzeptiert ein Date-Objekt', () => {
    expect(berechneFaelligkeit(new Date('2026-08-13T12:00:00Z'))).toBe('2026-08-27')
  })

  it('fällt bei unlesbarem Datum auf heute zurück, statt leer zu bleiben', () => {
    const ergebnis = berechneFaelligkeit('kein-datum')
    expect(ergebnis).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('fällt bei unsinnigem Zahlungsziel auf 14 Tage zurück', () => {
    expect(berechneFaelligkeit('2026-08-13', Number.NaN)).toBe('2026-08-27')
    expect(berechneFaelligkeit('2026-08-13', -5)).toBe('2026-08-27')
  })
})

describe('zahlungszielFelder — Ziel und Fälligkeit bleiben konsistent', () => {
  it('liefert beide Felder passend zueinander', () => {
    expect(zahlungszielFelder('2026-08-13')).toEqual({
      payment_terms_days: 14,
      due_date: '2026-08-27',
    })
  })

  it('übernimmt ein abweichendes Zahlungsziel in BEIDE Felder', () => {
    expect(zahlungszielFelder('2026-08-13', 30)).toEqual({
      payment_terms_days: 30,
      due_date: '2026-09-12',
    })
  })

  it('fällt bei null/undefined auf den Standard zurück', () => {
    expect(zahlungszielFelder('2026-08-13', null as unknown as number)).toEqual({
      payment_terms_days: 14,
      due_date: '2026-08-27',
    })
    expect(zahlungszielFelder('2026-08-13', undefined)).toEqual({
      payment_terms_days: 14,
      due_date: '2026-08-27',
    })
  })
})

// ── setzeFaelligkeitFallsLeer (Nachlauf zum RPC-Pfad) ────────────────

function mockSupabase(invoice: Record<string, unknown> | null) {
  const update = vi.fn().mockReturnValue({
    eq: () => ({ is: () => Promise.resolve({ error: null }) }),
  })
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: invoice, error: null }) }),
      }),
      update,
    }),
  }
  return { client, update }
}

describe('setzeFaelligkeitFallsLeer', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('setzt due_date aus created_at + payment_terms_days', async () => {
    const { client, update } = mockSupabase({
      id: 'inv-1',
      due_date: null,
      payment_terms_days: 14,
      created_at: '2026-08-13T20:20:13.667+00:00',
    })

    const ergebnis = await setzeFaelligkeitFallsLeer(client as never, 'inv-1')

    expect(ergebnis).toBe('2026-08-27')
    expect(update).toHaveBeenCalledWith({ payment_terms_days: 14, due_date: '2026-08-27' })
  })

  it('nutzt das je Rechnung gespeicherte Zahlungsziel, nicht den Standard', async () => {
    const { client, update } = mockSupabase({
      id: 'inv-2',
      due_date: null,
      payment_terms_days: 30,
      created_at: '2026-07-02T20:20:13.667+00:00',
    })

    const ergebnis = await setzeFaelligkeitFallsLeer(client as never, 'inv-2')

    expect(ergebnis).toBe('2026-08-01')
    expect(update).toHaveBeenCalledWith({ payment_terms_days: 30, due_date: '2026-08-01' })
  })

  it('überschreibt eine bereits gesetzte Fälligkeit NICHT (Idempotenz)', async () => {
    const { client, update } = mockSupabase({
      id: 'inv-3',
      due_date: '2026-09-30',
      payment_terms_days: 14,
      created_at: '2026-08-13T20:20:13.667+00:00',
    })

    const ergebnis = await setzeFaelligkeitFallsLeer(client as never, 'inv-3')

    expect(ergebnis).toBe('2026-09-30')
    expect(update).not.toHaveBeenCalled()
  })

  it('wirft nicht, wenn die Rechnung nicht ladbar ist', async () => {
    const { client, update } = mockSupabase(null)

    await expect(setzeFaelligkeitFallsLeer(client as never, 'inv-4')).resolves.toBeNull()
    expect(update).not.toHaveBeenCalled()
  })
})

// ── Schreibpfade in der invoice-engine ───────────────────────────────

describe('invoice-engine setzt die Fälligkeit auf allen Wegen', () => {
  const engine = readFileSync(
    join(process.cwd(), 'lib/billing/core/invoice-engine.ts'),
    'utf8',
  )

  it('zieht die Fälligkeit nach dem RPC-Entwurf nach', () => {
    expect(engine).toContain('setzeFaelligkeitFallsLeer(supabase, rpcResult.invoice_id)')
  })

  it('setzt sie bei Storno, Korrektur und Gutschrift mit', () => {
    const treffer = engine.match(/zahlungszielFelder\(null, original\.payment_terms_days\)/g)
    expect(treffer?.length).toBe(3)
  })

  it('übernimmt dabei das Zahlungsziel der Ursprungsrechnung', () => {
    expect(engine).toContain('original.payment_terms_days')
  })
})

// ── DB-Seite ─────────────────────────────────────────────────────────

describe('Migration: due_date-Trigger und Backfill', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260901020000_invoice_due_date_default.sql'),
    'utf8',
  )

  it('setzt den Spalten-Default auf dasselbe Zahlungsziel wie die Anwendung', () => {
    expect(migration).toContain(
      `ALTER COLUMN payment_terms_days SET DEFAULT ${ZAHLUNGSZIEL_STANDARD_TAGE}`,
    )
  })

  it('greift nur beim INSERT (ein geleertes due_date bleibt leer)', () => {
    expect(migration).toContain('BEFORE INSERT ON public.invoices')
    expect(migration).not.toContain('BEFORE INSERT OR UPDATE ON public.invoices')
  })

  it('lässt eine ausdrücklich mitgegebene Fälligkeit unangetastet', () => {
    expect(migration).toContain('IF NEW.due_date IS NOT NULL THEN')
  })

  it('rechnet wie die Anwendung: Rechnungsdatum + Zahlungsziel', () => {
    expect(migration).toContain('COALESCE(NEW.created_at::date, current_date)')
    expect(migration).toContain('COALESCE(NEW.payment_terms_days, 14)')
  })

  it('füllt Bestandsrechnungen ohne Fälligkeit nach', () => {
    expect(migration).toContain('WHERE due_date IS NULL')
  })

  it('nutzt für den Backfill das gespeicherte Ziel der Altrechnung', () => {
    expect(migration).toContain('COALESCE(payment_terms_days, 14)')
  })

  it('hat ein Rollback-Skript', () => {
    const rollback = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260901020001_rollback_invoice_due_date_default.sql'),
      'utf8',
    )
    expect(rollback).toContain('DROP TRIGGER IF EXISTS trg_set_invoice_due_date')
    expect(rollback).toContain('ALTER COLUMN payment_terms_days SET DEFAULT 30')
  })
})
