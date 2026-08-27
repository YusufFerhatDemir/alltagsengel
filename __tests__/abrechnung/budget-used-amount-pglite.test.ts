/**
 * P0 — client_budgets.used_amount stand seit dem 02.07.2026 dauerhaft auf 0.
 *
 * Laeuft IN-PROCESS auf PGlite (echtes Postgres, WASM) gegen die
 * WORTGLEICHEN Funktionen aus
 *   supabase/migrations/20250101000050_missing_production_functions.sql  (alt)
 *   supabase/migrations/20261013000002_budget_used_amount_statuswerte.sql (Fix)
 *
 * ── Die Luecke ──────────────────────────────────────────────────────────
 * `update_budget_used_amount()` summiert
 *   … AND status IN ('completed', 'billed', 'paid')
 * Das war richtig, solange `service_records_status_check` live
 * ('draft','paid','disputed') erlaubte. 20260702 hat das Werteset auf
 * ('draft','incomplete','complete','signed','invoiced') umgestellt und die
 * Bestandsdaten mitgezogen — 'completed'/'billed'/'paid' sind seitdem
 * schlicht keine Werte mehr, die in der Spalte vorkommen koennen ('completed'
 * ist nicht 'complete'). SUM ueber der leeren Menge ist NULL, COALESCE(…,0)
 * schreibt 0.
 *
 * Daran haengt die einzige Budgetsperre der Einsatzplanung: pruefeBudget()
 * rechnet used_amount / (annual_amount + carryover) — mit 0 im Zaehler
 * loesen weder die 80-%-Warnung noch die 100-%-Sperre je aus.
 *
 * Das Testschema traegt den CHECK-Constraint aus 20260702 WORTGLEICH mit.
 * Ohne ihn liesse sich hier 'paid' einfuegen, der alte Trigger saehe richtig
 * aus, und der Test bewiese das Gegenteil dessen, was live passiert.
 *
 * Bewiesen wird:
 *   1. Der alte Trigger schreibt bei jedem gueltigen Status 0.
 *   2. Der neue Trigger summiert complete/signed/invoiced korrekt.
 *   3. draft/incomplete zaehlen nicht.
 *   4. STORNIERTE Nachweise zaehlen nicht (status bleibt dabei 'signed').
 *   5. § 45b und § 42a landen in getrennten Spalten; 'carryover' gehoert zu §45b.
 *   6. DELETE und der Wechsel von Klient/Jahr rechnen beide Seiten neu.
 *   7. Fremde Mandanten fliessen nicht ein.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { funktionAusMigration, liesMigration } from '../helpers/sql-extract'

const ALT = '20250101000050_missing_production_functions.sql'
const FIX = '20261013000002_budget_used_amount_statuswerte.sql'

const ORG = '00000000-cccc-4000-8000-00000000000c'
const FREMD_ORG = '00000000-dddd-4000-8000-00000000000d'
const KLIENT = '11111111-cccc-4000-8000-000000000001'
const KLIENT_2 = '11111111-cccc-4000-8000-000000000002'
const ENGEL = '22222222-cccc-4000-8000-000000000002'

const JAHR = 2026

const SCHEMA = `
CREATE TABLE public.client_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  organization_id uuid,
  year integer NOT NULL,
  monthly_amount numeric DEFAULT 131.0,
  annual_amount numeric DEFAULT 1572.0,
  carryover_amount numeric DEFAULT 0,
  carryover_expires date,
  used_amount numeric DEFAULT 0,
  combined_annual_amount numeric DEFAULT 3539.0,
  combined_used_amount numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Die beiden CHECK-Constraints stehen wortgleich in
-- 20260702_fix_service_records_check_constraints.sql. Sie sind der Kern des
-- Befunds: ohne sie liesse sich hier 'paid' einfuegen.
CREATE TABLE public.service_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  organization_id uuid,
  caregiver_id uuid,
  date date NOT NULL,
  amount numeric,
  budget_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  proof_status text DEFAULT 'ENTWURF',
  billing_status text DEFAULT 'OFFEN',
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT service_records_status_check
    CHECK (status IN ('draft', 'incomplete', 'complete', 'signed', 'invoiced')),
  CONSTRAINT service_records_budget_type_check
    CHECK (budget_type IN ('entlastung', 'verhinderung', 'carryover', 'private'))
);
`

interface BudgetStand {
  used_amount: string
  combined_used_amount: string
}

describe('P0: client_budgets.used_amount — Statuswerte', () => {
  let db: InstanceType<typeof PGlite>

  async function budgetZeile(
    clientId = KLIENT,
    org: string | null = ORG,
    jahr = JAHR,
  ) {
    await db.query(
      `INSERT INTO public.client_budgets (client_id, organization_id, year, annual_amount, combined_annual_amount)
       VALUES ($1, $2, $3, 1572, 3539)`,
      [clientId, org, jahr],
    )
  }

  async function einsatz(opts: {
    betrag: number
    status?: string
    budgetType?: string
    proofStatus?: string | null
    billingStatus?: string | null
    client?: string
    org?: string
    datum?: string
  }): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO public.service_records
         (client_id, organization_id, caregiver_id, date, amount, budget_type,
          status, proof_status, billing_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        opts.client ?? KLIENT,
        opts.org ?? ORG,
        ENGEL,
        opts.datum ?? `${JAHR}-03-15`,
        opts.betrag,
        opts.budgetType ?? 'entlastung',
        opts.status ?? 'signed',
        opts.proofStatus === undefined ? 'UNTERSCHRIEBEN' : opts.proofStatus,
        opts.billingStatus === undefined ? 'OFFEN' : opts.billingStatus,
      ],
    )
    return r.rows[0].id
  }

  async function stand(clientId = KLIENT, jahr = JAHR): Promise<BudgetStand> {
    const r = await db.query<BudgetStand>(
      `SELECT used_amount::text, combined_used_amount::text
         FROM public.client_budgets WHERE client_id = $1 AND year = $2`,
      [clientId, jahr],
    )
    return r.rows[0]
  }

  beforeAll(async () => {
    db = new PGlite()
    // Die Migration REVOKEt gegen anon/authenticated — ohne die Rollen
    // scheitert sie mit 'role does not exist'.
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;`)
    await db.exec(SCHEMA)
  }, 120_000)

  afterAll(async () => { await db?.close() })

  beforeEach(async () => {
    await db.exec(`
      DELETE FROM public.service_records;
      DELETE FROM public.client_budgets;
    `)
  })

  // ── 1. Gegenprobe am alten Stand ───────────────────────────────────────
  describe('alter Trigger (20250101000050) — Nachweis der Luecke', () => {
    beforeAll(async () => {
      await db.exec(funktionAusMigration(ALT, 'update_budget_used_amount') + ';')
      await db.exec(`
        DROP TRIGGER IF EXISTS trg_update_budget_on_service_record ON public.service_records;
        CREATE TRIGGER trg_update_budget_on_service_record
          AFTER INSERT OR UPDATE OR DELETE ON public.service_records
          FOR EACH ROW EXECUTE FUNCTION public.update_budget_used_amount();
      `)
    }, 120_000)

    it('schreibt 0, obwohl ein unterschriebener Nachweis vorliegt', async () => {
      await budgetZeile()
      await einsatz({ betrag: 500, status: 'signed' })
      expect(Number((await stand()).used_amount)).toBe(0)
    })

    it('schreibt 0 fuer JEDEN Status, den der CHECK-Constraint erlaubt', async () => {
      await budgetZeile()
      for (const status of ['draft', 'incomplete', 'complete', 'signed', 'invoiced']) {
        await einsatz({ betrag: 100, status })
      }
      // 500 EUR erbracht, 0 EUR ausgewiesen.
      expect(Number((await stand()).used_amount)).toBe(0)
    })

    it('die frueher passenden Werte sind gar nicht mehr eintragbar', async () => {
      await budgetZeile()
      await expect(einsatz({ betrag: 100, status: 'paid' }))
        .rejects.toThrow(/service_records_status_check/)
    })

    it('pflegt combined_used_amount (§ 42a) ueberhaupt nicht', async () => {
      await budgetZeile()
      await einsatz({ betrag: 800, budgetType: 'verhinderung', status: 'signed' })
      expect(Number((await stand()).combined_used_amount)).toBe(0)
    })
  })

  // ── 2. Der Fix ─────────────────────────────────────────────────────────
  describe('neuer Trigger (20261013000002) — echte Statuswerte', () => {
    beforeAll(async () => { await db.exec(liesMigration(FIX)) }, 120_000)

    it('summiert complete, signed und invoiced', async () => {
      await budgetZeile()
      await einsatz({ betrag: 100, status: 'complete' })
      await einsatz({ betrag: 200, status: 'signed' })
      await einsatz({ betrag: 300, status: 'invoiced' })
      expect(Number((await stand()).used_amount)).toBe(600)
    })

    it('zaehlt draft und incomplete nicht mit', async () => {
      await budgetZeile()
      await einsatz({ betrag: 100, status: 'signed' })
      await einsatz({ betrag: 999, status: 'draft' })
      await einsatz({ betrag: 999, status: 'incomplete' })
      expect(Number((await stand()).used_amount)).toBe(100)
    })

    it('zaehlt einen stornierten Nachweis nicht — obwohl status auf signed bleibt', async () => {
      await budgetZeile()
      await einsatz({ betrag: 100, status: 'signed' })
      await einsatz({
        betrag: 900, status: 'signed',
        proofStatus: 'STORNIERT', billingStatus: 'STORNIERT',
      })
      expect(Number((await stand()).used_amount)).toBe(100)
    })

    it('rechnet nach einem nachtraeglichen Storno neu', async () => {
      await budgetZeile()
      const id = await einsatz({ betrag: 400, status: 'signed' })
      expect(Number((await stand()).used_amount)).toBe(400)

      await db.query(
        `UPDATE public.service_records
            SET proof_status = 'STORNIERT', billing_status = 'STORNIERT'
          WHERE id = $1`,
        [id],
      )
      expect(Number((await stand()).used_amount)).toBe(0)
    })

    it('haelt Altbestand ohne Storno-Angaben weiter zaehlbar', async () => {
      await budgetZeile()
      await einsatz({ betrag: 150, status: 'signed', proofStatus: null, billingStatus: null })
      expect(Number((await stand()).used_amount)).toBe(150)
    })

    it('trennt § 45b und § 42a in zwei Spalten', async () => {
      await budgetZeile()
      await einsatz({ betrag: 100, budgetType: 'entlastung' })
      await einsatz({ betrag: 50, budgetType: 'carryover' })       // derselbe § 45b-Topf
      await einsatz({ betrag: 800, budgetType: 'verhinderung' })   // § 42a
      await einsatz({ betrag: 999, budgetType: 'private' })        // kein Kassenanspruch

      const s = await stand()
      expect(Number(s.used_amount)).toBe(150)
      expect(Number(s.combined_used_amount)).toBe(800)
    })

    it('laesst Nachweise fremder Mandanten aussen vor', async () => {
      await budgetZeile()
      await einsatz({ betrag: 100 })
      await einsatz({ betrag: 900, org: FREMD_ORG })
      expect(Number((await stand()).used_amount)).toBe(100)
    })

    it('trennt nach Kalenderjahr', async () => {
      await budgetZeile(KLIENT, ORG, JAHR)
      await budgetZeile(KLIENT, ORG, JAHR - 1)
      await einsatz({ betrag: 100, datum: `${JAHR}-03-15` })
      await einsatz({ betrag: 700, datum: `${JAHR - 1}-11-20` })

      expect(Number((await stand(KLIENT, JAHR)).used_amount)).toBe(100)
      expect(Number((await stand(KLIENT, JAHR - 1)).used_amount)).toBe(700)
    })

    it('rechnet nach DELETE neu', async () => {
      await budgetZeile()
      const id = await einsatz({ betrag: 250 })
      await einsatz({ betrag: 50 })
      expect(Number((await stand()).used_amount)).toBe(300)

      await db.query(`DELETE FROM public.service_records WHERE id = $1`, [id])
      expect(Number((await stand()).used_amount)).toBe(50)
    })

    it('rechnet beim Wechsel des Klienten BEIDE Zeilen neu', async () => {
      await budgetZeile(KLIENT)
      await budgetZeile(KLIENT_2)
      const id = await einsatz({ betrag: 300, client: KLIENT })
      expect(Number((await stand(KLIENT)).used_amount)).toBe(300)

      await db.query(
        `UPDATE public.service_records SET client_id = $1 WHERE id = $2`,
        [KLIENT_2, id],
      )
      expect(Number((await stand(KLIENT)).used_amount)).toBe(0)
      expect(Number((await stand(KLIENT_2)).used_amount)).toBe(300)
    })

    it('rechnet beim Verschieben ins Vorjahr BEIDE Jahreszeilen neu', async () => {
      await budgetZeile(KLIENT, ORG, JAHR)
      await budgetZeile(KLIENT, ORG, JAHR - 1)
      const id = await einsatz({ betrag: 120, datum: `${JAHR}-01-05` })
      expect(Number((await stand(KLIENT, JAHR)).used_amount)).toBe(120)

      await db.query(
        `UPDATE public.service_records SET date = $1 WHERE id = $2`,
        [`${JAHR - 1}-12-28`, id],
      )
      expect(Number((await stand(KLIENT, JAHR)).used_amount)).toBe(0)
      expect(Number((await stand(KLIENT, JAHR - 1)).used_amount)).toBe(120)
    })

    it('haelt einen Nachweis ohne Betrag aus (NULL zaehlt als 0)', async () => {
      await budgetZeile()
      await db.query(
        `INSERT INTO public.service_records
           (client_id, organization_id, caregiver_id, date, amount, budget_type, status)
         VALUES ($1, $2, $3, $4, NULL, 'entlastung', 'signed')`,
        [KLIENT, ORG, ENGEL, `${JAHR}-03-15`],
      )
      await einsatz({ betrag: 60 })
      expect(Number((await stand()).used_amount)).toBe(60)
    })
  })

  // ── 3. Backfill ────────────────────────────────────────────────────────
  describe('Backfill der Migration', () => {
    it('zieht Zeilen nach, die der alte Trigger auf 0 gesetzt hatte', async () => {
      // Ausgangslage nachstellen: Nachweise da, used_amount durch den alten
      // Trigger auf 0 gedrueckt. Der Trigger wird dafuer kurz abgehaengt.
      await budgetZeile()
      await db.exec(`ALTER TABLE public.service_records DISABLE TRIGGER trg_update_budget_on_service_record`)
      await einsatz({ betrag: 400, status: 'signed' })
      await einsatz({ betrag: 900, budgetType: 'verhinderung', status: 'signed' })
      await db.exec(`ALTER TABLE public.service_records ENABLE TRIGGER trg_update_budget_on_service_record`)

      const vorher = await stand()
      expect(Number(vorher.used_amount)).toBe(0)
      expect(Number(vorher.combined_used_amount)).toBe(0)

      await db.query(
        `SELECT public.rechne_budget_verbrauch_neu($1, $2, $3)`,
        [KLIENT, ORG, JAHR],
      )

      const nachher = await stand()
      expect(Number(nachher.used_amount)).toBe(400)
      expect(Number(nachher.combined_used_amount)).toBe(900)
    })
  })
})
