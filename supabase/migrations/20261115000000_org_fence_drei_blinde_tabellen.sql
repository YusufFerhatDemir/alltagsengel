-- ═══════════════════════════════════════════════════════════════════════════
-- Mandantenzaun für drei org-blinde Tabellen
-- Datum: 2026-09-14
-- STAND: geschrieben, NICHT angewendet. DDL ist aus der Anwendung heraus
--        nicht möglich (42501, service_role ist nicht Owner) — einspielen
--        im SQL-Editor.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- BEFUND (P2 — strukturell offen, heute ohne Abfluss)
--
-- Von 269 Tabellen mit `organization_id` sichern 266 den Mandanten in ihren
-- Policies ab. Drei nicht:
--
--   email_entwuerfe            Policy: is_admin()
--   marketing_content_status   Policy: is_admin()
--   security_watchlist         Policy: ist_sicherheitsadmin()
--
-- Alle drei tragen `organization_id`, nennen sie aber in keiner Policy. Ein
-- Verwaltungsnutzer sieht damit die Zeilen ALLER Mandanten. In einer
-- Übersicht sieht das unauffällig aus — RLS ist an, eine Policy ist da —
-- und es fällt erst auf, wenn ein zweiter Mandant Daten hat.
--
-- WARUM ES HEUTE NICHTS ABFLIESSEN LÄSST (14.09.2026 gemessen)
--   email_entwuerfe            0 Zeilen
--   marketing_content_status  28 Zeilen, alle Stamm-Organisation
--   security_watchlist         1 Zeile,  Stamm-Organisation
--
-- Es gibt also nichts zu sehen, was einem anderen Mandanten gehört. Das ist
-- der Zustand, nicht die Absicherung: sobald der zweite Mandant dort
-- schreibt, liest ihn der erste mit.
--
-- WAS DARAN HÄNGT
--   · email_entwuerfe trägt Entwürfe von Nachrichten AN KUNDEN — also
--     Namen, Anschriften und Anliegen. Von den dreien die sensibelste.
--   · security_watchlist ist die Beobachtungsliste der Sicherheitsspur.
--     Wer sie mandantenübergreifend liest, sieht, wen ein anderer Betrieb
--     im Auge behält.
--   · marketing_content_status ist Redaktionsstand — am wenigsten heikel,
--     aber es verrät die Vorhaben eines Wettbewerbers im selben System.
--
-- DIE FORM: RESTRICTIVE, wie im Bestand
-- `org_fence` ist im Bestand RESTRICTIVE (siehe Notiz org-fence-ist-
-- restrictive): die Policy schränkt zusätzlich ein, statt eine weitere
-- Erlaubnis zu geben. Permissive Policies sind ODER-verknüpft — eine
-- permissive Fence-Policy neben `is_admin()` würde gar nichts bewirken.
--
-- `organization_id IS NULL` bleibt zulässig: security_audit_log führt
-- globale Einträge so, und die drei Tabellen hier können es ebenso.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── email_entwuerfe ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS email_entwuerfe_org_fence ON public.email_entwuerfe;
CREATE POLICY email_entwuerfe_org_fence
  ON public.email_entwuerfe
  AS RESTRICTIVE
  FOR ALL
  USING (organization_id = public.current_org_id() OR organization_id IS NULL)
  WITH CHECK (organization_id = public.current_org_id() OR organization_id IS NULL);

-- ── marketing_content_status ───────────────────────────────────────────────
DROP POLICY IF EXISTS marketing_content_status_org_fence ON public.marketing_content_status;
CREATE POLICY marketing_content_status_org_fence
  ON public.marketing_content_status
  AS RESTRICTIVE
  FOR ALL
  USING (organization_id = public.current_org_id() OR organization_id IS NULL)
  WITH CHECK (organization_id = public.current_org_id() OR organization_id IS NULL);

-- ── security_watchlist ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS security_watchlist_org_fence ON public.security_watchlist;
CREATE POLICY security_watchlist_org_fence
  ON public.security_watchlist
  AS RESTRICTIVE
  FOR ALL
  USING (organization_id = public.current_org_id() OR organization_id IS NULL)
  WITH CHECK (organization_id = public.current_org_id() OR organization_id IS NULL);

-- ── NACH DEM EINSPIELEN ────────────────────────────────────────────────────
-- `npm run verify:mandantenzaun` meldet die drei dann als mandantenbezogen.
-- Die Einträge in ERLAUBT (scripts/verify-mandantenzaun-live.mjs) gehören
-- dann heraus — sonst deckt die Erlaubnisliste etwas ab, das gelöst ist.
