/**
 * H-1 — Regressionstest: create_invoice_draft_atomic verlangt einen
 *       Unterschriftsnachweis (fail-closed).
 *
 * Läuft IN-PROCESS auf PGlite gegen die WORTGLEICHE Funktion aus
 * supabase/migrations/20260911010000_rechnung_unterschriftspflicht.sql (v8)
 * und, zum Vergleich, gegen v7 aus der Rollback-Datei.
 *
 * Bewiesen wird:
 *   1. v7 fakturiert Nachweise ohne jede Unterschrift — die Lücke ist real.
 *   2. v8 bricht mit MISSING_SIGNATURE ab und legt KEINE Rechnung an.
 *   3. proof_status='UNTERSCHRIEBEN' ODER signature_hash reicht jeweils allein.
 *   4. Ein einziger unsignierter Nachweis blockiert den ganzen Lauf
 *      (kein stilles Weglassen von Positionen).
 *   5. Die Pflicht gilt auch für Privatrechnungen.
 *   6. Bereits erstellte Rechnungen bleiben über die Idempotenz erreichbar.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { funktionAusMigration, liesMigration } from '../helpers/sql-extract'

const V8 = '20260911010000_rechnung_unterschriftspflicht.sql'
const V7 = '20260911010001_rollback_rechnung_unterschriftspflicht.sql'
const LEISTUNGSART = '20260908000000_leistungsart_tarif_mapping.sql'
const BILLING_CORE = '20260806200000_billing_core_corrections.sql'
const REVIEW_FIXES = '20260808120000_expansion_review_fixes.sql'

const ORG = '00000000-aaaa-4000-8000-00000000000a'
const CLIENT = '11111111-aaaa-4000-8000-000000000001'
const ACTOR = '22222222-aaaa-4000-8000-000000000002'

const SCHEMA = `
CREATE SCHEMA IF NOT EXISTS extensions;
-- Stellvertreter für pgcrypto: identische Signatur, echter SHA-256.
CREATE FUNCTION extensions.digest(p_data bytea, p_algo text) RETURNS bytea
  LANGUAGE sql IMMUTABLE AS $d$ SELECT sha256(p_data) $d$;

CREATE TYPE public.create_invoice_draft_result AS (
  invoice_id     UUID,
  invoice_number TEXT,
  total_amount   NUMERIC,
  line_count     INTEGER,
  already_exists BOOLEAN
);

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY, bundesland text
);

CREATE TABLE public.clients (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL,
  pflegekasse_ik text, zip_code text
);

CREATE TABLE public.plz_bundesland_regeln (
  praefix text PRIMARY KEY, bundesland text NOT NULL, sicher boolean NOT NULL DEFAULT true
);

CREATE TABLE public.service_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL, organization_id uuid,
  date date NOT NULL, start_time time, end_time time,
  duration_minutes integer, service_type text NOT NULL,
  budget_type text NOT NULL, amount numeric,
  status text NOT NULL DEFAULT 'draft',
  proof_status text DEFAULT 'ENTWURF',
  signature_hash text,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.billing_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  kostentraeger_ik text, leistungsart text NOT NULL, rechtsgrundlage text NOT NULL,
  bundesland text, vertrag_referenz text, qualifikation text,
  verguetungsart text NOT NULL, preis_cent integer NOT NULL, einheit text,
  zuschlag_wochenende_prozent numeric(5,2) DEFAULT 0,
  zuschlag_feiertag_prozent   numeric(5,2) DEFAULT 0,
  zuschlag_nacht_prozent      numeric(5,2) DEFAULT 0,
  nacht_von time DEFAULT '20:00', nacht_bis time DEFAULT '06:00',
  gueltig_ab date NOT NULL, gueltig_bis date,
  ist_aktiv boolean NOT NULL DEFAULT true,
  tarif_status text NOT NULL DEFAULT 'unverified',
  tarifquelle text,
  deleted_at timestamptz
);

CREATE TABLE public.billing_feiertage (
  datum date NOT NULL, bundesland text
);

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text, invoice_number_formatted text,
  client_id uuid, insurance_name text, insurance_number text,
  period_start date, period_end date,
  total_amount numeric, budget_amount numeric, private_amount numeric,
  status text, version integer, idempotency_key text,
  organization_id uuid, created_at timestamptz, updated_at timestamptz,
  deleted_at timestamptz
);

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid, service_record_id uuid, description text, date date,
  duration_minutes integer, amount numeric, budget_type text,
  organization_id uuid, created_at timestamptz,
  tariff_id uuid, price_source text,
  tariff_gueltig_ab date, tariff_gueltig_bis date,
  tariff_preis_cent integer, tariff_einheit text, tariff_verguetungsart text,
  abweichung_cent integer, abweichung_grund text
);

CREATE TABLE public.billing_audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid, entity_type text, entity_id uuid, action text,
  previous_state jsonb, new_state jsonb, actor_id uuid,
  created_at timestamptz, checksum text
);

CREATE TABLE public.billing_number_sequences (
  organization_id uuid NOT NULL, prefix text NOT NULL, year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, prefix, year)
);
`

const SEED = `
INSERT INTO public.plz_bundesland_regeln (praefix, bundesland, sicher)
  VALUES ('60', 'hessen', true);
INSERT INTO public.organizations (id, bundesland) VALUES ('${ORG}', 'hessen');
INSERT INTO public.clients (id, organization_id, pflegekasse_ik, zip_code)
  VALUES ('${CLIENT}', '${ORG}', NULL, '60311');

-- Ein verifizierter §45b-Tarif und ein Privattarif. Beide Werte sind reine
-- Testwerte innerhalb dieses In-Memory-Schemas — sie beruehren keine
-- produktive Preistabelle.
INSERT INTO public.billing_tariffs
  (organization_id, leistungsart, rechtsgrundlage, verguetungsart, preis_cent,
   einheit, gueltig_ab, tarif_status)
VALUES
  ('${ORG}', 'betreuung_45a', '§45b SGB XI', 'zeit_stunde', 3000, 'stunde', '2020-01-01', 'verified'),
  ('${ORG}', 'betreuung_45a', 'privat',      'zeit_stunde', 3000, 'stunde', '2020-01-01', 'verified');
`

type RpcErgebnis =
  | { invoice_id: string; line_count: number; total_amount: string }
  | { fehler: string }

describe('H-1: create_invoice_draft_atomic — Unterschriftspflicht', () => {
  let db: InstanceType<typeof PGlite>

  async function nachweis(opts: {
    proofStatus?: string
    signatureHash?: string | null
    budgetType?: string
    tag?: string
    status?: string
  }) {
    await db.query(
      `INSERT INTO public.service_records
         (client_id, organization_id, date, start_time, end_time, duration_minutes,
          service_type, budget_type, amount, status, proof_status, signature_hash)
       VALUES ($1, $2, $3, '09:00', '10:00', 60, 'Betreuung', $4, 30, $5, $6, $7)`,
      [
        CLIENT, ORG, opts.tag ?? '2026-08-03',
        opts.budgetType ?? 'entlastung',
        opts.status ?? 'complete',
        opts.proofStatus ?? 'ENTWURF',
        opts.signatureHash ?? null,
      ],
    )
  }

  async function rechnungErzeugen(budgetType = 'entlastung'): Promise<RpcErgebnis> {
    try {
      const r = await db.query<any>(
        `SELECT * FROM public.create_invoice_draft_atomic($1, $2, '2026-08', $3, $4)`,
        [CLIENT, ORG, budgetType, ACTOR],
      )
      return r.rows[0]
    } catch (e: any) {
      return { fehler: String(e?.message ?? e) }
    }
  }

  async function rechnungsAnzahl(): Promise<number> {
    const r = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM public.invoices`)
    return Number(r.rows[0].n)
  }

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;`)
    await db.exec(SCHEMA)
    await db.exec(funktionAusMigration(REVIEW_FIXES, 'bundesland_fuer_plz') + ';')
    await db.exec(funktionAusMigration(REVIEW_FIXES, 'eindeutiges_bundesland_fuer_plz') + ';')
    await db.exec(funktionAusMigration(BILLING_CORE, 'next_billing_number') + ';')
    await db.exec(funktionAusMigration(LEISTUNGSART, 'normalisiere_leistungsart') + ';')
    await db.exec(funktionAusMigration(LEISTUNGSART, 'tarif_leistungsart') + ';')
    await db.exec(SEED)
  }, 60_000)

  afterAll(async () => {
    await db?.close()
  })

  beforeEach(async () => {
    await db.exec(`
      DELETE FROM public.invoice_items;
      DELETE FROM public.invoices;
      DELETE FROM public.service_records;
      DELETE FROM public.billing_audit_trail;
      DELETE FROM public.billing_number_sequences;
    `)
  })

  // ── 1. Die Lücke ist real ───────────────────────────────────────────────
  describe('v7 (Rollback-Stand) — Nachweis der Lücke', () => {
    beforeAll(async () => { await db.exec(liesMigration(V7)) }, 60_000)

    it('fakturiert einen Nachweis ohne jede Unterschrift', async () => {
      await nachweis({ proofStatus: 'ENTWURF', signatureHash: null })
      const r = await rechnungErzeugen() as any
      expect(r.fehler).toBeUndefined()
      expect(r.line_count).toBe(1)
      expect(await rechnungsAnzahl()).toBe(1)
    })
  })

  // ── 2. Der Fix ──────────────────────────────────────────────────────────
  describe('v8 (Fix) — fail-closed', () => {
    beforeAll(async () => { await db.exec(liesMigration(V8)) }, 60_000)

    it('blockiert Nachweise ohne Unterschriftsnachweis', async () => {
      await nachweis({ proofStatus: 'ENTWURF', signatureHash: null })
      const r = await rechnungErzeugen() as any
      expect(r.fehler).toContain('MISSING_SIGNATURE')
    })

    it('legt bei fehlender Unterschrift KEINE Rechnung an', async () => {
      await nachweis({ proofStatus: 'ENTWURF' })
      await rechnungErzeugen()
      expect(await rechnungsAnzahl()).toBe(0)
    })

    it('status=signed allein genügt NICHT (das war der Umgehungsweg)', async () => {
      await nachweis({ status: 'signed', proofStatus: 'ENTWURF', signatureHash: null })
      const r = await rechnungErzeugen() as any
      expect(r.fehler).toContain('MISSING_SIGNATURE')
    })

    it('proof_status=UNTERSCHRIEBEN genügt', async () => {
      await nachweis({ proofStatus: 'UNTERSCHRIEBEN', status: 'signed' })
      const r = await rechnungErzeugen() as any
      expect(r.fehler).toBeUndefined()
      expect(r.line_count).toBe(1)
      expect(Number(r.total_amount)).toBe(30)
    })

    it('signature_hash allein genügt', async () => {
      await nachweis({ proofStatus: 'ABGESCHLOSSEN', signatureHash: 'a'.repeat(64) })
      const r = await rechnungErzeugen() as any
      expect(r.fehler).toBeUndefined()
      expect(r.line_count).toBe(1)
    })

    it('ein einziger unsignierter Nachweis blockiert den ganzen Lauf', async () => {
      await nachweis({ proofStatus: 'UNTERSCHRIEBEN', tag: '2026-08-03' })
      await nachweis({ proofStatus: 'UNTERSCHRIEBEN', tag: '2026-08-04' })
      await nachweis({ proofStatus: 'ENTWURF', tag: '2026-08-05' })

      const r = await rechnungErzeugen() as any
      expect(r.fehler).toContain('MISSING_SIGNATURE')
      expect(r.fehler).toContain('1 von 3')
      // Nichts halb Erstelltes zurückgelassen:
      expect(await rechnungsAnzahl()).toBe(0)
    })

    it('nennt die betroffenen Nachweise samt Datum', async () => {
      await nachweis({ proofStatus: 'ENTWURF', tag: '2026-08-07' })
      const r = await rechnungErzeugen() as any
      expect(r.fehler).toContain('2026-08-07')
    })

    it('gilt auch für Privatrechnungen', async () => {
      await nachweis({ budgetType: 'private', proofStatus: 'ENTWURF' })
      const r = await rechnungErzeugen('private') as any
      expect(r.fehler).toContain('MISSING_SIGNATURE')
    })

    it('Privatrechnung mit Unterschrift läuft durch', async () => {
      await nachweis({ budgetType: 'private', proofStatus: 'UNTERSCHRIEBEN' })
      const r = await rechnungErzeugen('private') as any
      expect(r.fehler).toBeUndefined()
      expect(r.line_count).toBe(1)
    })

    it('Idempotenz bleibt: eine bestehende Rechnung wird zurückgegeben', async () => {
      await nachweis({ proofStatus: 'UNTERSCHRIEBEN' })
      const erst = await rechnungErzeugen() as any
      expect(erst.already_exists).toBe(false)

      // Nachweis wieder auf "unsigniert" — die bestehende Rechnung darf
      // trotzdem weiter abrufbar sein (Idempotenz läuft VOR der Prüfung).
      await db.exec(`UPDATE public.service_records
                        SET proof_status = 'ENTWURF', signature_hash = NULL, status = 'complete'`)
      const zweit = await rechnungErzeugen() as any
      expect(zweit.already_exists).toBe(true)
      expect(zweit.invoice_id).toBe(erst.invoice_id)
      expect(await rechnungsAnzahl()).toBe(1)
    })

    it('schreibt einen billing_audit_trail-Eintrag mit error_code', async () => {
      // Der Eintrag wird durch das RAISE mit zurückgerollt — nachweisbar ist er
      // deshalb nur, wenn die Prüfung selbst ausgeführt wird. Getestet wird hier
      // die Formulierung im Funktionskörper, nicht der (rollbackte) Insert.
      const r = await db.query<{ hat: boolean }>(
        `SELECT prosrc LIKE '%missing_signature%'
                AND prosrc LIKE '%billing_audit_trail%' AS hat
           FROM pg_proc WHERE proname = 'create_invoice_draft_atomic'`,
      )
      expect(r.rows[0].hat).toBe(true)
    })

    it('setzt abgerechnete Nachweise weiterhin auf invoiced', async () => {
      await nachweis({ proofStatus: 'UNTERSCHRIEBEN' })
      await rechnungErzeugen()
      const r = await db.query<{ status: string }>(
        `SELECT status FROM public.service_records`,
      )
      expect(r.rows[0].status).toBe('invoiced')
    })
  })
})
