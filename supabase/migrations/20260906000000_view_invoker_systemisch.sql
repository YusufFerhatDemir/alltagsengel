-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Alle Views auf Invoker-Rechte + anon-Entzug (systemisch)
-- Datum:     2026-08-14
-- Rollback:  20260906000001_rollback_view_invoker_systemisch.sql
--
-- BEFUND (Gegenpruefung A, live auf Production nachgewiesen)
--
-- P0  UNAUTHENTIFIZIERTER ZUGRIFF AUF GESUNDHEITS- UND PERSONALDATEN
--     Mit dem oeffentlichen anon-Key (er steht im ausgelieferten Website-JS)
--     waren ueber PostgREST OHNE Login lesbar:
--
--       pflege_uebersicht          first_name, last_name, pflegegrad,
--                                  aktive_diagnosen, aktive_risiken
--                                  -> Gesundheitsdaten, Art. 9 DSGVO
--       kundenakte_uebersicht      first_name, last_name, pflegegrad,
--                                  pflegekasse_name
--       mitarbeiterakte_uebersicht first_name, last_name, beschaeftigungsart,
--                                  einsatzfreigabe
--       wf_events_dashboard        18 Zeilen inkl. quell_tabelle/quell_id
--       dta_dashboard              Abrechnungssummen je Organisation
--       wf_statistik               Kennzahlen je Organisation
--
--     URSACHE: Eine View laeuft ohne `security_invoker` mit den Rechten ihres
--     EIGENTUEMERS. Die RLS der Basistabellen wird dabei vollstaendig umgangen.
--     Beweis aus dem Audit: wf_events ist korrekt gefenced — anon erhaelt dort
--     0 Zeilen — waehrend wf_events_dashboard exakt dieselben 18 Zeilen
--     herausgibt. Der Fence war nie defekt, die View hat ihn uebersprungen.
--
--     20260808150000 hat genau diesen Fehler schon einmal behoben, aber nur
--     fuer zwei einzelne Views. Alle spaeter angelegten Views (20260808220000,
--     20260809010000, …) haben ihn wieder eingebaut. Deshalb wird die Regel
--     hier EINMAL UEBER ALLE VIEWS gezogen statt erneut pro View.
--
-- P1  kf_feature_flags war fuer anon lesbar (Rollout-Strategie, allowed_users),
--     obwohl RLS aktiv ist und eine is_admin()-Policy existiert. Ursache ist
--     eine nur live vorhandene, permissive Policy. Der Entzug des anon-GRANT
--     wirkt unabhaengig davon, welche Policies existieren — Policies greifen
--     ueberhaupt erst, wenn das Tabellenrecht vorhanden ist.
--
-- BEWUSST WEITERHIN OEFFENTLICH (Kundenseite, kein Personenbezug):
--   state_settings_public  oeffentlicher Bundesland-Status
--   angels                 Marktplatz-Profile (keine Namen/Kontaktdaten)
--   bundeslaender, plz_bundesland_regeln, billing_leistungsarten  Stammdaten
--
-- KEINE Datenaenderung.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Alle Views auf die Rechte des Aufrufers ──────────────────────────────
-- state_settings_public ist ausgenommen: sie IST der oeffentliche Endpunkt und
-- muss fuer anon ohne Login lesbar bleiben (so schon in 20260808150000 belegt).
DO $$
DECLARE
  v record;
BEGIN
  FOR v IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'v'
       AND c.relname <> 'state_settings_public'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v.relname);
  END LOOP;
END $$;

-- ── 2) anon verliert das Leserecht auf alle nicht-oeffentlichen Views ───────
-- Ohne GRANT ist es unerheblich, ob eine View Definer- oder Invoker-Semantik
-- hat: PostgREST kommt gar nicht erst bis zur Zeilenfilterung.
DO $$
DECLARE
  v record;
BEGIN
  FOR v IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'v'
       AND c.relname <> 'state_settings_public'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v.relname);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v.relname);
  END LOOP;
END $$;

-- ── 3) kf_feature_flags: anon-Recht entziehen ───────────────────────────────
-- Interne Produktschalter inkl. rollout_strategy und allowed_users.
DO $$
BEGIN
  IF to_regclass('public.kf_feature_flags') IS NOT NULL THEN
    REVOKE ALL ON public.kf_feature_flags FROM anon;
    GRANT SELECT ON public.kf_feature_flags TO authenticated;
  END IF;
END $$;

COMMENT ON VIEW public.pflege_uebersicht IS
  'Pflegedoku-Uebersicht je Klient. security_invoker = true — die RLS von '
  'clients/pflege_* gilt fuer den Aufrufer. Enthaelt Gesundheitsdaten '
  '(Art. 9 DSGVO): NIEMALS an anon freigeben.';

COMMENT ON VIEW public.kundenakte_uebersicht IS
  'Kundenakten-Uebersicht. security_invoker = true. Enthaelt Klarnamen und '
  'Pflegegrad: NIEMALS an anon freigeben.';

COMMENT ON VIEW public.mitarbeiterakte_uebersicht IS
  'Mitarbeiterakten-Uebersicht. security_invoker = true. Enthaelt Klarnamen '
  'und Beschaeftigungsdaten: NIEMALS an anon freigeben.';
