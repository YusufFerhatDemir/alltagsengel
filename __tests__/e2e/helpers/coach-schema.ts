/**
 * Schema-Aufbau für die DiPA-/PflegeCoach-Kette auf PGlite
 * ═════════════════════════════════════════════════════════════════════
 *
 * Eigener Helfer statt eines weiteren Abschnitts in `kette-schema.ts`:
 * Das dortige Schema ist die BETRIEBS-Datenbank (Klienten, Rechnungen,
 * Mandanten, org_fence). Der PflegeCoach ist bewusst davon getrennt —
 * `coach_*` trägt keine `organization_id` und keine `is_admin()`-Policy,
 * weil es Nutzer-eigene Gesundheitsdaten sind und keine Mandanten-
 * Betriebsdaten (so ausdrücklich im Kopf von 20260819010000). Die beiden
 * Schemata in einer Datei zu mischen, würde genau diese Produktgrenze
 * verwischen.
 *
 * WORTGLEICH aus den Migrationen geschnitten (`tabelleAusMigration`,
 * `funktionAusMigration`) sind: coach_users, coach_freischaltcodes,
 * coach_freischaltungen, coach_bestellungen, coach_zahlungen,
 * coach_rechnungen, coach_set_updated_at, coach_naechste_rechnungsnummer.
 * Damit gilt hier NICHT der Fehler aus
 * memory/testschema-lockerer-als-produktion: ein von Hand nachgebautes
 * Testschema ohne die echten CHECK-Constraints hält kaputte Pfade
 * wochenlang grün.
 *
 * Alles, was NICHT aus einer Migration stammt, steht unten unter NACHZUG —
 * mit Quellenangabe je Zeile.
 */

import { PGlite } from '@electric-sql/pglite'
import { tabelleAusMigration, funktionAusMigration } from '../../helpers/sql-extract'

const M_DIPA        = '20260819010000_pflegecoach_dipa_modul.sql'
const M_FREISCHALT  = '20260826010000_dipa_freischaltung_nachweise_eul.sql'
const M_SELBSTZAHL  = '20260907000100_coach_selbstzahler.sql'
const M_FS_UNIQUE   = '20261009000002_coach_freischaltung_bestellung_unique.sql'

/**
 * Grundgerüst: Rollen und auth-Schema. Bewusst schmal.
 *
 * `current_org_id()` wird als Platzhalter gebraucht, aber NICHT weil die
 * Nutzerdaten einen Mandanten hätten: `coach_freischaltcodes` ist eine
 * BETRIEBS-Tabelle (der Betreiber gibt Codes aus) und trägt deshalb als
 * einzige der hier gebauten Tabellen eine `organization_id` mit
 * `DEFAULT current_org_id()`. Die Nutzerdaten daneben — coach_users,
 * coach_freischaltungen, coach_bestellungen, coach_zahlungen,
 * coach_rechnungen — haben keine, und genau das ist die Produktgrenze,
 * die der Kopf von 20260819010000 beschreibt.
 */
const GRUNDGERUEST = `
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

CREATE SCHEMA IF NOT EXISTS auth;

-- Platzhalter fuer den Mandantenschluessel — siehe Kopfkommentar oben.
-- Der Wert ist beliebig; er entscheidet in dieser Kette nichts, weil keine
-- der geprueften Funktionen coach_freischaltcodes anfasst.
CREATE FUNCTION public.current_org_id() RETURNS uuid LANGUAGE sql STABLE
  AS $co$ SELECT '00000000-0000-4000-8000-000460629986'::uuid $co$;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text
);

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt(), auth.uid() TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
`

/**
 * NACHZUG — was spätere ALTER-Migrationen ergänzt haben, gebündelt statt
 * durch Abspielen aller Migrationen. Jede Zeile nennt ihre Quelle.
 */
const NACHZUG = `
-- 20260907000100: 'selbstzahler' als vierte Quelle einer Freischaltung.
--   Live geschieht das über DROP CONSTRAINT + ADD CONSTRAINT in einem
--   DO-Block, der den Constraint-Namen erst sucht. Hier direkt, weil der
--   Name im frisch angelegten Schema bekannt ist.
ALTER TABLE public.coach_freischaltungen
  DROP CONSTRAINT IF EXISTS coach_freischaltungen_quelle_check;
ALTER TABLE public.coach_freischaltungen
  ADD CONSTRAINT coach_freischaltungen_quelle_check
  CHECK (quelle IN ('pflegekasse','hersteller_pilot','testzugang','selbstzahler'));

-- 20260907000100: Bezug einer Freischaltung auf die bezahlte Bestellung.
ALTER TABLE public.coach_freischaltungen
  ADD COLUMN IF NOT EXISTS bestellung_id uuid
  REFERENCES public.coach_bestellungen(id) ON DELETE SET NULL;

-- 20260907000100: Nummernkreis der Selbstzahler-Rechnungen.
CREATE SEQUENCE IF NOT EXISTS coach_rechnung_nummer_seq START 1;

-- 20260819010000: Trigger auf coach_bestellungen (updated_at).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_coach_bestellungen_updated_at') THEN
    CREATE TRIGGER trg_coach_bestellungen_updated_at BEFORE UPDATE ON public.coach_bestellungen
      FOR EACH ROW EXECUTE FUNCTION coach_set_updated_at();
  END IF;
END $$;
`

/** UNIQUE-Index aus 20261009000002 — der Riegel gegen die Stripe-Wiederholung. */
const FS_UNIQUE_INDEX = `
DROP INDEX IF EXISTS idx_coach_freischaltungen_bestellung;
CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_freischaltungen_bestellung
  ON coach_freischaltungen(bestellung_id) WHERE bestellung_id IS NOT NULL;
`

/**
 * Baut das PflegeCoach-Schema auf einer frischen PGlite-Instanz.
 *
 * @param mitUniqueIndex  false = Stand VOR Migration 20261009000002.
 *   Die Kette prüft beide Stände: ohne den Index ist die Idempotenz von
 *   schalteZugangFrei() nur eine Behauptung des select-then-insert, mit
 *   ihm ist sie durchgesetzt.
 */
export async function baueCoachSchema(mitUniqueIndex = true): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(GRUNDGERUEST)

  await db.exec(funktionAusMigration(M_DIPA, 'coach_set_updated_at'))
  await db.exec(tabelleAusMigration(M_DIPA, 'coach_users'))
  await db.exec(tabelleAusMigration(M_FREISCHALT, 'coach_freischaltcodes'))
  await db.exec(tabelleAusMigration(M_FREISCHALT, 'coach_freischaltungen'))
  await db.exec(tabelleAusMigration(M_SELBSTZAHL, 'coach_bestellungen'))
  await db.exec(tabelleAusMigration(M_SELBSTZAHL, 'coach_zahlungen'))
  await db.exec(tabelleAusMigration(M_SELBSTZAHL, 'coach_rechnungen'))
  await db.exec(NACHZUG)
  await db.exec(funktionAusMigration(M_SELBSTZAHL, 'coach_naechste_rechnungsnummer'))
  if (mitUniqueIndex) await db.exec(FS_UNIQUE_INDEX)

  return db
}

/** Die Migrationsdatei des UNIQUE-Index — für die Herkunftsprüfung im Test. */
export const M_FS_UNIQUE_DATEI = M_FS_UNIQUE

export interface AngelegterNutzer {
  authId: string
  coachUserId: string
}

/** Ein PflegeCoach-Nutzer samt auth.users-Zeile. */
export async function legeNutzerAn(
  db: PGlite,
  authId: string,
  rolle: 'pflegebeduerftig' | 'angehoerig' | 'pflegedienst' = 'pflegebeduerftig',
): Promise<AngelegterNutzer> {
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [
    authId, `${authId}@example.org`,
  ])
  const r = await db.query<{ id: string }>(
    `INSERT INTO coach_users (user_id, rolle, onboarding_abgeschlossen)
     VALUES ($1, $2, true) RETURNING id`,
    [authId, rolle],
  )
  return { authId, coachUserId: r.rows[0].id }
}

export interface BestellOptionen {
  tarif?: 'monatlich' | 'jaehrlich'
  betragCent?: number
  intervallMonate?: number
  status?: string
  bestelltAm?: string
  name?: string
}

/** Eine Bestellung im Zustand 'offen' — so, wie der Checkout sie hinterlässt. */
export async function legeBestellungAn(
  db: PGlite,
  coachUserId: string,
  opt: BestellOptionen = {},
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `INSERT INTO coach_bestellungen (
       coach_user_id, tarif, betrag_cent, intervall_monate, status,
       rechnung_name, rechnung_strasse, rechnung_plz, rechnung_ort, rechnung_email,
       agb_akzeptiert_am, datenschutz_akzeptiert_am, widerrufsbelehrung_version,
       bestellt_am
     ) VALUES ($1,$2,$3,$4,$5,$6,'Teststrasse 1','60311','Frankfurt am Main',
               'kunde@example.org', now(), now(), 'v1', $7)
     RETURNING id`,
    [
      coachUserId,
      opt.tarif ?? 'monatlich',
      opt.betragCent ?? 1490,
      opt.intervallMonate ?? 1,
      opt.status ?? 'offen',
      opt.name ?? 'Erika Mustermann',
      opt.bestelltAm ?? new Date().toISOString(),
    ],
  )
  return r.rows[0].id
}
