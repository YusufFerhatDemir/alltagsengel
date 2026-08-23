/**
 * H-2 — Regressionstest: VP/KZP-Anspruch (§ 42a SGB XI) wird für
 *       Bestandskunden ab Pflegegrad 2 nachgetragen.
 *
 * Läuft IN-PROCESS auf PGlite gegen die WORTGLEICHE UPDATE-Anweisung aus
 * supabase/migrations/20260911020000_vp_kzp_budget_nachberechnung.sql.
 *
 * Bewiesen wird:
 *   1. PG ≥ 2 mit leerem Anspruch wird auf den gesetzlichen Betrag gesetzt.
 *   2. Der Pflegegrad wird aus care_level gelesen, auch wenn pflegegrad NULL ist.
 *   3. PG 1 und Klienten ohne Pflegegrad bleiben bei 0 (kein §42a-Anspruch).
 *   4. Ein bereits gepflegter Wert wird NIE überschrieben.
 *   5. Jahresbezug: ab 2025 → 3.539 €, 2024 → 3.386 €, davor gar nichts.
 *   6. Idempotent: ein zweiter Lauf ändert nichts.
 *   7. Es wird keine Budgetzeile und kein Klient angelegt.
 *
 * Zusätzlich wird geprüft, dass die Beträge der Migration mit
 * lib/config/budget-constants.ts übereinstimmen — sonst driften SQL und
 * Anwendungscode auseinander.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { transaktionsInhalt } from '../helpers/sql-extract'
import { BUDGET_VERSIONEN, budgetVersionFuerJahr } from '@/lib/config/budget-constants'

const MIGRATION = '20260911020000_vp_kzp_budget_nachberechnung.sql'
const ROLLBACK = '20260911020001_rollback_vp_kzp_budget_nachberechnung.sql'

const ORG = '00000000-aaaa-4000-8000-00000000000a'

const SCHEMA = `
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  customer_number text,
  care_level integer,
  pflegegrad integer
);

CREATE TABLE public.client_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  organization_id uuid NOT NULL,
  year integer NOT NULL,
  annual_amount numeric DEFAULT 0,
  monthly_amount numeric DEFAULT 0,
  combined_annual_amount numeric DEFAULT 0,
  combined_used_amount numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
`

interface BudgetZeile {
  customer_number: string
  year: number
  combined_annual_amount: string | null
}

describe('H-2: VP/KZP-Budget-Nachberechnung', () => {
  let db: InstanceType<typeof PGlite>
  const migration = transaktionsInhalt(MIGRATION)
  const rollback = transaktionsInhalt(ROLLBACK)

  async function klient(nr: string, careLevel: number | null, pflegegrad: number | null = null) {
    const r = await db.query<{ id: string }>(
      `INSERT INTO public.clients (organization_id, customer_number, care_level, pflegegrad)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [ORG, nr, careLevel, pflegegrad],
    )
    return r.rows[0].id
  }

  async function budget(clientId: string, year: number, combined = 0) {
    await db.query(
      `INSERT INTO public.client_budgets
         (client_id, organization_id, year, annual_amount, combined_annual_amount)
       VALUES ($1, $2, $3, 1572, $4)`,
      [clientId, ORG, year, combined],
    )
  }

  async function zeilen(): Promise<BudgetZeile[]> {
    const r = await db.query<BudgetZeile>(
      `SELECT c.customer_number, cb.year, cb.combined_annual_amount
         FROM public.client_budgets cb
         JOIN public.clients c ON c.id = cb.client_id
        ORDER BY c.customer_number, cb.year`,
    )
    return r.rows
  }

  async function betrag(nr: string, year = 2026): Promise<number> {
    const alle = await zeilen()
    const z = alle.find(x => x.customer_number === nr && x.year === year)
    return Number(z?.combined_annual_amount ?? -1)
  }

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(SCHEMA)
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  beforeEach(async () => {
    await db.exec(`DELETE FROM public.client_budgets; DELETE FROM public.clients;`)
  })

  // ── Beträge stimmen mit dem Anwendungscode überein ──────────────────────
  it('Migration nutzt exakt die Beträge aus BUDGET_VERSIONEN', () => {
    expect(budgetVersionFuerJahr(2025).vpKzpKombiniert).toBe(3539)
    expect(budgetVersionFuerJahr(2024).vpKzpKombiniert).toBe(3386)
    expect(migration).toContain('3539.0')
    expect(migration).toContain('3386.0')
    // Kein anderer, frei erfundener Betrag im Update:
    const zahlen = [...migration.matchAll(/\b\d{3,5}\.0\b/g)].map(m => m[0])
    expect(new Set(zahlen)).toEqual(new Set(['3539.0', '3386.0']))
  })

  it('Mindest-Pflegegrad der Migration entspricht minPflegegradVpKzp', () => {
    const min = BUDGET_VERSIONEN[BUDGET_VERSIONEN.length - 1].minPflegegradVpKzp
    expect(min).toBe(2)
    expect(migration).toContain('>= 2')
  })

  // ── Der eigentliche Befund ──────────────────────────────────────────────
  it('trägt den §42a-Anspruch für PG 2 nach (der Live-Befund)', async () => {
    const c = await klient('AE-TEST-0001', 2)
    await budget(c, 2026, 0)

    expect(await betrag('AE-TEST-0001')).toBe(0)
    await db.exec(migration)
    expect(await betrag('AE-TEST-0001')).toBe(3539)
  })

  it('liest den Pflegegrad aus care_level, auch wenn pflegegrad NULL ist', async () => {
    const c = await klient('AE-TEST-0003', 2, null)
    await budget(c, 2026, 0)
    await db.exec(migration)
    expect(await betrag('AE-TEST-0003')).toBe(3539)
  })

  it('greift auch, wenn nur pflegegrad gesetzt ist', async () => {
    const c = await klient('NUR-PG', null, 3)
    await budget(c, 2026, 0)
    await db.exec(migration)
    expect(await betrag('NUR-PG')).toBe(3539)
  })

  it('PG 1 bekommt KEINEN §42a-Anspruch', async () => {
    const c = await klient('PG1', 1)
    await budget(c, 2026, 0)
    await db.exec(migration)
    expect(await betrag('PG1')).toBe(0)
  })

  it('Klient ohne Pflegegrad bleibt unberührt', async () => {
    const c = await klient('OHNE-PG', null, null)
    await budget(c, 2026, 0)
    await db.exec(migration)
    expect(await betrag('OHNE-PG')).toBe(0)
  })

  it('überschreibt einen bereits gepflegten Wert NICHT', async () => {
    const c = await klient('GEKUERZT', 3)
    await budget(c, 2026, 1200)   // z. B. anteilig bei anderem Leistungserbringer verbraucht
    await db.exec(migration)
    expect(await betrag('GEKUERZT')).toBe(1200)
  })

  it('behandelt NULL wie 0 (Anspruch wird gesetzt)', async () => {
    const c = await klient('NULL-WERT', 2)
    await budget(c, 2026, 0)
    await db.query(`UPDATE public.client_budgets SET combined_annual_amount = NULL`)
    await db.exec(migration)
    expect(await betrag('NULL-WERT')).toBe(3539)
  })

  it('setzt für 2024 den damals gültigen Betrag', async () => {
    const c = await klient('ALTJAHR', 2)
    await budget(c, 2024, 0)
    await db.exec(migration)
    expect(await betrag('ALTJAHR', 2024)).toBe(3386)
  })

  it('setzt für Jahre ohne gesetzlichen Wert (< 2024) nichts', async () => {
    const c = await klient('ZU-ALT', 2)
    await budget(c, 2023, 0)
    await db.exec(migration)
    expect(await betrag('ZU-ALT', 2023)).toBe(0)
  })

  it('korrigiert mehrere Jahre desselben Klienten', async () => {
    const c = await klient('MEHRJAHR', 2)
    await budget(c, 2025, 0)
    await budget(c, 2026, 0)
    await db.exec(migration)
    expect(await betrag('MEHRJAHR', 2025)).toBe(3539)
    expect(await betrag('MEHRJAHR', 2026)).toBe(3539)
  })

  it('ist idempotent: zweiter Lauf ändert nichts', async () => {
    const c = await klient('IDEMPOTENT', 2)
    await budget(c, 2026, 0)
    await db.exec(migration)
    const nachEins = await zeilen()
    await db.exec(migration)
    expect(await zeilen()).toEqual(nachEins)
  })

  it('legt keine Budgetzeile und keinen Klienten an', async () => {
    await klient('OHNE-BUDGET', 2)   // bewusst ohne Budgetzeile
    await db.exec(migration)

    const b = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM public.client_budgets`)
    const k = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM public.clients`)
    expect(Number(b.rows[0].n)).toBe(0)
    expect(Number(k.rows[0].n)).toBe(1)
  })

  it('Rollback setzt nur unverbrauchte Ansprüche zurück', async () => {
    const unberuehrt = await klient('UNBERUEHRT', 2)
    const verbraucht = await klient('VERBRAUCHT', 2)
    await budget(unberuehrt, 2026, 0)
    await budget(verbraucht, 2026, 0)
    await db.exec(migration)

    await db.query(
      `UPDATE public.client_budgets SET combined_used_amount = 500 WHERE client_id = $1`,
      [verbraucht],
    )
    await db.exec(rollback)

    expect(await betrag('UNBERUEHRT')).toBe(0)
    expect(await betrag('VERBRAUCHT')).toBe(3539)
  })
})
