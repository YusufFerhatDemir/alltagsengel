/**
 * PGlite: VP/KZP-Zeitraeume und Budget (Migration 20260926000000)
 *
 * Die Migration wird auf einer echten PostgreSQL-Instanz (PGlite/WASM,
 * in-process) angewendet und ihr VERHALTEN geprueft — nicht nur, dass die
 * Tabellen da sind. Der Kern sind die Trigger: sie sind die einzige
 * Sperre, die auch bei direktem PostgREST-Schreibzugriff haelt.
 *
 * Geprueft:
 *   1. Tabellen, RLS, Policies (Admin + RESTRICTIVE org_fence)
 *   2. Jahresgrenze: eine Buchung darf ihr Kalenderjahr nicht verlassen
 *   3. Fortschreibung: Jahresstand entsteht und stimmt
 *   4. Eindeutige Tage: Mehrfachleistung am selben Tag zaehlt einmal
 *   5. Tagekontingent 42/56 wird erzwungen
 *   6. combined_budget_remaining ist generiert und nie negativ
 *   7. Der Jahresstand ist nicht von Hand setzbar
 *   8. Storno und Loeschung schreiben zurueck
 *   9. Aenderungsspur entsteht und ist unveraenderlich
 *  10. Rollback raeumt vollstaendig ab
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const MIGRATION = '20260926000000_vpkzp_zeitraum_budget.sql'
const ROLLBACK = '20260926000001_rollback_vpkzp_zeitraum_budget.sql'

const ORG = '00000000-0000-4000-8000-0000000000aa'
const ORG_B = '00000000-0000-4000-8000-0000000000ab'
const KLIENT = '00000000-0000-4000-8000-0000000000ba'
const KLIENT_B = '00000000-0000-4000-8000-0000000000bb'

let db: InstanceType<typeof PGlite>

async function buche(werte: Record<string, unknown>): Promise<void> {
  const basis = {
    organization_id: ORG,
    client_id: KLIENT,
    art: 'verhinderungspflege',
    calendar_year: 2026,
    tage: 1,
    betrag_euro: 0,
    budget_betrag_euro: 0,
    ...werte,
  }
  const spalten = Object.keys(basis)
  const platzhalter = spalten.map((_, i) => `$${i + 1}`).join(', ')
  await db.query(
    `INSERT INTO public.vpkzp_buchungen (${spalten.join(', ')}) VALUES (${platzhalter})`,
    Object.values(basis) as never[],
  )
}

async function stand(jahr = 2026, klient = KLIENT, org = ORG) {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT vp_days_used, kzp_days_used, vp_amount_used, kzp_amount_used,
            combined_budget_total, combined_budget_remaining
       FROM public.client_vpkzp_usage
      WHERE organization_id = $1 AND client_id = $2 AND calendar_year = $3`,
    [org, klient, jahr] as never[],
  )
  return rows[0] ?? null
}

beforeAll(async () => {
  db = new PGlite()

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

  // Bestandsvoraussetzungen — minimal, aber mit denselben Schluesseln wie
  // live, damit die Fremdschluessel echt greifen.
  await db.exec(`
    CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
    CREATE TABLE public.clients (
      id uuid PRIMARY KEY,
      organization_id uuid REFERENCES public.organizations(id),
      first_name text, last_name text, care_level integer
    );
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    INSERT INTO public.organizations (id, name) VALUES
      ('${ORG}', 'Stamm'), ('${ORG_B}', 'Zweiter Mandant');
    INSERT INTO public.clients (id, organization_id, first_name, last_name, care_level) VALUES
      ('${KLIENT}', '${ORG}', 'Erika', 'Muster', 3),
      ('${KLIENT_B}', '${ORG_B}', 'Fremd', 'Mandant', 3);
  `)

  await db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf-8'))
})

afterAll(async () => {
  await db?.close()
})

beforeEach(async () => {
  await db.exec('DELETE FROM public.vpkzp_buchungen;')
  await db.exec('ALTER TABLE public.vpkzp_audit_log DISABLE TRIGGER trg_vpkzp_audit_unveraenderlich;')
  await db.exec('DELETE FROM public.vpkzp_audit_log;')
  await db.exec('ALTER TABLE public.vpkzp_audit_log ENABLE TRIGGER trg_vpkzp_audit_unveraenderlich;')
  await db.exec('DELETE FROM public.client_vpkzp_usage;')
})

describe('1. Struktur, RLS und Policies', () => {
  it('legt alle drei Tabellen mit aktivierter RLS an', async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT relname, relrowsecurity FROM pg_class
        WHERE relname IN ('vpkzp_buchungen', 'client_vpkzp_usage', 'vpkzp_audit_log')
        ORDER BY relname`,
    )
    expect(rows.map(r => r.relname)).toEqual([
      'client_vpkzp_usage', 'vpkzp_audit_log', 'vpkzp_buchungen',
    ])
    expect(rows.every(r => r.relrowsecurity)).toBe(true)
  })

  it('setzt die Mandantengrenze als RESTRICTIVE Policy', async () => {
    // permissive wird geprueft und nicht geraten: eine PERMISSIVE
    // org_fence-Policy waere wirkungslos, weil die Admin-Policy sie
    // per ODER wieder aufmacht.
    const { rows } = await db.query<{ tablename: string; permissive: string }>(
      `SELECT tablename, permissive FROM pg_policies
        WHERE policyname LIKE 'org_fence_%' ORDER BY tablename`,
    )
    expect(rows).toHaveLength(3)
    expect(rows.every(r => r.permissive === 'RESTRICTIVE')).toBe(true)
  })

  it('entzieht anon jeden Tabellenzugriff', async () => {
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.role_table_grants
        WHERE grantee = 'anon'
          AND table_name IN ('vpkzp_buchungen', 'client_vpkzp_usage', 'vpkzp_audit_log')`,
    )
    expect(rows[0].n).toBe(0)
  })

  it('macht vpkzp_fortschreiben nicht fuer anon ausfuehrbar', async () => {
    const { rows } = await db.query<{ ok: boolean }>(
      `SELECT has_function_privilege('anon', 'public.vpkzp_fortschreiben(uuid,uuid,integer,boolean)', 'EXECUTE') AS ok`,
    )
    expect(rows[0].ok).toBe(false)
  })
})

describe('2. Jahresgrenze', () => {
  it('lehnt eine Buchung ab, die ihr Kalenderjahr verlaesst', async () => {
    // Ohne diesen CHECK koennte ein Zeitraum ueber den Jahreswechsel
    // komplett einem Jahr zugeschlagen werden: Summe stimmt, beide
    // Jahresstaende falsch.
    await expect(buche({
      calendar_year: 2025, zeitraum_von: '2025-12-27', zeitraum_bis: '2026-01-09', tage: 14,
    })).rejects.toThrow(/vpkzp_buchungen_im_kalenderjahr/)
  })

  it('nimmt die zerlegten Segmente an', async () => {
    await buche({ calendar_year: 2025, zeitraum_von: '2025-12-27', zeitraum_bis: '2025-12-31', tage: 5 })
    await buche({ calendar_year: 2026, zeitraum_von: '2026-01-01', zeitraum_bis: '2026-01-09', tage: 9 })
    expect((await stand(2025))?.vp_days_used).toBe(5)
    expect((await stand(2026))?.vp_days_used).toBe(9)
  })

  it('lehnt einen verdrehten Zeitraum ab', async () => {
    await expect(buche({
      zeitraum_von: '2026-05-10', zeitraum_bis: '2026-05-01',
    })).rejects.toThrow(/vpkzp_buchungen_zeitraum_richtung/)
  })
})

describe('3. Fortschreibung des Jahresstands', () => {
  it('legt die Standzeile beim ersten Beleg an', async () => {
    expect(await stand()).toBeNull()
    await buche({
      zeitraum_von: '2026-05-01', zeitraum_bis: '2026-05-07', tage: 7,
      betrag_euro: 350, budget_betrag_euro: 350,
    })
    const s = await stand()
    expect(s?.vp_days_used).toBe(7)
    expect(Number(s?.vp_amount_used)).toBe(350)
    expect(Number(s?.combined_budget_total)).toBe(3539)
  })

  it('haelt VP und KZP in getrennten Spalten', async () => {
    await buche({
      art: 'verhinderungspflege', zeitraum_von: '2026-03-01', zeitraum_bis: '2026-03-05',
      tage: 5, budget_betrag_euro: 250,
    })
    await buche({
      art: 'kurzzeitpflege', zeitraum_von: '2026-06-01', zeitraum_bis: '2026-06-10',
      tage: 10, budget_betrag_euro: 800,
    })
    const s = await stand()
    expect(s?.vp_days_used).toBe(5)
    expect(s?.kzp_days_used).toBe(10)
    expect(Number(s?.vp_amount_used)).toBe(250)
    expect(Number(s?.kzp_amount_used)).toBe(800)
  })
})

describe('4. Eindeutige Tage', () => {
  it('zaehlt einen Tag mit zwei Buchungen nur einmal', async () => {
    // sum(tage) waere hier 10 — das Kontingent waere doppelt so schnell leer.
    await buche({ zeitraum_von: '2026-04-01', zeitraum_bis: '2026-04-05', tage: 5, budget_betrag_euro: 100 })
    await buche({ zeitraum_von: '2026-04-03', zeitraum_bis: '2026-04-07', tage: 5, budget_betrag_euro: 100 })
    const s = await stand()
    expect(s?.vp_days_used).toBe(7)
    // Das GELD dagegen wird zweimal verbraucht — es sind zwei Leistungen.
    expect(Number(s?.vp_amount_used)).toBe(200)
  })
})

describe('5. Tagekontingent', () => {
  it('erzwingt 42 Tage Verhinderungspflege', async () => {
    await buche({ zeitraum_von: '2026-01-01', zeitraum_bis: '2026-02-11', tage: 42 })
    expect((await stand())?.vp_days_used).toBe(42)
    await expect(buche({
      zeitraum_von: '2026-03-01', zeitraum_bis: '2026-03-01', tage: 1,
    })).rejects.toThrow(/VPKZP_TAGE_UEBERSCHRITTEN/)
  })

  it('erzwingt 56 Tage Kurzzeitpflege', async () => {
    await buche({
      art: 'kurzzeitpflege', zeitraum_von: '2026-01-01', zeitraum_bis: '2026-02-25', tage: 56,
    })
    await expect(buche({
      art: 'kurzzeitpflege', zeitraum_von: '2026-04-01', zeitraum_bis: '2026-04-01', tage: 1,
    })).rejects.toThrow(/VPKZP_TAGE_UEBERSCHRITTEN/)
  })

  it('haelt die Kontingente getrennt: volle VP-Tage sperren KZP nicht', async () => {
    await buche({ zeitraum_von: '2026-01-01', zeitraum_bis: '2026-02-11', tage: 42 })
    await buche({
      art: 'kurzzeitpflege', zeitraum_von: '2026-07-01', zeitraum_bis: '2026-07-14', tage: 14,
    })
    const s = await stand()
    expect(s?.vp_days_used).toBe(42)
    expect(s?.kzp_days_used).toBe(14)
  })

  it('rechnet das Kontingent je Kalenderjahr neu', async () => {
    await buche({ calendar_year: 2025, zeitraum_von: '2025-11-20', zeitraum_bis: '2025-12-31', tage: 42 })
    // Dasselbe Kontingent steht 2026 wieder voll zur Verfuegung.
    await buche({ calendar_year: 2026, zeitraum_von: '2026-01-01', zeitraum_bis: '2026-02-11', tage: 42 })
    expect((await stand(2025))?.vp_days_used).toBe(42)
    expect((await stand(2026))?.vp_days_used).toBe(42)
  })

  it('lehnt Jahre ohne hinterlegtes Kontingent ab', async () => {
    await expect(buche({
      calendar_year: 2023, zeitraum_von: '2023-05-01', zeitraum_bis: '2023-05-02', tage: 2,
    })).rejects.toThrow(/calendar_year|VPKZP_JAHR_OHNE_KONTINGENT/)
  })
})

describe('6. Restbetrag', () => {
  it('ist generiert und folgt dem Verbrauch', async () => {
    await buche({
      zeitraum_von: '2026-05-01', zeitraum_bis: '2026-05-05', tage: 5, budget_betrag_euro: 1000,
    })
    expect(Number((await stand())?.combined_budget_remaining)).toBe(2539)
  })

  it('mindert VP und KZP denselben Topf', async () => {
    await buche({ zeitraum_von: '2026-05-01', zeitraum_bis: '2026-05-05', tage: 5, budget_betrag_euro: 1500 })
    await buche({
      art: 'kurzzeitpflege', zeitraum_von: '2026-08-01', zeitraum_bis: '2026-08-05',
      tage: 5, budget_betrag_euro: 1500,
    })
    expect(Number((await stand())?.combined_budget_remaining)).toBe(539)
  })

  it('wird nie negativ', async () => {
    await buche({
      zeitraum_von: '2026-05-01', zeitraum_bis: '2026-05-05', tage: 5, budget_betrag_euro: 5000,
    })
    expect(Number((await stand())?.combined_budget_remaining)).toBe(0)
  })
})

describe('7. Der Jahresstand ist abgeleitet', () => {
  it('laesst sich nicht von Hand setzen', async () => {
    await buche({ zeitraum_von: '2026-05-01', zeitraum_bis: '2026-05-02', tage: 2, budget_betrag_euro: 100 })
    await expect(db.exec(
      `UPDATE public.client_vpkzp_usage SET vp_days_used = 0 WHERE client_id = '${KLIENT}';`,
    )).rejects.toThrow(/VPKZP_STAND_ABGELEITET/)
  })

  it('laesst die Bewilligung der Kasse aendern', async () => {
    await buche({ zeitraum_von: '2026-05-01', zeitraum_bis: '2026-05-02', tage: 2, budget_betrag_euro: 100 })
    await db.exec(
      `UPDATE public.client_vpkzp_usage SET combined_budget_total = 2000 WHERE client_id = '${KLIENT}';`,
    )
    const s = await stand()
    expect(Number(s?.combined_budget_total)).toBe(2000)
    expect(Number(s?.combined_budget_remaining)).toBe(1900)
  })
})

describe('8. Storno und Loeschung', () => {
  it('gibt Tage und Betrag beim Storno wieder frei', async () => {
    await buche({
      zeitraum_von: '2026-05-01', zeitraum_bis: '2026-05-10', tage: 10, budget_betrag_euro: 500,
    })
    expect((await stand())?.vp_days_used).toBe(10)

    await db.exec(`UPDATE public.vpkzp_buchungen SET status = 'storniert';`)
    const s = await stand()
    expect(s?.vp_days_used).toBe(0)
    expect(Number(s?.vp_amount_used)).toBe(0)
    expect(Number(s?.combined_budget_remaining)).toBe(3539)
  })

  it('schreibt beim Loeschen zurueck, ohne die Standzeile neu anzulegen', async () => {
    await buche({
      zeitraum_von: '2026-05-01', zeitraum_bis: '2026-05-10', tage: 10, budget_betrag_euro: 500,
    })
    await db.exec('DELETE FROM public.vpkzp_buchungen;')
    expect((await stand())?.vp_days_used).toBe(0)

    // Auf dem Loeschweg entsteht keine Zeile, wo keine war.
    await db.exec('DELETE FROM public.client_vpkzp_usage;')
    await buche({ zeitraum_von: '2026-06-01', zeitraum_bis: '2026-06-02', tage: 2 })
    await db.exec('DELETE FROM public.client_vpkzp_usage;')
    await db.exec('DELETE FROM public.vpkzp_buchungen;')
    expect(await stand()).toBeNull()
  })

  it('laesst das Loeschen eines Klienten kaskadieren', async () => {
    // Ein unbedingtes RAISE in einem BEFORE-DELETE-Trigger wuerde die
    // DSGVO-Kaskade blockieren. Dieser Test haelt fest, dass sie durchgeht.
    await db.exec(`
      INSERT INTO public.clients (id, organization_id, first_name, last_name, care_level)
      VALUES ('00000000-0000-4000-8000-0000000000cc', '${ORG}', 'Weg', 'Damit', 3);
    `)
    await buche({
      client_id: '00000000-0000-4000-8000-0000000000cc',
      zeitraum_von: '2026-05-01', zeitraum_bis: '2026-05-03', tage: 3,
    })
    await db.exec(`DELETE FROM public.clients WHERE id = '00000000-0000-4000-8000-0000000000cc';`)
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.vpkzp_buchungen
        WHERE client_id = '00000000-0000-4000-8000-0000000000cc'`,
    )
    expect(rows[0].n).toBe(0)
  })
})

describe('9. Aenderungsspur', () => {
  it('protokolliert Anlage, Aenderung und Storno', async () => {
    await buche({ zeitraum_von: '2026-05-01', zeitraum_bis: '2026-05-03', tage: 3 })
    await db.exec(`UPDATE public.vpkzp_buchungen SET notiz = 'korrigiert';`)
    await db.exec(`UPDATE public.vpkzp_buchungen SET status = 'storniert';`)

    const { rows } = await db.query<{ aktion: string }>(
      `SELECT aktion FROM public.vpkzp_audit_log ORDER BY created_at, aktion`,
    )
    expect(rows.map(r => r.aktion).sort()).toEqual(['aenderung', 'anlage', 'storno'])
  })

  it('haelt den Zustand vorher und nachher fest', async () => {
    await buche({ zeitraum_von: '2026-05-01', zeitraum_bis: '2026-05-03', tage: 3 })
    const { rows } = await db.query<{ vorher: unknown; nachher: Record<string, unknown> }>(
      `SELECT vorher, nachher FROM public.vpkzp_audit_log WHERE aktion = 'anlage'`,
    )
    expect(rows[0].vorher).toBeNull()
    expect(rows[0].nachher.tage).toBe(3)
  })

  it('ist unveraenderlich', async () => {
    await buche({ zeitraum_von: '2026-05-01', zeitraum_bis: '2026-05-03', tage: 3 })
    await expect(db.exec(`UPDATE public.vpkzp_audit_log SET aktion = 'anlage';`))
      .rejects.toThrow(/VPKZP_AUDIT_UNVERAENDERLICH/)
    await expect(db.exec('DELETE FROM public.vpkzp_audit_log;'))
      .rejects.toThrow(/VPKZP_AUDIT_UNVERAENDERLICH/)
  })
})

describe('10. Mandantentrennung', () => {
  it('haelt Jahresstaende getrennt, auch bei gleichem Jahr', async () => {
    await buche({ zeitraum_von: '2026-05-01', zeitraum_bis: '2026-05-05', tage: 5, budget_betrag_euro: 300 })
    await buche({
      organization_id: ORG_B, client_id: KLIENT_B,
      zeitraum_von: '2026-05-01', zeitraum_bis: '2026-05-20', tage: 20, budget_betrag_euro: 900,
    })
    expect((await stand(2026, KLIENT, ORG))?.vp_days_used).toBe(5)
    expect((await stand(2026, KLIENT_B, ORG_B))?.vp_days_used).toBe(20)
  })

  it('verlangt einen Mandanten an jeder Zeile', async () => {
    await expect(buche({ organization_id: null, zeitraum_von: '2026-05-01', zeitraum_bis: '2026-05-01' }))
      .rejects.toThrow(/organization_id/)
  })
})

describe('11. Rollback', () => {
  it('raeumt Tabellen, Funktionen und Trigger vollstaendig ab', async () => {
    const rollback = new PGlite()
    await rollback.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
      END $$;
      CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
      CREATE TABLE public.clients (id uuid PRIMARY KEY, organization_id uuid, first_name text, last_name text, care_level integer);
      CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
      CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    `)
    await rollback.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION), 'utf-8'))
    await rollback.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, ROLLBACK), 'utf-8'))

    const { rows: tabellen } = await rollback.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('vpkzp_buchungen', 'client_vpkzp_usage', 'vpkzp_audit_log')`,
    )
    expect(tabellen[0].n).toBe(0)

    const { rows: funktionen } = await rollback.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname LIKE 'vpkzp%'
           OR (n.nspname = 'public' AND p.proname LIKE 'trg_vpkzp%')`,
    )
    expect(funktionen[0].n).toBe(0)

    await rollback.close()
  })
})
