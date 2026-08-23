/**
 * P0-1 — Regressionstest: check_billing_gate() blockiert keinen
 *        Kassen-Leistungsnachweis mehr.
 *
 * Läuft IN-PROCESS auf PGlite (WASM-Postgres). Getestet wird die WORTGLEICHE
 * Trigger-Funktion aus supabase/migrations/20260911000000_fix_check_billing_gate.sql
 * gegen ein minimales, aber echtes Schema — inklusive der echten Helper
 * state_flag() und eindeutiges_bundesland_fuer_plz() aus ihren
 * Ursprungsmigrationen.
 *
 * Bewiesen wird:
 *   1. Der ALTE Stand scheitert reproduzierbar mit SQLSTATE 42703
 *      (undefined_column) — der Befund ist real und kein Missverständnis.
 *   2. Der NEUE Stand lässt Kassen-Nachweise durch und parkt sie korrekt.
 *   3. Bei freigeschaltetem Bundesland wird nicht mehr geparkt.
 *   4. Die Entscheidung ist mandantenscharf (organization_id) — der Fehler,
 *      den die alte Fassung zusätzlich hatte.
 *   5. PRIVAT bleibt unberührt; nicht zuordenbare PLZ ⇒ fail-safe geparkt.
 *   6. ABGERECHNET/STORNIERT werden nicht zurückgesetzt.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { funktionAusMigration, liesMigration } from '../helpers/sql-extract'

const FIX = '20260911000000_fix_check_billing_gate.sql'
const ROLLBACK = '20260911000001_rollback_fix_check_billing_gate.sql'
const EXPANSION = '20260808100000_expansion_deutschland.sql'
const REVIEW_FIXES = '20260808120000_expansion_review_fixes.sql'

const ORG_A = '00000000-aaaa-4000-8000-00000000000a'
const ORG_B = '00000000-bbbb-4000-8000-00000000000b'
const CLIENT_HESSEN_A = '11111111-aaaa-4000-8000-000000000001'
const CLIENT_HESSEN_B = '11111111-bbbb-4000-8000-000000000002'
const CLIENT_OHNE_PLZ = '11111111-cccc-4000-8000-000000000003'

// ── Minimalschema: nur was die Trigger-Funktion und ihre Helper anfassen ──
const SCHEMA = `
CREATE TABLE public.clients (
  id              uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  zip_code        text
);

CREATE TABLE public.state_settings (
  organization_id        uuid NOT NULL,
  bundesland             text NOT NULL,
  status                 text NOT NULL DEFAULT 'VORBEREITUNG',
  marketing_enabled      boolean NOT NULL DEFAULT true,
  registration_enabled   boolean NOT NULL DEFAULT true,
  waitinglist_enabled    boolean NOT NULL DEFAULT true,
  private_enabled        boolean NOT NULL DEFAULT false,
  insurance_enabled      boolean NOT NULL DEFAULT false,
  kassentarife_enabled   boolean NOT NULL DEFAULT false,
  budgetpruefung_enabled boolean NOT NULL DEFAULT false,
  kassenrechnung_enabled boolean NOT NULL DEFAULT false,
  elnw_enabled           boolean NOT NULL DEFAULT false,
  dakota_export_enabled  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (organization_id, bundesland)
);

CREATE TABLE public.plz_bundesland_regeln (
  praefix    text PRIMARY KEY,
  bundesland text NOT NULL,
  sicher     boolean NOT NULL DEFAULT true
);

CREATE TABLE public.service_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES public.clients(id),
  date           date NOT NULL DEFAULT current_date,
  billing_type   text DEFAULT 'PRIVAT',
  billing_status text DEFAULT 'OFFEN',
  bundesland     text
);
`

const SEED = `
INSERT INTO public.plz_bundesland_regeln (praefix, bundesland, sicher) VALUES
  ('60', 'hessen', true),
  ('65', 'hessen', true),
  ('97', 'bayern', false);          -- Grenzregion: nicht eindeutig

INSERT INTO public.clients (id, organization_id, zip_code) VALUES
  ('${CLIENT_HESSEN_A}', '${ORG_A}', '60311'),
  ('${CLIENT_HESSEN_B}', '${ORG_B}', '60311'),
  ('${CLIENT_OHNE_PLZ}', '${ORG_A}', NULL);

INSERT INTO public.state_settings (organization_id, bundesland) VALUES
  ('${ORG_A}', 'hessen'),
  ('${ORG_B}', 'hessen');
`

describe('P0-1: check_billing_gate()', () => {
  let db: InstanceType<typeof PGlite>

  async function insertNachweis(
    clientId: string,
    billingType: string,
    billingStatus?: string,
  ): Promise<{ billing_status: string | null } | { fehler: string; code: string }> {
    try {
      const res = await db.query<{ billing_status: string | null }>(
        `INSERT INTO public.service_records (client_id, billing_type, billing_status)
         VALUES ($1, $2, COALESCE($3, 'OFFEN')) RETURNING billing_status`,
        [clientId, billingType, billingStatus ?? null],
      )
      return res.rows[0]
    } catch (e: unknown) {
      const fehler = e as { message?: string; code?: string } | undefined
      return { fehler: String(fehler?.message ?? e), code: String(fehler?.code ?? '') }
    }
  }

  /** Kassenabrechnung für eine Org freischalten (Ein-Klick-Kaskade nachgebildet). */
  async function freischalten(orgId: string) {
    await db.query(
      `UPDATE public.state_settings
          SET status = 'ANERKANNT', insurance_enabled = true,
              kassentarife_enabled = true, budgetpruefung_enabled = true,
              kassenrechnung_enabled = true, elnw_enabled = true,
              dakota_export_enabled = true
        WHERE organization_id = $1`,
      [orgId],
    )
  }

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role;
    `)
    await db.exec(SCHEMA)
    // Echte Helper aus ihren Ursprungsmigrationen — keine Nachbauten.
    await db.exec(funktionAusMigration(REVIEW_FIXES, 'bundesland_fuer_plz') + ';')
    await db.exec(funktionAusMigration(REVIEW_FIXES, 'eindeutiges_bundesland_fuer_plz') + ';')
    await db.exec(funktionAusMigration(EXPANSION, 'state_flag') + ';')
    await db.exec(SEED)
  }, 120_000)

  afterAll(async () => {
    await db?.close()
  })

  beforeEach(async () => {
    await db.exec('DELETE FROM public.service_records;')
    await db.query(
      `UPDATE public.state_settings
          SET status = 'VORBEREITUNG', insurance_enabled = false,
              kassentarife_enabled = false, budgetpruefung_enabled = false,
              kassenrechnung_enabled = false, elnw_enabled = false,
              dakota_export_enabled = false`,
    )
  })

  // ── 1. Der Befund ist real ──────────────────────────────────────────────
  describe('Alter Stand (Rollback-Datei) — Nachweis des Fehlers', () => {
    beforeAll(async () => {
      await db.exec(liesMigration(ROLLBACK))
    }, 120_000)

    it('PRIVAT geht durch (deshalb ist live nichts aufgefallen)', async () => {
      const r = await insertNachweis(CLIENT_HESSEN_A, 'PRIVAT')
      expect(r).toMatchObject({ billing_status: 'OFFEN' })
    })

    it('Kassen-Nachweis scheitert mit 42703 (undefined_column kasse_status)', async () => {
      const r = await insertNachweis(CLIENT_HESSEN_A, '§45b') as { fehler?: string; code?: string }
      expect(r.code).toBe('42703')
      expect(r.fehler).toContain('kasse_status')
    })
  })

  // ── 2. Der Fix ──────────────────────────────────────────────────────────
  describe('Neuer Stand (Fix-Migration)', () => {
    beforeAll(async () => {
      await db.exec(liesMigration(FIX))
    }, 120_000)

    it('liest keine Spalte kasse_status mehr', async () => {
      const r = await db.query<{ kaputt: boolean }>(
        `SELECT prosrc LIKE '%kasse_status%' AS kaputt FROM pg_proc WHERE proname = 'check_billing_gate'`,
      )
      expect(r.rows[0].kaputt).toBe(false)
    })

    it('Kassen-Nachweis wird angenommen und geparkt, solange nicht freigeschaltet', async () => {
      const r = await insertNachweis(CLIENT_HESSEN_A, '§45b')
      expect(r).toMatchObject({ billing_status: 'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET' })
    })

    it.each(['§45b', '§39', '§36', '§37', '§42', 'SONSTIGE'])(
      'billing_type %s wird verarbeitet statt zurückgerollt',
      async (typ) => {
        const r = await insertNachweis(CLIENT_HESSEN_A, typ) as { code?: string; billing_status?: string | null }
        expect(r.code).toBeUndefined()
        expect(r.billing_status).toBe('KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET')
      },
    )

    it('PRIVAT bleibt unberührt', async () => {
      const r = await insertNachweis(CLIENT_HESSEN_A, 'PRIVAT')
      expect(r).toMatchObject({ billing_status: 'OFFEN' })
    })

    it('freigeschaltetes Bundesland ⇒ kein Parken', async () => {
      await freischalten(ORG_A)
      const r = await insertNachweis(CLIENT_HESSEN_A, '§45b')
      expect(r).toMatchObject({ billing_status: 'OFFEN' })
    })

    it('mandantenscharf: Freischaltung von Org A gilt NICHT für Org B', async () => {
      await freischalten(ORG_A)
      const a = await insertNachweis(CLIENT_HESSEN_A, '§45b')
      const b = await insertNachweis(CLIENT_HESSEN_B, '§45b')
      expect(a).toMatchObject({ billing_status: 'OFFEN' })
      expect(b).toMatchObject({ billing_status: 'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET' })
    })

    it('nur insurance_enabled ohne kassenrechnung_enabled ⇒ weiter geparkt', async () => {
      await db.query(
        `UPDATE public.state_settings
            SET status = 'ANERKANNT', insurance_enabled = true, kassenrechnung_enabled = false
          WHERE organization_id = $1`,
        [ORG_A],
      )
      const r = await insertNachweis(CLIENT_HESSEN_A, '§45b')
      expect(r).toMatchObject({ billing_status: 'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET' })
    })

    it('fehlende PLZ ⇒ fail-safe geparkt (auch bei freigeschalteter Org)', async () => {
      await freischalten(ORG_A)
      const r = await insertNachweis(CLIENT_OHNE_PLZ, '§45b')
      expect(r).toMatchObject({ billing_status: 'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET' })
    })

    it('Grenz-PLZ (sicher=false) ⇒ fail-safe geparkt', async () => {
      await freischalten(ORG_A)
      await db.query(`UPDATE public.clients SET zip_code = '97070' WHERE id = $1`, [CLIENT_HESSEN_A])
      const r = await insertNachweis(CLIENT_HESSEN_A, '§45b')
      expect(r).toMatchObject({ billing_status: 'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET' })
      await db.query(`UPDATE public.clients SET zip_code = '60311' WHERE id = $1`, [CLIENT_HESSEN_A])
    })

    it('nach Freischaltung hebt ein UPDATE den Park-Vermerk auf', async () => {
      const vorher = await insertNachweis(CLIENT_HESSEN_A, '§45b')
      expect(vorher).toMatchObject({ billing_status: 'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET' })

      await freischalten(ORG_A)
      const r = await db.query<{ billing_status: string }>(
        `UPDATE public.service_records SET bundesland = 'hessen' RETURNING billing_status`,
      )
      expect(r.rows[0].billing_status).toBe('OFFEN')
    })

    it.each(['ABGERECHNET', 'STORNIERT'])(
      'endgültiger Status %s wird nicht zurückgesetzt',
      async (status) => {
        const r = await insertNachweis(CLIENT_HESSEN_A, '§45b', status)
        expect(r).toMatchObject({ billing_status: status })
      },
    )
  })
})
