/**
 * PGlite: Rollback der beiden Phase-4-/Track-7a-Migrationen
 *
 *   20261001000000_mahnqueue_retry_dead_letter.sql
 *   20261001010000_vpkzp_mandantenpaarung.sql
 *
 * Eine Migration ohne geprueften Rueckweg ist eine Einbahnstrasse. Beide
 * Rollbacks werden hier angewendet und daran gemessen, ob sie den
 * Ausgangszustand wirklich wiederherstellen — einschliesslich des Falls,
 * der einen naiven Rollback zum Scheitern bringt: eine Zeile, die schon
 * im neuen Endzustand 'aufgegeben' steht und den wieder engen CHECK
 * verletzen wuerde.
 *
 * AUFBAU: je Migration EINE PGlite-Instanz, durch die die Tests der
 * Reihe nach hindurchlaufen (vorher → anwenden → Rollback). Eine eigene
 * Instanz je Test waere sauberer isoliert, kostet aber pro Stueck ein
 * WASM-Postgres — mit zehn davon lief diese Datei im Gesamtlauf in die
 * Zeitschranke, waehrend sie einzeln in Sekunden durch war. Die
 * Reihenfolge ist hier ohnehin die Aussage.
 */

import { PGlite } from '@electric-sql/pglite'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS = path.join(__dirname, '..', '..', 'supabase', 'migrations')
const lies = (datei: string) => fs.readFileSync(path.join(MIGRATIONS, datei), 'utf-8')

const ORG = '00000000-0000-4000-8000-0000000000aa'
const ORG_B = '00000000-0000-4000-8000-0000000000ab'
const KLIENT = '00000000-0000-4000-8000-0000000000ba'
const KLIENT_B = '00000000-0000-4000-8000-0000000000bb'
const KLIENT_OHNE_ORG = '00000000-0000-4000-8000-0000000000bf'
const RECHNUNG = '00000000-0000-4000-8000-0000000000ca'

const ROLLEN = `
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
`

const GRUNDGERUEST = `
CREATE TABLE public.organizations (id uuid PRIMARY KEY, name text);
CREATE TABLE public.clients (
  id uuid PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id),
  care_level integer
);
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
INSERT INTO public.organizations (id, name) VALUES ('${ORG}', 'A'), ('${ORG_B}', 'B');
INSERT INTO public.clients (id, organization_id, care_level) VALUES
  ('${KLIENT}', '${ORG}', 3),
  ('${KLIENT_B}', '${ORG_B}', 3),
  ('${KLIENT_OHNE_ORG}', NULL, 3);
`

/** Wie viele der genannten Spalten die Tabelle hat. */
async function spalten(db: PGlite, tabelle: string, namen: string[]): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2)`,
    [tabelle, namen] as never[],
  )
  return rows[0].n
}

// ═════════════════════════════════════════════════════════════════════
describe('Mahn-Warteschlange: Versuchsspur und Dead Letter', () => {
  const VERSUCHSSPALTEN = ['versuche', 'letzter_versuch_am', 'naechster_versuch_ab']
  let db: PGlite

  const zeile = (status: string) => db.query(
    `INSERT INTO public.dunning_email_queue
       (organization_id, invoice_id, empfaenger_email, betreff, inhalt, status)
     VALUES ('${ORG}', '${RECHNUNG}', 'e@x.org', 'Mahnung', 'Text', $1)`,
    [status] as never[],
  )

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(ROLLEN)
    await db.exec(GRUNDGERUEST)
    await db.exec(`
      CREATE TABLE public.invoices (
        id uuid PRIMARY KEY, organization_id uuid REFERENCES public.organizations(id)
      );
      CREATE TABLE public.dunning_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id uuid REFERENCES public.invoices(id)
      );
      CREATE TABLE public.dunning_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id uuid REFERENCES public.invoices(id)
      );
      INSERT INTO public.invoices (id, organization_id) VALUES ('${RECHNUNG}', '${ORG}');
    `)
    await db.exec(lies('20260918030000_dunning_email_queue.sql'))
  }, 120_000)

  afterAll(async () => { await db?.close() })

  it('1. vorher: kein Versuchszaehler, und der CHECK kennt "aufgegeben" nicht', async () => {
    expect(await spalten(db, 'dunning_email_queue', VERSUCHSSPALTEN)).toBe(0)
    await expect(zeile('aufgegeben')).rejects.toThrow()

    // Eine Bestandszeile, an der der Zaehler-Default gleich sichtbar wird.
    await zeile('wartend')
  })

  it('2. die Migration ergaenzt Spalten, Endzustand und Indizes', async () => {
    await db.exec(lies('20261001000000_mahnqueue_retry_dead_letter.sql'))

    expect(await spalten(db, 'dunning_email_queue', VERSUCHSSPALTEN)).toBe(3)

    await zeile('aufgegeben')
    await expect(zeile('irgendwas'), 'Erfundenes bleibt gesperrt').rejects.toThrow()

    const { rows: idx } = await db.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE tablename = 'dunning_email_queue'
          AND indexname IN ('idx_dunning_email_queue_wiederholbar',
                            'idx_dunning_email_queue_aufgegeben')`)
    expect(idx.length).toBe(2)
  })

  it('3. Bestandszeilen bekommen den Zaehler 0 — bewusst zu niedrig geraten', async () => {
    const { rows } = await db.query<{ versuche: number }>(
      `SELECT versuche FROM public.dunning_email_queue`)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(r => Number(r.versuche) === 0)).toBe(true)
  })

  it('4. ein negativer Versuchszaehler wird abgewiesen', async () => {
    await expect(db.query(
      `INSERT INTO public.dunning_email_queue
         (organization_id, invoice_id, empfaenger_email, betreff, inhalt, versuche)
       VALUES ('${ORG}', '${RECHNUNG}', 'e@x.org', 'M', 'T', -1)`,
    )).rejects.toThrow()
  })

  it('5. ein zweiter Lauf der Migration aendert nichts', async () => {
    await db.exec(lies('20261001000000_mahnqueue_retry_dead_letter.sql'))
    expect(await spalten(db, 'dunning_email_queue', VERSUCHSSPALTEN)).toBe(3)
  })

  it('6. der Rollback raeumt ab und rettet dabei die Dead-Letter-Zeilen', async () => {
    const vorher = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.dunning_email_queue WHERE status = 'aufgegeben'`)
    expect(Number(vorher.rows[0].n), 'ohne Dead-Letter-Zeile waere der Test wertlos')
      .toBeGreaterThan(0)

    await db.exec(lies('20261001000001_rollback_mahnqueue_retry_dead_letter.sql'))

    expect(await spalten(db, 'dunning_email_queue', VERSUCHSSPALTEN)).toBe(0)

    // Die aufgegebene Zeile steht wieder auf 'fehlgeschlagen' — sonst
    // waere sie am wieder engen CHECK haengengeblieben.
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.dunning_email_queue WHERE status = 'aufgegeben'`)
    expect(Number(rows[0].n)).toBe(0)

    await expect(zeile('aufgegeben')).rejects.toThrow()

    const { rows: idx } = await db.query(
      `SELECT 1 FROM pg_indexes WHERE tablename = 'dunning_email_queue'
         AND indexname IN ('idx_dunning_email_queue_wiederholbar',
                           'idx_dunning_email_queue_aufgegeben')`)
    expect(idx.length).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════
describe('VP/KZP: Paarung von Klient und Mandant', () => {
  let db: PGlite

  const fremdbuchung = (tag: string) => db.query(
    `INSERT INTO public.vpkzp_buchungen
       (organization_id, client_id, art, calendar_year, zeitraum_von, zeitraum_bis,
        tage, betrag_euro, budget_betrag_euro)
     VALUES ('${ORG}', '${KLIENT_B}', 'verhinderungspflege', 2026, $1, $1, 1, 70, 70)`,
    [tag] as never[],
  )

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(ROLLEN)
    await db.exec(GRUNDGERUEST)
    await db.exec(lies('20260926000000_vpkzp_zeitraum_budget.sql'))
    await db.exec(lies('20260928000000_vpkzp_vp_56_tage.sql'))
  }, 120_000)

  afterAll(async () => { await db?.close() })

  it('1. vorher geht eine Buchung ueber die Mandantengrenze durch', async () => {
    await fremdbuchung('2026-03-02')

    const { rows } = await db.query(
      `SELECT 1 FROM public.client_vpkzp_usage
        WHERE organization_id = $1 AND client_id = $2`, [ORG, KLIENT_B] as never[])
    expect(rows.length, 'genau der Befund, den die Migration schliesst').toBe(1)

    await db.exec('DELETE FROM public.vpkzp_buchungen; DELETE FROM public.client_vpkzp_usage;')
  })

  it('2. mit der Migration wird sie abgewiesen', async () => {
    await db.exec(lies('20261001010000_vpkzp_mandantenpaarung.sql'))
    await expect(fremdbuchung('2026-03-02')).rejects.toThrow(/VPKZP_MANDANT_PASST_NICHT/)
  })

  it('3. die eigene Paarung bleibt unberuehrt', async () => {
    await db.query(
      `INSERT INTO public.vpkzp_buchungen
         (organization_id, client_id, art, calendar_year, zeitraum_von, zeitraum_bis,
          tage, betrag_euro, budget_betrag_euro)
       VALUES ('${ORG}', '${KLIENT}', 'verhinderungspflege', 2026,
               '2026-03-02', '2026-03-04', 3, 210, 210)`)

    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.vpkzp_buchungen WHERE client_id = $1`,
      [KLIENT] as never[])
    expect(Number(rows[0].n)).toBe(1)
  })

  it('4. ein Klient ohne Mandanten blockiert nicht — Altbestand bleibt buchbar', async () => {
    await db.query(
      `INSERT INTO public.vpkzp_buchungen
         (organization_id, client_id, art, calendar_year, zeitraum_von, zeitraum_bis,
          tage, betrag_euro, budget_betrag_euro)
       VALUES ('${ORG}', '${KLIENT_OHNE_ORG}', 'kurzzeitpflege', 2026,
               '2026-03-02', '2026-03-04', 3, 210, 210)`)

    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.vpkzp_buchungen WHERE client_id = $1`,
      [KLIENT_OHNE_ORG] as never[])
    expect(Number(rows[0].n)).toBe(1)
  })

  it('5. der Rollback nimmt Trigger und Funktion vollstaendig zurueck', async () => {
    await db.exec(lies('20261001010001_rollback_vpkzp_mandantenpaarung.sql'))

    const { rows: fn } = await db.query(
      `SELECT 1 FROM pg_proc WHERE proname = 'trg_vpkzp_mandantenpaarung'`)
    expect(fn.length).toBe(0)

    const { rows: tg } = await db.query(
      `SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vpkzp_mandantenpaarung'`)
    expect(tg.length).toBe(0)

    // Die Basis steht noch: die Fortschreibung wirkt weiterhin.
    await fremdbuchung('2026-03-10')
    const { rows } = await db.query(
      `SELECT 1 FROM public.vpkzp_buchungen WHERE client_id = $1`, [KLIENT_B] as never[])
    expect(rows.length).toBe(1)
  })
})
