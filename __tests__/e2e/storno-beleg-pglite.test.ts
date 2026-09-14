/**
 * Kein Storno ohne Beleg — gegen echtes Postgres
 * ═══════════════════════════════════════════════════════════════════════
 *
 * BEFUND (Block 98) — Begruendung siehe
 * __tests__/billing/snapshot-beleg.test.ts.
 *
 * Dort wird der Schreibweg selbst geprueft und die Quelle der vier
 * Aufrufstellen. Was dort NICHT geprueft werden kann, ist die Folge: was
 * in den Buechern steht, wenn der Beleg ausbleibt. Genau das ist der
 * Punkt — vorher blieb eine Stornorechnung stehen UND das Original wurde
 * storniert, ohne dass irgendwo belegt war, was storniert wurde.
 *
 * Gefahren wird deshalb `cancelInvoice()` selbst gegen ein echtes
 * Postgres mit den Tabellen wortgleich aus den Migrationen. Ein Trigger
 * laesst den INSERT in `invoice_snapshots` scheitern; er steht fuer jede
 * Ursache, die die Zeile verhindert — der RESTRICTIVE org_fence, der
 * snapshot_type-CHECK, unique_invoice_version, ein Ausfall.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import type { SupabaseClient } from '@supabase/supabase-js'

import { baueKettenSchema, STAMM_ORG } from './helpers/kette-schema'
import { macheSupabaseClient } from './helpers/pglite-supabase'
import { cancelInvoice } from '@/lib/billing/core/invoice-engine'

const ORG = STAMM_ORG
const KLIENT = '00000000-0000-4000-8000-00000000f001'
const ACTOR = '00000000-0000-4000-8000-00000000f002'

let db: PGlite
let supabase: SupabaseClient

async function zahl(sql: string): Promise<number> {
  const r = await db.query<{ n: number }>(sql)
  return r.rows[0]?.n ?? 0
}

/** Legt eine festgeschriebene Rechnung an und gibt ihre ID zurueck. */
let nr = 0
async function rechnung(): Promise<string> {
  nr++
  const r = await db.query<{ id: string }>(`
    INSERT INTO public.invoices
      (invoice_number, invoice_number_formatted, client_id, period_start, period_end,
       total_amount, status, version, frozen_at, organization_id)
    VALUES ('RE-B98-${nr}', 'RE-B98-${nr}', '${KLIENT}', '2026-08-01', '2026-08-31',
            120.00, 'sent', 1, now(), '${ORG}')
    RETURNING id`)
  return r.rows[0].id
}

async function mitBelegsperre(lauf: () => Promise<void>): Promise<void> {
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.test_sperre_beleg() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Belegsperre'; END $$;
    CREATE TRIGGER trg_test_beleg BEFORE INSERT ON public.invoice_snapshots
      FOR EACH ROW EXECUTE FUNCTION public.test_sperre_beleg();
  `)
  try { await lauf() } finally {
    await db.exec('DROP TRIGGER IF EXISTS trg_test_beleg ON public.invoice_snapshots;')
  }
}

beforeAll(async () => {
  db = await baueKettenSchema()
  supabase = macheSupabaseClient(db) as unknown as SupabaseClient
  await db.exec(`
    INSERT INTO public.organizations (id, name, bundesland, status)
    VALUES ('${ORG}', 'Alltagsengel', 'hessen', 'active')
    ON CONFLICT (id) DO NOTHING;

    -- invoice_snapshots.created_by traegt einen Fremdschluessel auf
    -- auth.users. Beim ersten Anlauf fehlte dieser Datensatz, und der
    -- Beleg scheiterte mit 23503 — genau die Art Abweisung, die der
    -- blinde INSERT vorher verschluckt hat.
    INSERT INTO auth.users (id, email) VALUES ('${ACTOR}', 'storno-actor@test.local')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.clients (id, organization_id, customer_number, first_name, last_name, zip_code)
    VALUES ('${KLIENT}', '${ORG}', 'B98-1', 'Erika', 'Mustermann', '60311');
  `)
}, 120000)

beforeEach(async () => {
  // Reihenfolge nach den Fremdschluesseln: invoice_corrections zeigt auf
  // beide Rechnungen, invoice_snapshots auf die Storno-Rechnung.
  await db.exec(`
    DELETE FROM public.invoice_snapshots;
    DELETE FROM public.invoice_corrections;
    DELETE FROM public.invoices;
  `)
})

describe('Ohne Beleg entsteht kein Storno', () => {
  it('cancelInvoice bricht ab, statt still weiterzulaufen', async () => {
    const id = await rechnung()
    await mitBelegsperre(async () => {
      await expect(cancelInvoice(supabase, id, 'Falscher Betrag', ACTOR, ORG))
        .rejects.toThrow(/Unveraenderlichkeits-Beleg/)
    })
  })

  it('die Stornorechnung wird zurueckgenommen', async () => {
    const id = await rechnung()
    await mitBelegsperre(async () => {
      await cancelInvoice(supabase, id, 'Falscher Betrag', ACTOR, ORG).catch(() => undefined)
    })
    // Vorher blieb sie stehen — eine Stornorechnung ohne Gegenstueck.
    expect(await zahl(`SELECT count(*)::int AS n FROM public.invoices WHERE correction_type = 'storno'`)).toBe(0)
    expect(await zahl(`SELECT count(*)::int AS n FROM public.invoices`)).toBe(1)
  })

  it('das Original bleibt unstorniert', async () => {
    const id = await rechnung()
    await mitBelegsperre(async () => {
      await cancelInvoice(supabase, id, 'Falscher Betrag', ACTOR, ORG).catch(() => undefined)
    })
    // Der gefaehrliche Ausgang war: Original 'storniert', aber kein
    // Beleg darueber, WAS storniert wurde.
    const r = await db.query<{ status: string }>(`SELECT status FROM public.invoices WHERE id = '${id}'`)
    expect(r.rows[0].status).toBe('sent')
  })

  it('und es bleibt keine Beleg-Zeile zurueck', async () => {
    const id = await rechnung()
    await mitBelegsperre(async () => {
      await cancelInvoice(supabase, id, 'Falscher Betrag', ACTOR, ORG).catch(() => undefined)
    })
    expect(await zahl('SELECT count(*)::int AS n FROM public.invoice_snapshots')).toBe(0)
  })
})

describe('Gegenprobe ohne Sperre', () => {
  it('der Storno laeuft durch und hinterlaesst genau einen Beleg', async () => {
    // Ohne diese Richtung waere ein cancelInvoice, das IMMER wirft,
    // ebenfalls gruen.
    const id = await rechnung()
    await cancelInvoice(supabase, id, 'Falscher Betrag', ACTOR, ORG)

    expect(await zahl(`SELECT count(*)::int AS n FROM public.invoices WHERE correction_type = 'storno'`)).toBe(1)
    const beleg = await db.query<{ snapshot_type: string; checksum: string }>(
      'SELECT snapshot_type, checksum FROM public.invoice_snapshots')
    expect(beleg.rows).toHaveLength(1)
    expect(beleg.rows[0].snapshot_type).toBe('storno')
    // Die Pruefsumme ist der Zweck der Zeile — leer waere sie wertlos.
    expect(beleg.rows[0].checksum.length).toBeGreaterThan(0)
  })

  it('und das Original steht danach auf storniert', async () => {
    const id = await rechnung()
    await cancelInvoice(supabase, id, 'Falscher Betrag', ACTOR, ORG)
    const r = await db.query<{ status: string }>(`SELECT status FROM public.invoices WHERE id = '${id}'`)
    expect(r.rows[0].status).toBe('storniert')
  })
})
