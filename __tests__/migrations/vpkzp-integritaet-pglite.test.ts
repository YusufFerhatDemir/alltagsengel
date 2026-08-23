/**
 * PGlite: VP/KZP-Integritaetshaertung (Migration 20260929000000)
 *
 * Prueft die drei Befunde der Delta-Sicherheitspruefung vom 23.08.2026
 * gegen ein echtes PostgreSQL (PGlite/WASM, in-process):
 *
 *   1. Die Fortschreibung sperrt den Jahresstand, BEVOR sie zaehlt
 *   2. Negativbetraege sind abgewiesen
 *   3. Die Aenderungsspur nimmt nur Eintraege aus ihrem Trigger an
 *
 * ── Was hier NICHT geprueft werden kann ──────────────────────────────
 * Der Wettlauf selbst. PGlite ist eine Einzelverbindung; zwei echt
 * gleichzeitige Transaktionen sind darin nicht darstellbar. Geprueft
 * wird deshalb die Ursache statt der Wirkung: dass die Sperre waehrend
 * der Transaktion tatsaechlich gehalten wird, dass sie je Jahresstand
 * eigen ist und dass sie mit der Transaktion faellt. Genau das ist die
 * Eigenschaft, aus der die Serialisierung folgt — der Rest ergibt sich
 * aus READ COMMITTED (die wartende Transaktion liest nach dem Lock mit
 * frischem Schnappschuss).
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const BASIS     = '20260926000000_vpkzp_zeitraum_budget.sql'
const VP56      = '20260928000000_vpkzp_vp_56_tage.sql'
const HAERTUNG  = '20260929000000_vpkzp_integritaet_haertung.sql'
const ROLLBACK  = '20260929000001_rollback_vpkzp_integritaet_haertung.sql'

const ORG     = '00000000-0000-4000-8000-0000000000aa'
const KLIENT  = '00000000-0000-4000-8000-0000000000ba'
const KLIENT2 = '00000000-0000-4000-8000-0000000000bb'

let db: InstanceType<typeof PGlite>

function migration(datei: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, datei), 'utf-8')
}

async function buche(werte: Record<string, unknown> = {}): Promise<void> {
  const basis = {
    organization_id: ORG,
    client_id: KLIENT,
    art: 'verhinderungspflege',
    calendar_year: 2026,
    zeitraum_von: '2026-03-01',
    zeitraum_bis: '2026-03-01',
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

async function advisoryLocks(): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory'`,
  )
  return rows[0].n
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

  await db.exec(`
    CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
    CREATE TABLE public.clients (
      id uuid PRIMARY KEY,
      organization_id uuid REFERENCES public.organizations(id),
      first_name text, last_name text, care_level integer
    );
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    INSERT INTO public.organizations (id, name) VALUES ('${ORG}', 'Stamm');
    INSERT INTO public.clients (id, organization_id, first_name, last_name, care_level) VALUES
      ('${KLIENT}',  '${ORG}', 'Erika',  'Muster', 3),
      ('${KLIENT2}', '${ORG}', 'Zweite', 'Person', 3);
  `)

  await db.exec(migration(BASIS))
  await db.exec(migration(VP56))
  await db.exec(migration(HAERTUNG))
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

// ═══════════════════════════════════════════════════════════════════
describe('1. Wettlaufsperre auf dem Jahresstand', () => {
  it('haelt waehrend der Buchung eine Transaktions-Sperre', async () => {
    expect(await advisoryLocks()).toBe(0)

    await db.exec('BEGIN')
    await buche()
    // Waere die Sperre erst am UPDATE (oder gar nicht), stuende hier 0 —
    // und zwei gleichzeitige Buchungen haetten beide gezaehlt, bevor die
    // erste geschrieben hat.
    expect(await advisoryLocks()).toBe(1)
    await db.exec('COMMIT')

    // Transaktions-Sperre: faellt mit dem COMMIT, ohne Zutun.
    expect(await advisoryLocks()).toBe(0)
  })

  it('sperrt je Jahresstand einzeln, nicht global', async () => {
    // Zwei Klienten duerfen sich nicht gegenseitig blockieren; sonst
    // serialisiert ein Sammellauf die ganze Kartei.
    await db.exec('BEGIN')
    await buche({ client_id: KLIENT })
    await buche({ client_id: KLIENT2 })
    expect(await advisoryLocks()).toBe(2)
    await db.exec('COMMIT')

    // Dasselbe fuer zwei Kalenderjahre desselben Klienten.
    await db.exec('BEGIN')
    await buche({ calendar_year: 2025, zeitraum_von: '2025-03-01', zeitraum_bis: '2025-03-01' })
    await buche({ calendar_year: 2026, zeitraum_von: '2026-04-01', zeitraum_bis: '2026-04-01' })
    expect(await advisoryLocks()).toBe(2)
    await db.exec('COMMIT')
  })

  it('nimmt die Sperre VOR dem Zaehlen — Reihenfolge im Funktionsrumpf', async () => {
    // Die Reihenfolge ist die ganze Wirkung: eine Sperre nach dem SELECT
    // verhindert nur das gleichzeitige Schreiben, nicht das gleichzeitige
    // Zaehlen. Genau daran ist die Fassung aus 20260926000000 gescheitert.
    const { rows } = await db.query<{ prosrc: string }>(
      `SELECT prosrc FROM pg_proc WHERE proname = 'vpkzp_fortschreiben'`,
    )
    const rumpf = rows[0].prosrc
    const lock = rumpf.indexOf('pg_advisory_xact_lock')
    const zaehlen = rumpf.indexOf('count(DISTINCT tag)')
    expect(lock).toBeGreaterThan(-1)
    expect(zaehlen).toBeGreaterThan(-1)
    expect(lock).toBeLessThan(zaehlen)
  })

  it('rechnet und deckelt danach unveraendert korrekt', async () => {
    // Regression: die Sperre darf an der Fachlichkeit nichts aendern.
    await buche({ zeitraum_von: '2026-01-01', zeitraum_bis: '2026-01-10', tage: 10, budget_betrag_euro: 400 })
    await buche({ zeitraum_von: '2026-01-05', zeitraum_bis: '2026-01-14', tage: 10, budget_betrag_euro: 600 })

    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT vp_days_used, vp_amount_used, combined_budget_remaining
         FROM public.client_vpkzp_usage
        WHERE client_id = $1 AND calendar_year = 2026`,
      [KLIENT] as never[],
    )
    // 01.-14.01. = 14 eindeutige Tage, nicht 20.
    expect(rows[0].vp_days_used).toBe(14)
    expect(Number(rows[0].vp_amount_used)).toBe(1000)
    expect(Number(rows[0].combined_budget_remaining)).toBe(2539)
  })

  it('erzwingt das Kontingent weiterhin (56 Tage VP ab 2025)', async () => {
    await buche({ zeitraum_von: '2026-01-01', zeitraum_bis: '2026-02-25', tage: 56 })
    await expect(
      buche({ zeitraum_von: '2026-03-01', zeitraum_bis: '2026-03-01', tage: 1 }),
    ).rejects.toThrow(/VPKZP_TAGE_UEBERSCHRITTEN/)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('2. Negativbetraege', () => {
  it('weist einen negativen Budgetbetrag ab', async () => {
    // Ohne den CHECK senkt diese Buchung vp_amount_used und hebt damit
    // combined_budget_remaining ueber den bewilligten Jahresbetrag.
    await expect(buche({ budget_betrag_euro: -1000 }))
      .rejects.toThrow(/vpkzp_buchungen_budgetbetrag_nicht_negativ/)
  })

  it('weist einen negativen Gesamt- und Privatbetrag ab', async () => {
    await expect(buche({ betrag_euro: -1 }))
      .rejects.toThrow(/vpkzp_buchungen_betrag_nicht_negativ/)
    await expect(buche({ privat_betrag_euro: -1 }))
      .rejects.toThrow(/vpkzp_buchungen_privatbetrag_nicht_negativ/)
  })

  it('kann das Budget auch ueber Umwege nicht zurueckdrehen', async () => {
    await buche({ budget_betrag_euro: 500 })
    // Der CHECK gilt auch beim UPDATE, nicht nur beim Anlegen.
    await expect(db.exec(`UPDATE public.vpkzp_buchungen SET budget_betrag_euro = -500;`))
      .rejects.toThrow(/vpkzp_buchungen_budgetbetrag_nicht_negativ/)

    const { rows } = await db.query<{ rest: string }>(
      `SELECT combined_budget_remaining AS rest FROM public.client_vpkzp_usage WHERE client_id = $1`,
      [KLIENT] as never[],
    )
    expect(Number(rows[0].rest)).toBe(3039)
  })

  it('laesst null und positive Betraege durch', async () => {
    await buche({ budget_betrag_euro: 0 })
    await buche({ zeitraum_von: '2026-03-02', zeitraum_bis: '2026-03-02', budget_betrag_euro: 250 })
    const { rows } = await db.query<{ v: string }>(
      `SELECT vp_amount_used AS v FROM public.client_vpkzp_usage WHERE client_id = $1`,
      [KLIENT] as never[],
    )
    expect(Number(rows[0].v)).toBe(250)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('3. Aenderungsspur nimmt nur Trigger-Eintraege', () => {
  it('lehnt einen von Hand geschriebenen Eintrag ab', async () => {
    await expect(db.exec(`
      INSERT INTO public.vpkzp_audit_log (organization_id, aktion)
      VALUES ('${ORG}', 'storno');
    `)).rejects.toThrow(/VPKZP_AUDIT_NUR_AUS_TRIGGER/)
  })

  it('schreibt die echten Eintraege weiterhin', async () => {
    await buche()
    await db.exec(`UPDATE public.vpkzp_buchungen SET status = 'storniert';`)
    const { rows } = await db.query<{ aktion: string }>(
      `SELECT aktion FROM public.vpkzp_audit_log ORDER BY aktion`,
    )
    expect(rows.map(r => r.aktion)).toEqual(['anlage', 'storno'])
  })

  it('bleibt gegen Aenderung und Loeschung gesperrt', async () => {
    await buche()
    await expect(db.exec(`UPDATE public.vpkzp_audit_log SET aktion = 'anlage';`))
      .rejects.toThrow(/VPKZP_AUDIT_UNVERAENDERLICH/)
    await expect(db.exec(`DELETE FROM public.vpkzp_audit_log;`))
      .rejects.toThrow(/VPKZP_AUDIT_UNVERAENDERLICH/)
  })
})

// ═══════════════════════════════════════════════════════════════════
describe('4. Rollback', () => {
  it('nimmt CHECKs und Waechter zurueck, behaelt aber die Sperre', async () => {
    await db.exec(migration(ROLLBACK))

    const { rows: c } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_constraint
        WHERE conname LIKE 'vpkzp_buchungen_%_nicht_negativ'`,
    )
    expect(c[0].n).toBe(0)

    const { rows: t } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_trigger
        WHERE tgname = 'trg_vpkzp_audit_nur_aus_trigger'`,
    )
    expect(t[0].n).toBe(0)

    // Der Wettlauf-Fix bleibt bewusst stehen — er ist kein Merkmal,
    // dessen Ruecknahme man sich wuenschen wuerde.
    const { rows: f } = await db.query<{ prosrc: string }>(
      `SELECT prosrc FROM pg_proc WHERE proname = 'vpkzp_fortschreiben'`,
    )
    expect(f[0].prosrc).toContain('pg_advisory_xact_lock')

    // Fuer die folgenden Laeufe wieder herstellen.
    await db.exec(migration(HAERTUNG))
  })
})
