-- ════════════════════════════════════════════════════════════════════════════
-- VOLLSTÄNDIGER RLS- UND PERFORMANCE-AUDIT
-- Datum: 2026-08-08  ·  Phase 4, Punkte 4 und 6
--
-- Ausfuehrung auf der Shadow-/Staging-DB:
--   psql "$SHADOW_URL" -f tests/audit-rls-vollstaendig.sql
--
-- Liefert eine Befundliste. Jede Zeile mit BEFUND ist zu klaeren, bevor
-- auf Production migriert wird.
-- ════════════════════════════════════════════════════════════════════════════

\pset format aligned
\pset border 2

\echo ''
\echo '═══ A1: public-Tabellen OHNE aktivierte RLS ═══'
SELECT c.relname AS tabelle
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
 ORDER BY 1;

\echo ''
\echo '═══ A2: Tabellen MIT RLS, aber OHNE jede Policy ═══'
\echo '        (= fuer alle Rollen ausser service_role komplett gesperrt;'
\echo '         sicher, aber meist ein Versehen)'
SELECT c.relname AS tabelle
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
   AND NOT EXISTS (SELECT 1 FROM pg_policies p
                    WHERE p.schemaname = 'public' AND p.tablename = c.relname)
 ORDER BY 1;

\echo ''
\echo '═══ A3: Tabellen mit organization_id OHNE org_fence-Policy ═══'
SELECT DISTINCT col.table_name AS tabelle
  FROM information_schema.columns col
  JOIN pg_class c ON c.relname = col.table_name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
 WHERE col.table_schema = 'public'
   AND col.column_name = 'organization_id'
   AND c.relkind = 'r'
   AND NOT EXISTS (
     SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = col.table_name
        AND (p.policyname LIKE '%org_fence%' OR p.qual LIKE '%current_org_id%')
   )
 ORDER BY 1;

\echo ''
\echo '═══ A4: anon hat SCHREIBRECHTE auf public-Tabellen ═══'
\echo '        (Policies koennen das abfangen — ein Recht ohne Bedarf'
\echo '         ist trotzdem unnoetige Angriffsflaeche)'
SELECT table_name AS tabelle, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS rechte
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND grantee = 'anon'
   AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
 GROUP BY table_name
 ORDER BY 1;

\echo ''
\echo '═══ A5: SECURITY DEFINER-Funktionen OHNE festen search_path ═══'
\echo '        (search_path-Hijacking: der Aufrufer koennte eigene'
\echo '         Funktionen/Tabellen unterschieben)'
SELECT p.proname AS funktion
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.prosecdef
   AND NOT EXISTS (
     SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
      WHERE cfg LIKE 'search_path=%'
   )
 ORDER BY 1;

\echo ''
\echo '═══ A6: Fremdschluessel OHNE Index auf der Kindspalte ═══'
\echo '        (jedes DELETE/UPDATE am Elternsatz erzwingt einen'
\echo '         Sequential Scan auf der Kindtabelle)'
SELECT c.conrelid::regclass AS tabelle,
       a.attname            AS spalte,
       c.confrelid::regclass AS verweist_auf
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
  JOIN pg_class cl ON cl.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
 WHERE c.contype = 'f'
   AND n.nspname = 'public'
   AND array_length(c.conkey, 1) = 1
   AND NOT EXISTS (
     SELECT 1 FROM pg_index i
      WHERE i.indrelid = c.conrelid
        AND i.indkey[0] = c.conkey[1]
   )
 ORDER BY 1, 2;

\echo ''
\echo '═══ A7: Views mit SECURITY DEFINER-Semantik ═══'
\echo '        (laufen mit den Rechten des Eigentuemers und umgehen RLS —'
\echo '         beabsichtigt nur fuer state_settings_public)'
SELECT c.relname AS view_name,
       CASE WHEN 'security_invoker=true' = ANY(COALESCE(c.reloptions, ARRAY[]::text[]))
            THEN 'invoker' ELSE 'definer (umgeht RLS)' END AS modus
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'v'
 ORDER BY 2 DESC, 1;

\echo ''
\echo '═══ A8: Kernabfragen der Expansion — Ausfuehrungsplan ═══'
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF)
SELECT * FROM public.bundesland_fuer_plz('60311');

\echo ''
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, TIMING OFF)
SELECT * FROM public.state_settings
 WHERE organization_id = '00000000-0000-4000-8000-000460629986'
   AND bundesland = 'hessen';

\echo ''
\echo '═══ A9: Dashboard-View — Laufzeit ═══'
EXPLAIN (ANALYZE, COSTS OFF, TIMING ON, SUMMARY ON)
SELECT * FROM public.state_expansion_dashboard
 WHERE organization_id = '00000000-0000-4000-8000-000460629986';
