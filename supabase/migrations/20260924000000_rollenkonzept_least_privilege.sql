-- ═══════════════════════════════════════════════════════════════════════
-- Rollenkonzept: PDL, Qualitaetsmanagement, Buchhaltung (Least Privilege)
-- ═══════════════════════════════════════════════════════════════════════
--
-- AUSGANGSLAGE
-- profiles.role kannte genau fuenf Werte: kunde, engel, fahrer, admin,
-- superadmin (nachgewiesen am 2026-08-23 gegen Production: ein INSERT mit
-- role='pdl' scheitert an profiles_role_check). In RLS entschied ueberall
-- dieselbe Funktion is_admin() — ueber Bankdaten, Gesundheitsdaten,
-- Tarife, Audit-Logs und Benutzerverwaltung gleichermassen. Wer die
-- Buchhaltung machen sollte, brauchte damit zwangslaeufig Zugriff auf die
-- Pflegedokumentation.
--
-- WAS DIESE MIGRATION TUT
--   1. profiles.role um pdl, qm, buchhaltung und angehoerige erweitern
--   2. Berechtigungsmatrix als SQL-Funktion public.darf() —
--      Spiegel von lib/auth/rollen.ts
--   3. Lese-/Schreibpolicies je Fachbereich auf den sensiblen Tabellen
--   4. Rollenwechsel-Trigger auf die neuen privilegierten Rollen erweitern
--
-- WARUM DAS ADDITIV UND DAMIT UNGEFAEHRLICH IST
-- Alle neuen Policies sind PERMISSIVE. Eine permissive Policy kann
-- Zugriff nur ERWEITERN, nie entziehen. Fuer admin/superadmin aendert
-- sich also nichts (is_admin() gilt unveraendert weiter), und fuer die
-- neuen Rollen gilt: was hier nicht ausdruecklich steht, bleibt zu.
-- Die RESTRICTIVE Mandantengrenzen (org_fence_*) bleiben ebenfalls
-- unangetastet und begrenzen weiterhin JEDE dieser Policies.
--
-- ZWEI SEITEN, EINE MATRIX
-- public.darf() und ROLLEN_MATRIX in lib/auth/rollen.ts muessen
-- deckungsgleich bleiben. __tests__/security/rollenkonzept-pglite.test.ts
-- vergleicht beide Seiten Zelle fuer Zelle und schlaegt an, sobald eine
-- Aenderung nur auf einer Seite ankommt.
--
-- Rollback: 20260924000001_rollback_rollenkonzept_least_privilege.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Rollenkatalog ────────────────────────────────────────────────
-- 'angehoerige' ist die KONTOROLLE. Nicht zu verwechseln mit
-- angehoerigen_zugaenge.rolle ('angehoeriger'|'betreuer'|
-- 'bevollmaechtigter') — das ist die Beziehungsart und ein anderes
-- Vokabular.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'kunde', 'engel', 'fahrer', 'angehoerige',
    'pdl', 'qm', 'buchhaltung',
    'admin', 'superadmin'
  ));

-- ── 2) Rolle des angemeldeten Nutzers ───────────────────────────────
-- SECURITY DEFINER, weil die Funktion aus RLS-Policies auf profiles
-- heraus gerufen wird und sonst dieselbe 42P17-Rekursion ausloest, an
-- der schon is_admin() gebaut wurde (siehe 20260419000100).
-- Ein soft-geloeschtes Konto hat KEINE Rolle mehr.
CREATE OR REPLACE FUNCTION public.aktuelle_rolle()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.deleted_at IS NULL
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.aktuelle_rolle() IS
  'Autoritative Rolle des angemeldeten Nutzers aus profiles. NICHT aus '
  'user_metadata — das ist vom Nutzer selbst beschreibbar.';

-- ── 3) Berechtigungsmatrix ──────────────────────────────────────────
-- Reihenfolge und Inhalt identisch zu ROLLEN_MATRIX in
-- lib/auth/rollen.ts. Wer hier etwas aendert, aendert es dort mit.
CREATE OR REPLACE FUNCTION public.rollen_matrix(p_rolle text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_rolle
    WHEN 'superadmin' THEN ARRAY[
      'stammdaten.lesen','stammdaten.schreiben',
      'personal.lesen','personal.schreiben',
      'einsatz.lesen','einsatz.schreiben',
      'pflege.lesen','pflege.schreiben',
      'qm.lesen','qm.schreiben',
      'abrechnung.lesen','abrechnung.schreiben',
      'bankdaten.lesen','bankdaten.schreiben',
      'tarife.lesen','tarife.schreiben',
      'audit.lesen','benutzer.verwalten','system.verwalten','berichte.lesen'
    ]
    WHEN 'admin' THEN ARRAY[
      'stammdaten.lesen','stammdaten.schreiben',
      'personal.lesen','personal.schreiben',
      'einsatz.lesen','einsatz.schreiben',
      'pflege.lesen','pflege.schreiben',
      'qm.lesen','qm.schreiben',
      'abrechnung.lesen','abrechnung.schreiben',
      'bankdaten.lesen','bankdaten.schreiben',
      'tarife.lesen','tarife.schreiben',
      'audit.lesen','benutzer.verwalten','system.verwalten','berichte.lesen'
    ]
    -- Pflegedienstleitung: fuehrt den Betrieb. Rechnungen nur lesen,
    -- Bankdaten/Tarifpflege/Benutzerverwaltung gar nicht.
    WHEN 'pdl' THEN ARRAY[
      'stammdaten.lesen','stammdaten.schreiben',
      'personal.lesen','personal.schreiben',
      'einsatz.lesen','einsatz.schreiben',
      'pflege.lesen','pflege.schreiben',
      'qm.lesen','qm.schreiben',
      'abrechnung.lesen',
      'tarife.lesen',
      'audit.lesen','berichte.lesen'
    ]
    -- Qualitaetsmanagement: prueft, aendert die geprueften Daten aber
    -- nicht — sonst pruefte es die eigene Korrektur.
    WHEN 'qm' THEN ARRAY[
      'stammdaten.lesen',
      'personal.lesen',
      'einsatz.lesen',
      'pflege.lesen',
      'qm.lesen','qm.schreiben',
      'audit.lesen','berichte.lesen'
    ]
    -- Buchhaltung: Geld ja, Gesundheitsdaten nein.
    WHEN 'buchhaltung' THEN ARRAY[
      'stammdaten.lesen',
      'einsatz.lesen',
      'abrechnung.lesen','abrechnung.schreiben',
      'bankdaten.lesen','bankdaten.schreiben',
      'tarife.lesen',
      'audit.lesen','berichte.lesen'
    ]
    -- engel/fahrer/kunde/angehoerige und alles Unbekannte: nichts.
    -- Ihr Zugriff auf eigene Daten haengt an den bestehenden Policies
    -- (eigene_caregiver_ids(), Klientenzuordnung, Angehoerigenzugang).
    ELSE ARRAY[]::text[]
  END;
$$;

CREATE OR REPLACE FUNCTION public.darf(p_berechtigung text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    p_berechtigung = ANY (public.rollen_matrix(public.aktuelle_rolle())),
    false
  );
$$;

COMMENT ON FUNCTION public.darf(text) IS
  'Kernfrage des Rollenkonzepts. Spiegel von hatBerechtigung() in '
  'lib/auth/rollen.ts. Unbekannte Rolle oder unbekannte Berechtigung '
  '⇒ false (fail-closed).';

CREATE OR REPLACE FUNCTION public.ist_verwaltung()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    array_length(public.rollen_matrix(public.aktuelle_rolle()), 1) > 0,
    false
  );
$$;

-- Jede public-Funktion ist per Default anon-ausfuehrbar (siehe
-- 20260922000000). Diese drei geben zwar nur booleans bzw. die eigene
-- Rolle zurueck, aber anon hat hier nichts zu suchen.
REVOKE ALL ON FUNCTION public.aktuelle_rolle() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.darf(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ist_verwaltung() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rollen_matrix(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aktuelle_rolle() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.darf(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ist_verwaltung() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rollen_matrix(text) TO authenticated, service_role;

-- ── 4) Policies je Fachbereich ──────────────────────────────────────
-- Eine Zeile je Tabelle: welche Berechtigung zum Lesen, welche zum
-- Schreiben. Ist die Schreib-Berechtigung NULL, gibt es fuer die neuen
-- Rollen ueberhaupt keinen Schreibweg (Audit-Tabellen).
--
-- Tabellen, die es (noch) nicht gibt, werden uebersprungen — dieselbe
-- Migration laeuft so auch auf einer Shadow-DB ohne alle Module.
DO $$
DECLARE
  e            record;
  name_lesen   text;
  name_schr    text;
BEGIN
  FOR e IN
    SELECT * FROM (VALUES
      -- Klienten-Stammdaten
      ('clients',                    'stammdaten.lesen',  'stammdaten.schreiben'),
      ('client_budgets',             'stammdaten.lesen',  'stammdaten.schreiben'),
      -- Personal
      ('caregivers',                 'personal.lesen',    'personal.schreiben'),
      -- Einsatzgeschehen
      ('assignments',                'einsatz.lesen',     'einsatz.schreiben'),
      ('service_records',            'einsatz.lesen',     'einsatz.schreiben'),
      ('tours',                      'einsatz.lesen',     'einsatz.schreiben'),
      ('tour_stops',                 'einsatz.lesen',     'einsatz.schreiben'),
      -- Gesundheitsdaten
      ('pflege_verlauf',             'pflege.lesen',      'pflege.schreiben'),
      ('pflege_aufnahmen',           'pflege.lesen',      'pflege.schreiben'),
      ('sis_assessments',            'pflege.lesen',      'pflege.schreiben'),
      ('wounds',                     'pflege.lesen',      'pflege.schreiben'),
      ('wound_assessments',          'pflege.lesen',      'pflege.schreiben'),
      ('wound_treatments',           'pflege.lesen',      'pflege.schreiben'),
      ('vital_signs',                'pflege.lesen',      'pflege.schreiben'),
      ('medikamente',                'pflege.lesen',      'pflege.schreiben'),
      ('medikamentenplan',           'pflege.lesen',      'pflege.schreiben'),
      -- Abrechnung
      ('invoices',                   'abrechnung.lesen',  'abrechnung.schreiben'),
      ('invoice_items',              'abrechnung.lesen',  'abrechnung.schreiben'),
      ('dunning_entries',            'abrechnung.lesen',  'abrechnung.schreiben'),
      ('payments',                   'abrechnung.lesen',  'abrechnung.schreiben'),
      ('zahlungseingaenge',          'abrechnung.lesen',  'abrechnung.schreiben'),
      ('abrechnungslaeufe',          'abrechnung.lesen',  'abrechnung.schreiben'),
      -- Bankdaten
      ('sepa_mandates',              'bankdaten.lesen',   'bankdaten.schreiben'),
      ('sepa_batches',               'bankdaten.lesen',   'bankdaten.schreiben'),
      -- Preiskataloge: Lesen breiter als Aendern. 'tarife.schreiben'
      -- hat nur die Administration — die Fail-Closed-Sperre aus
      -- 20260831040000/20260904000000 bleibt davon unberuehrt.
      ('billing_tariffs',            'tarife.lesen',      'tarife.schreiben'),
      ('leistungspreise',            'tarife.lesen',      'tarife.schreiben'),
      ('service_pricing',            'tarife.lesen',      'tarife.schreiben'),
      -- Revisionsspuren: ausschliesslich lesend. Die Unveraenderlichkeit
      -- haengt zusaetzlich an den bestehenden Triggern.
      ('audit_logs',                 'audit.lesen',       NULL),
      ('billing_audit_trail',        'audit.lesen',       NULL),
      ('billing_tariff_audit',       'audit.lesen',       NULL),
      ('wf_audit_log',               'audit.lesen',       NULL),
      ('pflege_audit_log',           'audit.lesen',       NULL),
      ('service_record_audit_log',   'audit.lesen',       NULL),
      ('invoice_email_log',          'audit.lesen',       NULL),
      ('notification_delivery_log',  'audit.lesen',       NULL)
    ) AS t(tabelle, lesen, schreiben)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = e.tabelle
    ) THEN
      CONTINUE;
    END IF;

    -- RLS muss an sein, sonst waere die Policy wirkungslos und wir
    -- wuerden eine Sicherheit vortaeuschen, die es nicht gibt.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', e.tabelle);

    name_lesen := 'rk_' || e.tabelle || '_lesen';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = e.tabelle AND policyname = name_lesen
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT USING (public.darf(%L))',
        name_lesen, e.tabelle, e.lesen
      );
    END IF;

    IF e.schreiben IS NOT NULL THEN
      name_schr := 'rk_' || e.tabelle || '_schreiben';
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = e.tabelle AND policyname = name_schr
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL USING (public.darf(%L)) WITH CHECK (public.darf(%L))',
          name_schr, e.tabelle, e.schreiben, e.schreiben
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- ── 5) Rollenwechsel absichern ──────────────────────────────────────
-- Bisher galten nur admin/superadmin als privilegiert. Ohne diese
-- Erweiterung koennte sich ein frisch registrierter Nutzer beim Anlegen
-- seiner eigenen Profilzeile role='buchhaltung' geben und damit an
-- Bankdaten und Rechnungen kommen.
CREATE OR REPLACE FUNCTION public.prevent_privileged_role_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role IS NULL
     OR NEW.role <> ALL (ARRAY['admin', 'superadmin', 'pdl', 'qm', 'buchhaltung'])
  THEN
    RETURN NEW;
  END IF;

  -- Kein JWT → service_role, Migration oder Seed. Diese Wege muessen
  -- privilegierte Profile anlegen koennen; ihr Schutz ist der
  -- Service-Role-Key, nicht dieser Trigger.
  IF coalesce(current_setting('request.jwt.claims', true), '') = '' THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Anlegen eines privilegierten Profils nicht erlaubt';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_privileged_role_insert() IS
  'BEFORE INSERT auf profiles: blockiert admin/superadmin/pdl/qm/'
  'buchhaltung durch Nicht-Admins.';

DROP TRIGGER IF EXISTS trg_prevent_privileged_role_insert ON public.profiles;
CREATE TRIGGER trg_prevent_privileged_role_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_privileged_role_insert();

-- Rollenwechsel per UPDATE: prevent_role_escalation() blockiert seit
-- jeher JEDEN Rollenwechsel durch Nicht-Admins — pdl/qm/buchhaltung sind
-- keine Admins und damit automatisch mit erfasst. EINE Luecke bleibt
-- aber: ein Admin konnte bisher sich selbst oder andere zum SUPERADMIN
-- machen. Die hoechste Stufe darf nur die hoechste Stufe vergeben.
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- Kein JWT im Request → service_role bzw. direkte DB-Verbindung
  -- (Backend-Job, Migration, Seed). Absicherung ist dort der Schutz des
  -- Service-Role-Keys, nicht dieser Trigger.
  IF coalesce(current_setting('request.jwt.claims', true), '') = '' THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Rollenwechsel nicht erlaubt';
  END IF;

  IF NEW.role = 'superadmin' AND public.aktuelle_rolle() <> 'superadmin' THEN
    RAISE EXCEPTION 'Superadmin-Rolle darf nur ein Superadmin vergeben';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
