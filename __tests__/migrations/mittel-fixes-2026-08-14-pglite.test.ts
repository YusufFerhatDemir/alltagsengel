/**
 * PGlite: die fünf DB-seitigen MITTEL-Fixes vom 14.08.2026 — echter Beweis
 *
 * Die Migrationen 20260910000000 … 20260910040000 werden hier auf einer
 * echten PostgreSQL-Instanz (PGlite/WASM, in-process) angewendet und ihr
 * Verhalten geprüft — nicht ihr Quelltext.
 *
 * Quelltext-Assertions ("enthält FOR UPDATE") beweisen nur, dass jemand
 * etwas geschrieben hat. Hier wird stattdessen gegen das TATSÄCHLICH
 * angelegte Datenbankobjekt geprüft: existiert die Funktion, greift der
 * Trigger, bleibt die Kaskade heil.
 *
 * Abgedeckt:
 *   M-1  validate_correction_atomic / create_credit_note_atomic existieren
 *        und sperren mit FOR UPDATE
 *   M-2  assignment_audit_log + service_record_audit_log unveränderlich,
 *        FK-Kaskade (und damit die DSGVO-Löschung) bleibt funktionsfähig
 *   M-3  care_level ⇄ pflegegrad bidirektional synchron
 *   M-4  service_type ist nach Unterschrift gesperrt
 *   M-6  Zahlungsziel-Bereinigung trifft nur offene Rechnungen
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')

const M1 = '20260910000000_nachziehen_atomare_billing_rpcs.sql'
const M2 = '20260910010000_audit_logs_unveraenderlich.sql'
const M3 = '20260910020000_clients_pflegegrad_sync_trigger.sql'
const M4 = '20260910030000_service_record_service_type_schutz.sql'
const M6 = '20260910040000_zahlungsziel_bestandsrechnungen.sql'

const ORG_ID = '00000000-aaaa-4000-8000-000000000001'

const migration = (datei: string) =>
  fs.readFileSync(path.join(MIGRATIONS_DIR, datei), 'utf-8')

let db: InstanceType<typeof PGlite>

/** Führt SQL aus und gibt die Fehlermeldung zurück statt zu werfen. */
async function fehlerVon(sql: string, params?: unknown[]): Promise<string | null> {
  try {
    await db.query(sql, params as never[])
    return null
  } catch (e) {
    return (e as Error).message
  }
}

beforeAll(async () => {
  db = new PGlite()

  // ── 0) Supabase-Rollen (die Migrationen enthalten REVOKE … FROM anon) ──
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
      END IF;
    END $$;
  `)

  // ── 1) Minimal-Schema: nur die Tabellen, die die Migrationen anfassen ──
  //    Spaltentypen und FK-Aktionen entsprechen den echten Definitionen
  //    (20260101000000 baseline, 20260808200000, 20260808210000).
  await db.exec(`
    CREATE TABLE public.organizations (
      id   uuid PRIMARY KEY,
      name text NOT NULL DEFAULT 'Test Org'
    );

    CREATE TABLE public.clients (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid REFERENCES public.organizations(id),
      first_name      text,
      last_name       text,
      care_level      integer,
      pflegegrad      integer CHECK (pflegegrad BETWEEN 1 AND 5)
    );

    CREATE TABLE public.caregivers (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      first_name text
    );

    CREATE TABLE public.assignments (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid REFERENCES public.organizations(id)
    );

    CREATE TABLE public.service_records (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id       uuid REFERENCES public.clients(id) ON DELETE CASCADE,
      caregiver_id    uuid REFERENCES public.caregivers(id),
      date            date,
      start_time      time,
      end_time        time,
      service_type    text,
      budget_type     text,
      amount          numeric,
      notes           text,
      organization_id uuid REFERENCES public.organizations(id),
      status          text NOT NULL DEFAULT 'draft',
      proof_status    text,
      is_locked       boolean NOT NULL DEFAULT false
    );

    CREATE TABLE public.service_record_audit_log (
      id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      record_id  uuid NOT NULL REFERENCES public.service_records(id) ON DELETE CASCADE,
      action     text NOT NULL CHECK (action IN ('ERSTELLT','GEAENDERT','UNTERSCHRIEBEN','GESPERRT','STORNIERT','ENTSPERRT')),
      changed_by uuid,
      old_values jsonb,
      new_values jsonb,
      ip_address text,
      created_at timestamptz DEFAULT now() NOT NULL
    );

    CREATE TABLE public.assignment_audit_log (
      id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
      action        text NOT NULL CHECK (action IN ('ERSTELLT','GEAENDERT','STORNIERT','GESTARTET','BEENDET','NO_SHOW')),
      changed_by    uuid,
      old_values    jsonb,
      new_values    jsonb,
      created_at    timestamptz DEFAULT now() NOT NULL
    );

    CREATE TABLE public.invoices (
      id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id    uuid REFERENCES public.organizations(id),
      client_id          uuid REFERENCES public.clients(id),
      invoice_number     text,
      status             text NOT NULL DEFAULT 'entwurf',
      total_amount       numeric NOT NULL DEFAULT 0,
      paid_amount        numeric,
      payment_terms_days integer NOT NULL DEFAULT 30,
      due_date           date,
      frozen_at          timestamptz,
      period_start       date,
      period_end         date,
      created_at         timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE public.invoice_corrections (
      id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      original_invoice_id    uuid REFERENCES public.invoices(id),
      correction_type        text,
      corrected_amount_cents integer,
      deleted_at             timestamptz
    );
  `)

  // ── 2) Die zu prüfenden Migrationen, in Reihenfolge ──
  await db.exec(migration(M1))
  await db.exec(migration(M2))
  await db.exec(migration(M3))
  await db.exec(migration(M4))

  // ── 3) Trigger, die in anderen Migrationen angelegt werden ──
  //    Die Fix-Migrationen ersetzen nur die Funktionen (CREATE OR REPLACE);
  //    ohne die Trigger-Bindung wäre der Test wertlos.
  await db.exec(`
    CREATE TRIGGER trg_prevent_finalized_service_record_mutation
      BEFORE UPDATE ON public.service_records
      FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_service_record_mutation();

    CREATE TRIGGER trg_validate_invoice_status_transition
      BEFORE UPDATE ON public.invoices
      FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_status_transition();
  `)

  await db.exec(`INSERT INTO public.organizations (id) VALUES ('${ORG_ID}');`)
}, 60_000)

afterAll(async () => {
  await db?.close()
})

// ═══════════════════════════════════════════════════════════════════
// M-1 — atomare Billing-RPCs
// ═══════════════════════════════════════════════════════════════════

describe('M-1: validate_correction_atomic / create_credit_note_atomic', () => {
  const RECHNUNG = '11111111-aaaa-4000-8000-000000000001'
  const STORNIERT = '11111111-aaaa-4000-8000-000000000002'

  beforeAll(async () => {
    await db.exec(`
      INSERT INTO public.invoices (id, organization_id, status, total_amount)
      VALUES ('${RECHNUNG}',  '${ORG_ID}', 'freigegeben', 100.00),
             ('${STORNIERT}', '${ORG_ID}', 'storniert',   100.00);
    `)
  })

  it('legt beide Funktionen an (das war der Befund: sie fehlten live)', async () => {
    const { rows } = await db.query<{ proname: string }>(`
      SELECT proname FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND proname IN ('validate_correction_atomic', 'create_credit_note_atomic')
       ORDER BY proname
    `)
    expect(rows.map(r => r.proname)).toEqual([
      'create_credit_note_atomic',
      'validate_correction_atomic',
    ])
  })

  it('sperrt die Originalrechnung mit FOR UPDATE (Serialisierung)', async () => {
    // Gegen das angelegte Objekt geprüft, nicht gegen die Migrationsdatei.
    const { rows } = await db.query<{ def: string }>(`
      SELECT pg_get_functiondef(p.oid) AS def
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'validate_correction_atomic'
    `)
    expect(rows[0].def).toMatch(/FOR UPDATE/)
    expect(rows[0].def).toMatch(/SECURITY DEFINER/i)
    expect(rows[0].def).toMatch(/search_path/)
  })

  it('gibt für eine gültige Rechnung validated=true zurück', async () => {
    const { rows } = await db.query<{ r: { validated: boolean; status: string } }>(
      `SELECT public.validate_correction_atomic($1, $2) AS r`,
      [RECHNUNG, ORG_ID],
    )
    expect(rows[0].r.validated).toBe(true)
    expect(rows[0].r.status).toBe('freigegeben')
  })

  it('weist eine stornierte Rechnung ab', async () => {
    const fehler = await fehlerVon(
      `SELECT public.validate_correction_atomic($1, $2)`,
      [STORNIERT, ORG_ID],
    )
    expect(fehler).toContain('Korrektur nicht moeglich')
  })

  it('weist eine fremde Organisation ab (kein Cross-Tenant-Zugriff)', async () => {
    const fehler = await fehlerVon(
      `SELECT public.validate_correction_atomic($1, $2)`,
      [RECHNUNG, '00000000-bbbb-4000-8000-000000000009'],
    )
    expect(fehler).toContain('nicht gefunden oder falsche Organisation')
  })

  it('create_credit_note_atomic läuft überhaupt durch', async () => {
    // Regression: die Vorlage in 20260831010000 kombinierte SUM() mit
    // FOR UPDATE — PostgreSQL bricht das mit SQLSTATE 0A000 ab, die Funktion
    // wäre bei JEDEM Aufruf gestorben. Dieser Test hält das fest.
    const { rows } = await db.query<{ r: { remaining_cents: number; validated: boolean } }>(
      `SELECT public.create_credit_note_atomic($1, $2, $3, $4, $5) AS r`,
      [RECHNUNG, 5_000, 'Teilgutschrift', ORG_ID, ORG_ID],
    )
    expect(rows[0].r.validated).toBe(true)
    expect(rows[0].r.remaining_cents).toBe(10_000)
  })

  it('create_credit_note_atomic lehnt eine Gutschrift über dem Restbetrag ab', async () => {
    const fehler = await fehlerVon(
      `SELECT public.create_credit_note_atomic($1, $2, $3, $4, $5)`,
      [RECHNUNG, 20_000, 'zu viel', ORG_ID, ORG_ID],
    )
    expect(fehler).toContain('uebersteigt verfuegbaren Betrag')
  })

  it("kennt 'abgeschrieben' als Rechnungsstatus (Teil derselben Migration)", async () => {
    const fehler = await fehlerVon(`
      INSERT INTO public.invoices (organization_id, status, total_amount)
      VALUES ('${ORG_ID}', 'abgeschrieben', 1)
    `)
    expect(fehler).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════
// M-2 — Audit-Logs unveränderlich
// ═══════════════════════════════════════════════════════════════════

describe('M-2: assignment_audit_log + service_record_audit_log', () => {
  const CLIENT = '22222222-aaaa-4000-8000-000000000001'
  const RECORD = '22222222-aaaa-4000-8000-000000000002'
  const ASSIGNMENT = '22222222-aaaa-4000-8000-000000000003'

  beforeAll(async () => {
    await db.exec(`
      INSERT INTO public.clients (id, organization_id, first_name, care_level)
        VALUES ('${CLIENT}', '${ORG_ID}', 'Audit', 2);
      INSERT INTO public.service_records (id, client_id, organization_id, status, service_type)
        VALUES ('${RECORD}', '${CLIENT}', '${ORG_ID}', 'draft', 'hauswirtschaft');
      INSERT INTO public.assignments (id, organization_id)
        VALUES ('${ASSIGNMENT}', '${ORG_ID}');

      INSERT INTO public.service_record_audit_log (record_id, action)
        VALUES ('${RECORD}', 'ERSTELLT');
      INSERT INTO public.assignment_audit_log (assignment_id, action)
        VALUES ('${ASSIGNMENT}', 'ERSTELLT');
    `)
  })

  it('lässt INSERT weiterhin zu (der reguläre Schreibweg)', async () => {
    const fehler = await fehlerVon(
      `INSERT INTO public.service_record_audit_log (record_id, action) VALUES ($1, 'GEAENDERT')`,
      [RECORD],
    )
    expect(fehler).toBeNull()
  })

  it('blockiert UPDATE auf service_record_audit_log', async () => {
    const fehler = await fehlerVon(
      `UPDATE public.service_record_audit_log SET action = 'STORNIERT' WHERE record_id = $1`,
      [RECORD],
    )
    expect(fehler).toContain('unveraenderlich')
  })

  it('blockiert UPDATE auf assignment_audit_log', async () => {
    const fehler = await fehlerVon(
      `UPDATE public.assignment_audit_log SET action = 'STORNIERT' WHERE assignment_id = $1`,
      [ASSIGNMENT],
    )
    expect(fehler).toContain('unveraenderlich')
  })

  it('blockiert das gezielte Löschen einer Audit-Zeile', async () => {
    const sr = await fehlerVon(
      `DELETE FROM public.service_record_audit_log WHERE record_id = $1`,
      [RECORD],
    )
    expect(sr).toContain('unveraenderlich')

    const as = await fehlerVon(
      `DELETE FROM public.assignment_audit_log WHERE assignment_id = $1`,
      [ASSIGNMENT],
    )
    expect(as).toContain('unveraenderlich')
  })

  it('lässt die FK-Kaskade durch — sonst wäre die DSGVO-Löschung blockiert', async () => {
    // Genau die Kette der Kontolöschung: clients → service_records → Audit-Log.
    const fehler = await fehlerVon(`DELETE FROM public.clients WHERE id = $1`, [CLIENT])
    expect(fehler).toBeNull()

    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.service_record_audit_log WHERE record_id = $1`,
      [RECORD],
    )
    expect(rows[0].n).toBe(0)
  })

  it('lässt die Kaskade auch beim Einsatz durch', async () => {
    const fehler = await fehlerVon(`DELETE FROM public.assignments WHERE id = $1`, [ASSIGNMENT])
    expect(fehler).toBeNull()

    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.assignment_audit_log WHERE assignment_id = $1`,
      [ASSIGNMENT],
    )
    expect(rows[0].n).toBe(0)
  })

  it('setzt search_path auf beiden Trigger-Funktionen (SECURITY DEFINER)', async () => {
    const { rows } = await db.query<{ proname: string; cfg: string[] | null }>(`
      SELECT proname, proconfig AS cfg
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND proname IN ('prevent_service_record_audit_edit', 'prevent_assignment_audit_edit')
    `)
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect((r.cfg ?? []).join(',')).toContain('search_path')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
// M-3 — care_level ⇄ pflegegrad
// ═══════════════════════════════════════════════════════════════════

describe('M-3: Pflegegrad-Sync auf clients', () => {
  async function leseKlient(id: string) {
    const { rows } = await db.query<{ care_level: number | null; pflegegrad: number | null }>(
      `SELECT care_level, pflegegrad FROM public.clients WHERE id = $1`,
      [id],
    )
    return rows[0]
  }

  async function anlegen(care: number | null, pfg: number | null): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO public.clients (organization_id, first_name, care_level, pflegegrad)
       VALUES ($1, 'Sync', $2, $3) RETURNING id`,
      [ORG_ID, care, pfg],
    )
    return rows[0].id
  }

  it('INSERT nur mit care_level → pflegegrad wird gesetzt', async () => {
    const id = await anlegen(3, null)
    expect(await leseKlient(id)).toEqual({ care_level: 3, pflegegrad: 3 })
  })

  it('INSERT nur mit pflegegrad → care_level wird gesetzt', async () => {
    const id = await anlegen(null, 4)
    expect(await leseKlient(id)).toEqual({ care_level: 4, pflegegrad: 4 })
  })

  it('INSERT mit widersprüchlichen Werten → care_level führt', async () => {
    const id = await anlegen(2, 5)
    expect(await leseKlient(id)).toEqual({ care_level: 2, pflegegrad: 2 })
  })

  it('UPDATE von care_level zieht pflegegrad nach', async () => {
    const id = await anlegen(2, 2)
    await db.query(`UPDATE public.clients SET care_level = 5 WHERE id = $1`, [id])
    expect(await leseKlient(id)).toEqual({ care_level: 5, pflegegrad: 5 })
  })

  it('UPDATE von pflegegrad zieht care_level nach (Gegenrichtung)', async () => {
    const id = await anlegen(2, 2)
    await db.query(`UPDATE public.clients SET pflegegrad = 4 WHERE id = $1`, [id])
    expect(await leseKlient(id)).toEqual({ care_level: 4, pflegegrad: 4 })
  })

  it('UPDATE beider Spalten auf verschiedene Werte → care_level führt', async () => {
    const id = await anlegen(2, 2)
    await db.query(
      `UPDATE public.clients SET care_level = 3, pflegegrad = 5 WHERE id = $1`,
      [id],
    )
    expect(await leseKlient(id)).toEqual({ care_level: 3, pflegegrad: 3 })
  })

  it('care_level auf NULL setzen leert auch pflegegrad', async () => {
    const id = await anlegen(3, 3)
    await db.query(`UPDATE public.clients SET care_level = NULL WHERE id = $1`, [id])
    expect(await leseKlient(id)).toEqual({ care_level: null, pflegegrad: null })
  })

  it('care_level ausserhalb 1..5 bricht den Schreibvorgang NICHT', async () => {
    // Der CHECK auf pflegegrad (1..5) darf keinen Klienten-INSERT killen.
    const id = await anlegen(0, null)
    expect(await leseKlient(id)).toEqual({ care_level: 0, pflegegrad: null })

    const fehler = await fehlerVon(
      `UPDATE public.clients SET care_level = 9 WHERE id = $1`, [id],
    )
    expect(fehler).toBeNull()
    expect(await leseKlient(id)).toEqual({ care_level: 9, pflegegrad: null })
  })

  it('Updates an anderen Spalten lassen beide Werte unangetastet', async () => {
    const id = await anlegen(3, 3)
    await db.query(`UPDATE public.clients SET last_name = 'Neu' WHERE id = $1`, [id])
    expect(await leseKlient(id)).toEqual({ care_level: 3, pflegegrad: 3 })
  })
})

// ═══════════════════════════════════════════════════════════════════
// M-4 — service_type nach Unterschrift gesperrt
// ═══════════════════════════════════════════════════════════════════

describe('M-4: prevent_finalized_service_record_mutation schützt service_type', () => {
  const CLIENT = '44444444-aaaa-4000-8000-000000000001'

  beforeAll(async () => {
    await db.exec(`
      INSERT INTO public.clients (id, organization_id, first_name, care_level)
        VALUES ('${CLIENT}', '${ORG_ID}', 'Nachweis', 3);
    `)
  })

  async function nachweis(status: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO public.service_records
         (client_id, organization_id, status, service_type, budget_type, amount, date)
       VALUES ($1, $2, $3, 'hauswirtschaft', 'entlastung', 40, DATE '2026-08-01')
       RETURNING id`,
      [CLIENT, ORG_ID, status],
    )
    return rows[0].id
  }

  it('blockiert die Änderung der Leistungsart bei status = signed', async () => {
    const id = await nachweis('signed')
    const fehler = await fehlerVon(
      `UPDATE public.service_records SET service_type = 'grosse_koerperpflege' WHERE id = $1`,
      [id],
    )
    expect(fehler).toContain('unveraenderlich')
  })

  it('blockiert die Änderung der Leistungsart bei status = invoiced', async () => {
    const id = await nachweis('invoiced')
    const fehler = await fehlerVon(
      `UPDATE public.service_records SET service_type = 'grosse_koerperpflege' WHERE id = $1`,
      [id],
    )
    expect(fehler).toContain('unveraenderlich')
  })

  it('lässt die Leistungsart vor der Unterschrift zu', async () => {
    const id = await nachweis('complete')
    const fehler = await fehlerVon(
      `UPDATE public.service_records SET service_type = 'grosse_koerperpflege' WHERE id = $1`,
      [id],
    )
    expect(fehler).toBeNull()
  })

  it('lässt Freitext auch nach der Unterschrift zu', async () => {
    const id = await nachweis('invoiced')
    const fehler = await fehlerVon(
      `UPDATE public.service_records SET notes = 'Nachtrag' WHERE id = $1`,
      [id],
    )
    expect(fehler).toBeNull()
  })

  it('lässt den Storno-Weg offen', async () => {
    const id = await nachweis('signed')
    const fehler = await fehlerVon(
      `UPDATE public.service_records SET proof_status = 'STORNIERT' WHERE id = $1`,
      [id],
    )
    expect(fehler).toBeNull()
  })

  it('schützt weiterhin die bereits gesperrten Felder', async () => {
    const id = await nachweis('signed')
    for (const spalte of ['amount = 999', "budget_type = 'private'", "date = DATE '2026-08-02'"]) {
      const fehler = await fehlerVon(
        `UPDATE public.service_records SET ${spalte} WHERE id = $1`, [id],
      )
      expect(fehler, spalte).toContain('unveraenderlich')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════
// M-6 — Zahlungsziel-Bereinigung
// ═══════════════════════════════════════════════════════════════════

describe('M-6: Zahlungsziel offener Bestandsrechnungen', () => {
  type Zeile = { invoice_number: string; payment_terms_days: number; due_date: string }

  const stand = async (): Promise<Record<string, Zeile>> => {
    const { rows } = await db.query<Zeile>(`
      SELECT invoice_number, payment_terms_days, to_char(due_date, 'YYYY-MM-DD') AS due_date
        FROM public.invoices WHERE invoice_number IS NOT NULL
    `)
    return Object.fromEntries(rows.map(r => [r.invoice_number, r]))
  }

  beforeAll(async () => {
    // Der reale Live-Bestand vom 14.08.2026, 1:1 nachgestellt.
    await db.exec(`
      INSERT INTO public.invoices
        (organization_id, invoice_number, status, total_amount, paid_amount,
         payment_terms_days, due_date, created_at)
      VALUES
        ('${ORG_ID}', 'RE-2026-0001',     'sent',     187.00, NULL,   30, DATE '2026-08-01', TIMESTAMPTZ '2026-07-02 20:20:13+00'),
        ('${ORG_ID}', 'RE-2026-0002',     'disputed', 1064.00, 912.00, 30, DATE '2026-08-01', TIMESTAMPTZ '2026-07-02 20:20:14+00'),
        ('${ORG_ID}', 'RE-2026-0003',     'paid',     650.00, 650.00, 30, DATE '2026-08-01', TIMESTAMPTZ '2026-07-02 20:20:14+00'),
        ('${ORG_ID}', 'RG-2026-TEST-001', 'sent',      43.50, NULL,   30, DATE '2026-08-30', TIMESTAMPTZ '2026-07-31 19:11:53+00'),
        ('${ORG_ID}', 'RG-2026-TEST-002', 'sent',      70.00, NULL,   30, DATE '2026-08-30', TIMESTAMPTZ '2026-07-31 19:11:53+00');
    `)
    await db.exec(migration(M6))
  })

  it('setzt offene Rechnungen ohne Zahlungseingang auf 14 Tage', async () => {
    const s = await stand()
    expect(s['RE-2026-0001'].payment_terms_days).toBe(14)
    expect(s['RG-2026-TEST-001'].payment_terms_days).toBe(14)
    expect(s['RG-2026-TEST-002'].payment_terms_days).toBe(14)
  })

  it('zieht due_date konsistent mit (Rechnungsdatum + 14)', async () => {
    const s = await stand()
    expect(s['RE-2026-0001'].due_date).toBe('2026-07-16')       // 02.07. + 14
    expect(s['RG-2026-TEST-001'].due_date).toBe('2026-08-14')   // 31.07. + 14
    expect(s['RG-2026-TEST-002'].due_date).toBe('2026-08-14')
  })

  it('lässt die bezahlte Rechnung unangetastet', async () => {
    const s = await stand()
    expect(s['RE-2026-0003'].payment_terms_days).toBe(30)
    expect(s['RE-2026-0003'].due_date).toBe('2026-08-01')
  })

  it('lässt die strittige, teilbezahlte Rechnung unangetastet', async () => {
    const s = await stand()
    expect(s['RE-2026-0002'].payment_terms_days).toBe(30)
    expect(s['RE-2026-0002'].due_date).toBe('2026-08-01')
  })

  it('ist idempotent: zweiter Lauf ändert nichts mehr', async () => {
    const vorher = await stand()
    await db.exec(migration(M6))
    expect(await stand()).toEqual(vorher)
  })

  it('fasst einen frischen Entwurf nicht an', async () => {
    await db.exec(`
      INSERT INTO public.invoices (organization_id, invoice_number, status, payment_terms_days)
      VALUES ('${ORG_ID}', 'RE-ENTWURF', 'entwurf', 30);
    `)
    await db.exec(migration(M6))
    const s = await stand()
    expect(s['RE-ENTWURF'].payment_terms_days).toBe(30)
  })
})
