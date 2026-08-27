/**
 * P0 — Regressionstest: create_invoice_draft_atomic fakturiert KEINE
 *      stornierten Leistungsnachweise.
 *
 * Laeuft IN-PROCESS auf PGlite (echtes Postgres, WASM) gegen die
 * WORTGLEICHEN Funktionen aus
 *   supabase/migrations/20260914000000_audit_persistenz_v9.sql            (v9, Luecke)
 *   supabase/migrations/20261013000000_rechnung_stornierte_nachweise.sql  (v10, Fix)
 *
 * ── Die Luecke ──────────────────────────────────────────────────────────
 * service_records fuehrt drei Statusfelder. v9 filterte nur ueber `status`,
 * ein Storno schreibt aber ausschliesslich proof_status/billing_status —
 * `sync_service_record_status()` laesst `status` bei STORNIERT bewusst
 * unveraendert, weil das status-Werteset keinen Storno-Wert kennt. Ein
 * unterschriebener, danach stornierter Nachweis blieb damit auf
 * status='signed' und lief in die naechste Rechnung.
 *
 * Auch die Unterschriftspflicht aus v8/v9 fing das nicht ab: sie verlangt
 * `proof_status <> 'UNTERSCHRIEBEN' AND signature_hash IS NULL`. Der beim
 * Unterschreiben vergebene Hash bleibt beim Storno stehen — die Zeile gilt
 * als unterschrieben.
 *
 * Bewiesen wird:
 *   1. v9 fakturiert einen stornierten Nachweis (die Luecke ist real).
 *   2. v10 laesst ihn weg und rechnet nur die verbliebenen Positionen ab.
 *   3. Sind ALLE Nachweise storniert, entsteht gar keine Rechnung.
 *   4. Der stornierte Nachweis wird nicht auf status='invoiced' gesetzt.
 *   5. billing_status='STORNIERT' allein reicht als Ausschluss.
 *   6. NULL in proof_status/billing_status (Altbestand) bleibt abrechenbar.
 *   7. Ein stornierter Nachweis ohne Unterschrift loest keinen
 *      MISSING_SIGNATURE-Abbruch mehr aus — er zaehlt gar nicht mehr mit.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { funktionAusMigration, liesMigration } from '../helpers/sql-extract'

const V9 = '20260914000000_audit_persistenz_v9.sql'
const V10 = '20261013000000_rechnung_stornierte_nachweise.sql'
const LEISTUNGSART = '20260908000000_leistungsart_tarif_mapping.sql'
const BILLING_CORE = '20260806200000_billing_core_corrections.sql'
const REVIEW_FIXES = '20260808120000_expansion_review_fixes.sql'

const ORG = '00000000-bbbb-4000-8000-00000000000b'
const CLIENT = '11111111-bbbb-4000-8000-000000000001'
const ACTOR = '22222222-bbbb-4000-8000-000000000002'

const SCHEMA = `
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE FUNCTION extensions.digest(p_data bytea, p_algo text) RETURNS bytea
  LANGUAGE sql IMMUTABLE AS $d$ SELECT sha256(p_data) $d$;

CREATE TABLE public.organizations (id uuid PRIMARY KEY, bundesland text);

CREATE TABLE public.clients (
  id uuid PRIMARY KEY, organization_id uuid NOT NULL,
  pflegekasse_ik text, zip_code text
);

CREATE TABLE public.plz_bundesland_regeln (
  praefix text PRIMARY KEY, bundesland text NOT NULL, sicher boolean NOT NULL DEFAULT true
);

-- billing_status ist live seit 20260808200000 vorhanden. Das Testschema
-- traegt die Spalte deshalb mit: ein Testschema, das lockerer ist als die
-- Produktion, beweist nichts (siehe rechnung-unterschriftspflicht.test.ts).
CREATE TABLE public.service_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL, organization_id uuid,
  date date NOT NULL, start_time time, end_time time,
  duration_minutes integer, service_type text NOT NULL,
  budget_type text NOT NULL, amount numeric,
  status text NOT NULL DEFAULT 'draft',
  proof_status text DEFAULT 'ENTWURF',
  billing_status text DEFAULT 'OFFEN',
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

CREATE TABLE public.billing_feiertage (datum date NOT NULL, bundesland text);

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

-- Wertemenge wie live NACH 20260914000000 (v9 erweitert den Constraint um
-- 'tariff_lookup'; 'invoice_draft' kam mit 20260912000000).
CREATE TABLE public.billing_audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid, entity_type text, entity_id uuid, action text,
  previous_state jsonb, new_state jsonb, actor_id uuid,
  created_at timestamptz, checksum text,
  CONSTRAINT billing_audit_trail_entity_type_check CHECK (
    entity_type = ANY(ARRAY['invoice', 'invoice_draft', 'tariff', 'tariff_lookup',
      'correction', 'snapshot', 'credit_note', 'payment', 'payment_allocation',
      'dunning', 'payment_difference', 'monthly_closing'])
  )
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

-- Reine Testwerte innerhalb dieses In-Memory-Schemas; sie beruehren keine
-- produktive Preistabelle.
INSERT INTO public.billing_tariffs
  (organization_id, leistungsart, rechtsgrundlage, verguetungsart, preis_cent,
   einheit, gueltig_ab, tarif_status)
VALUES
  ('${ORG}', 'betreuung_45a', '§45b SGB XI', 'zeit_stunde', 3000, 'stunde', '2020-01-01', 'verified');
`

interface Nachweis {
  tag?: string
  proofStatus?: string
  billingStatus?: string | null
  status?: string
  signatureHash?: string | null
}

describe('P0: create_invoice_draft_atomic — stornierte Nachweise', () => {
  let db: InstanceType<typeof PGlite>

  async function nachweis(opts: Nachweis = {}) {
    const r = await db.query<{ id: string }>(
      `INSERT INTO public.service_records
         (client_id, organization_id, date, start_time, end_time, duration_minutes,
          service_type, budget_type, amount, status, proof_status, billing_status,
          signature_hash)
       VALUES ($1, $2, $3, '09:00', '10:00', 60, 'Betreuung', 'entlastung', 30,
               $4, $5, $6, $7)
       RETURNING id`,
      [
        CLIENT, ORG, opts.tag ?? '2026-08-03',
        opts.status ?? 'signed',
        opts.proofStatus ?? 'UNTERSCHRIEBEN',
        opts.billingStatus === undefined ? 'OFFEN' : opts.billingStatus,
        opts.signatureHash === undefined ? 'hash-echt' : opts.signatureHash,
      ],
    )
    return r.rows[0].id
  }

  async function rechnungErzeugen(): Promise<Record<string, unknown>> {
    try {
      const r = await db.query<Record<string, unknown>>(
        `SELECT public.create_invoice_draft_atomic($1, $2, '2026-08', 'entlastung', $3) AS e`,
        [CLIENT, ORG, ACTOR],
      )
      return (r.rows[0] as { e: Record<string, unknown> }).e
    } catch (e) {
      return { fehler: String((e as Error)?.message ?? e) }
    }
  }

  async function zahl(sql: string): Promise<number> {
    const r = await db.query<{ n: string }>(sql)
    return Number(r.rows[0].n)
  }

  async function statusVon(id: string): Promise<string> {
    const r = await db.query<{ status: string }>(
      `SELECT status FROM public.service_records WHERE id = $1`, [id],
    )
    return r.rows[0].status
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
  }, 120_000)

  afterAll(async () => { await db?.close() })

  beforeEach(async () => {
    await db.exec(`
      DELETE FROM public.invoice_items;
      DELETE FROM public.invoices;
      DELETE FROM public.service_records;
      DELETE FROM public.billing_audit_trail;
      DELETE FROM public.billing_number_sequences;
    `)
  })

  // ── 1. Gegenprobe am alten Stand: die Luecke ist real ───────────────────
  describe('v9 (Stand vor dem Fix) — Nachweis der Luecke', () => {
    beforeAll(async () => {
      await db.exec(funktionAusMigration(V9, 'create_invoice_draft_atomic') + ';')
    }, 120_000)

    it('fakturiert einen stornierten Leistungsnachweis', async () => {
      await nachweis({ proofStatus: 'STORNIERT', billingStatus: 'STORNIERT' })

      const e = await rechnungErzeugen()
      expect(e.fehler).toBeUndefined()
      expect(e.success).toBe(true)
      expect(e.line_count).toBe(1)
      expect(Number(e.total_amount)).toBe(30)
    })

    it('setzt den stornierten Nachweis danach auf status=invoiced', async () => {
      const id = await nachweis({ proofStatus: 'STORNIERT', billingStatus: 'STORNIERT' })
      await rechnungErzeugen()
      expect(await statusVon(id)).toBe('invoiced')
    })
  })

  // ── 2. Der Fix ─────────────────────────────────────────────────────────
  describe('v10 (Fix) — Storno schliesst aus', () => {
    beforeAll(async () => {
      await db.exec(funktionAusMigration(V10, 'create_invoice_draft_atomic') + ';')
    }, 120_000)

    it('laesst den stornierten Nachweis weg und rechnet nur den Rest ab', async () => {
      await nachweis({ tag: '2026-08-03' })                                    // gilt
      await nachweis({ tag: '2026-08-04', proofStatus: 'STORNIERT', billingStatus: 'STORNIERT' })

      const e = await rechnungErzeugen()
      expect(e.fehler).toBeUndefined()
      expect(e.success).toBe(true)
      expect(e.line_count).toBe(1)
      expect(Number(e.total_amount)).toBe(30)
      expect(await zahl(`SELECT count(*)::text AS n FROM public.invoice_items`)).toBe(1)
    })

    it('erzeugt gar keine Rechnung, wenn alle Nachweise storniert sind', async () => {
      await nachweis({ tag: '2026-08-03', proofStatus: 'STORNIERT', billingStatus: 'STORNIERT' })
      await nachweis({ tag: '2026-08-04', proofStatus: 'STORNIERT', billingStatus: 'STORNIERT' })

      const e = await rechnungErzeugen()
      expect(String(e.fehler)).toContain('Keine abrechenbaren Leistungen')
      expect(await zahl(`SELECT count(*)::text AS n FROM public.invoices`)).toBe(0)
    })

    it('laesst den Status des stornierten Nachweises unberuehrt', async () => {
      await nachweis({ tag: '2026-08-03' })
      const storniert = await nachweis({
        tag: '2026-08-04', proofStatus: 'STORNIERT', billingStatus: 'STORNIERT',
      })

      await rechnungErzeugen()
      expect(await statusVon(storniert)).toBe('signed')
    })

    it('schliesst auch aus, wenn nur billing_status auf STORNIERT steht', async () => {
      await nachweis({ tag: '2026-08-03' })
      await nachweis({ tag: '2026-08-04', billingStatus: 'STORNIERT' })

      const e = await rechnungErzeugen()
      expect(e.line_count).toBe(1)
    })

    it('schliesst auch aus, wenn nur proof_status auf STORNIERT steht', async () => {
      await nachweis({ tag: '2026-08-03' })
      await nachweis({ tag: '2026-08-04', proofStatus: 'STORNIERT', billingStatus: 'OFFEN' })

      const e = await rechnungErzeugen()
      expect(e.line_count).toBe(1)
    })

    it('rechnet Altbestand mit NULL in beiden Storno-Feldern weiter ab', async () => {
      // Zeilen von vor Einfuehrung der Spalten. COALESCE haelt sie
      // abrechenbar — der Ausschluss greift nur auf ein ausdrueckliches
      // Storno, nicht auf eine fehlende Angabe.
      await db.query(
        `INSERT INTO public.service_records
           (client_id, organization_id, date, start_time, end_time, duration_minutes,
            service_type, budget_type, amount, status, proof_status, billing_status,
            signature_hash)
         VALUES ($1, $2, '2026-08-05', '09:00', '10:00', 60, 'Betreuung', 'entlastung',
                 30, 'signed', NULL, NULL, 'hash-echt')`,
        [CLIENT, ORG],
      )

      const e = await rechnungErzeugen()
      expect(e.success).toBe(true)
      expect(e.line_count).toBe(1)
    })

    it('zaehlt einen stornierten Nachweis nicht mehr in die Unterschriftspruefung', async () => {
      // v9 haette hier MISSING_SIGNATURE gemeldet: der stornierte Nachweis
      // ohne Unterschrift zaehlte mit. Jetzt faellt er vorher heraus.
      await nachweis({ tag: '2026-08-03' })
      await nachweis({
        tag: '2026-08-04',
        proofStatus: 'STORNIERT',
        billingStatus: 'STORNIERT',
        signatureHash: null,
      })

      const e = await rechnungErzeugen()
      expect(e.error).toBeUndefined()
      expect(e.success).toBe(true)
      expect(e.line_count).toBe(1)
    })

    it('meldet weiterhin MISSING_SIGNATURE fuer einen NICHT stornierten Nachweis ohne Unterschrift', async () => {
      await nachweis({ tag: '2026-08-03', proofStatus: 'ABGESCHLOSSEN', signatureHash: null, status: 'complete' })

      const e = await rechnungErzeugen()
      expect(e.success).toBe(false)
      expect(e.error).toBe('MISSING_SIGNATURE')
    })
  })
})
