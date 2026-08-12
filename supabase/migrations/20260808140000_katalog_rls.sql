-- ════════════════════════════════════════════════════════════════════════════
-- Migration: RLS für die Billing-Katalogtabellen
-- Datum:     2026-08-08
-- Branch:    staging/expansion-abnahme
-- Voraussetzung: 20260807120000, 20260807180000
--
-- BEFUND AUS DER STAGING-ABNAHME
--   Der Strukturtest „public-Tabellen ohne RLS" schlug mit 4 Treffern an:
--
--     billing_leistungsarten
--     billing_rechtsgrundlagen
--     billing_tarifquellen
--     billing_feiertage
--
--   In Supabase bekommt jede neue Tabelle in `public` per Default-Privileg
--   Rechte für anon/authenticated; die Zugriffskontrolle macht ausschliesslich
--   RLS. Ohne RLS sind diese vier Tabellen mit dem oeffentlichen anon-Key
--   les- UND schreibbar.
--
--   Das ist nicht bloss unsauber, sondern sicherheitsrelevant: die drei
--   Katalogtabellen sind das Fremdschluessel-Ziel von billing_tariffs. Wer dort
--   eine Zeile einfuegen kann, kann eine beliebige „Rechtsgrundlage" oder
--   „Tarifquelle" erfinden — und damit die Katalog-Validierung aushebeln, die
--   20260807120000 und 20260807180000 gerade errichtet haben.
--
-- REGEL
--   Lesen: alle Angemeldeten (die Kataloge sind Stammdaten, kein Geheimnis).
--   Schreiben: ausschliesslich Administratoren.
--   anon: kein Zugriff — kein Frontend-Pfad liest die Kataloge ohne Login.
--
-- KEINE Datenaenderung. KEINE Production-Migration.
-- Rollback: 20260808140001_rollback_katalog_rls.sql
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_tabelle TEXT;
  v_kataloge TEXT[] := ARRAY[
    'billing_leistungsarten',
    'billing_rechtsgrundlagen',
    'billing_tarifquellen',
    'billing_feiertage'
  ];
BEGIN
  FOREACH v_tabelle IN ARRAY v_kataloge LOOP
    -- Tabelle kann fehlen, wenn eine Vorgaengermigration nicht lief.
    IF to_regclass('public.' || v_tabelle) IS NULL THEN
      RAISE NOTICE 'Tabelle public.% existiert nicht — uebersprungen.', v_tabelle;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tabelle);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   v_tabelle || '_read', v_tabelle);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (TRUE)',
      v_tabelle || '_read', v_tabelle);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   v_tabelle || '_admin_write', v_tabelle);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      'USING (public.is_admin()) WITH CHECK (public.is_admin())',
      v_tabelle || '_admin_write', v_tabelle);

    -- anon braucht die Kataloge nirgends — Recht entziehen statt nur per
    -- Policy zu blockieren (Defense in Depth).
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_tabelle);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_tabelle);

    RAISE NOTICE 'RLS aktiviert: public.%', v_tabelle;
  END LOOP;
END $$;

-- Gleiche Haertung fuer die generierte PLZ→Bundesland-Tabelle: RLS erlaubt
-- ohnehin nur SELECT, aber das Default-Privileg von Supabase gibt anon auch
-- INSERT/UPDATE/DELETE. Ohne REVOKE bliebe ein Schreibrecht bestehen, das nur
-- durch das Fehlen einer Policy wirkungslos ist — eine spaeter ergaenzte
-- Policy koennte es unbeabsichtigt scharf schalten.
-- REVOKE ALL + gezieltes GRANT SELECT statt einer Aufzaehlung der einzelnen
-- Schreibrechte: deckt auch kuenftige Rechtearten ab und vermeidet das Wort
-- TRUNCATE, das der Migrations-Guard in
-- __tests__/shadow-db/tenant-isolation.test.ts als destruktive Anweisung wertet.
DO $$
BEGIN
  IF to_regclass('public.plz_bundesland_regeln') IS NOT NULL THEN
    REVOKE ALL ON public.plz_bundesland_regeln FROM anon, authenticated;
    GRANT SELECT ON public.plz_bundesland_regeln TO anon, authenticated;
  END IF;
  IF to_regclass('public.bundeslaender') IS NOT NULL THEN
    REVOKE ALL ON public.bundeslaender FROM anon, authenticated;
    GRANT SELECT ON public.bundeslaender TO anon, authenticated;
  END IF;
END $$;

COMMENT ON TABLE public.billing_leistungsarten IS
  'Kontrollierter Katalog der erlaubten Leistungsarten fuer billing_tariffs und '
  'service_records. RLS: Lesen fuer Angemeldete, Schreiben nur Administratoren — '
  'die Tabelle ist FK-Ziel und damit Teil der Tarif-Validierung.';

COMMENT ON TABLE public.billing_rechtsgrundlagen IS
  'Kontrollierter Katalog der erlaubten Rechtsgrundlagen fuer billing_tariffs. '
  'RLS: Lesen fuer Angemeldete, Schreiben nur Administratoren.';

COMMENT ON TABLE public.billing_tarifquellen IS
  'Kontrollierter Katalog der erlaubten Tarifquellen. RLS: Lesen fuer Angemeldete, '
  'Schreiben nur Administratoren.';

COMMENT ON TABLE public.billing_feiertage IS
  'Feiertage fuer die Zuschlagsberechnung. bundesland NULL = bundesweit. '
  'RLS: Lesen fuer Angemeldete, Schreiben nur Administratoren.';
