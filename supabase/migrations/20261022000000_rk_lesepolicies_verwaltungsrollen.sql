-- ═══════════════════════════════════════════════════════════════════════════
-- Lesepolicies fuer die Verwaltungsrollen (pdl, qm, buchhaltung)
--
-- BEFUND (npm run lint:rls-sicht, 31.08.2026)
--
-- 48 Seite/Rolle-Paare ueber 25 Tabellen sehen unter RLS NICHTS. Nicht,
-- weil eine Sperre greift, sondern weil auf diesen Tabellen ueberhaupt
-- keine Policy steht, die eine BERECHTIGUNG auswertet. Live gibt es dort
-- genau zwei Wege:
--
--   is_admin()           → admin, superadmin
--   is_internal_staff()  → admin, superadmin, pdl
--
-- Wer nicht Administration ist, faellt durch — und zwar lautlos. Die Seite
-- ist ueber BEREICHE freigegeben, der Guard laesst die Rolle durch, die
-- Abfrage laeuft ohne Fehler und liefert null Zeilen. /admin/nachweise
-- sagte der Pflegedienstleitung damit 'keine Nachweise vorhanden',
-- waehrend Fuehrungszeugnisse abliefen.
--
-- Das ist kein Datenleck — es wird zu WENIG gezeigt, nicht zu viel. Es ist
-- eine stille Falschaussage, und sie ist gefaehrlicher als eine Fehler-
-- meldung, weil niemand sie bemerkt.
--
-- ── WAS DIESE MIGRATION TUT ───────────────────────────────────────────────
--
-- Sie legt je Tabelle EINE permissive SELECT-Policy `rk_<tabelle>_lesen`
-- an, nach immer demselben Muster:
--
--   FOR SELECT TO authenticated
--   USING (public.darf('<bereich>.lesen')
--          AND organization_id = public.current_org_id())
--
-- Vier Eigenschaften, jede mit Absicht:
--
--   1. FOR SELECT — nicht FOR ALL. Eine FOR-ALL-Policy waere permissiv mit
--      den bestehenden ODER-verknuepft und haette nebenbei Schreibrechte
--      eroeffnet (Befund 'FOR-ALL-Policy hebt engere auf': sr_engel_own
--      machte so eine Statussperre wirkungslos).
--   2. TO authenticated — anon wertet den Ausdruck gar nicht erst aus.
--   3. organization_id = current_org_id() — obwohl auf jeder dieser
--      Tabellen bereits ein RESTRICTIVE org_fence steht. Doppelt, weil
--      current_org_id() fail-open ist (wer in keiner organization_members
--      -Zeile steht, landet in der Stamm-Org) und weil eine Policy
--      lesbar bleiben soll, ohne dass man die zweite kennen muss.
--   4. darf('…') statt einer Rollenliste — die Matrix steht in
--      lib/auth/rollen.ts und in public.rollen_matrix(); eine dritte
--      Liste hier waere die naechste Quelle, die auseinanderlaeuft
--      (siehe Befund F1 zu is_internal_staff()).
--
-- ── WAS SIE NICHT TUT ─────────────────────────────────────────────────────
--
-- Keine Tabelle wird pauschal geoeffnet. Fuer jede steht unten, WELCHES
-- Recht sie traegt und warum. Drei Entscheidungen fallen bewusst
-- restriktiv aus und lassen damit Seiten weiter leer:
--
--   verordnungen / verordnung_leistungen → pflege.lesen
--       `verordnungen.diagnose` ist ein Gesundheitsdatum. Die Buchhaltung
--       bekommt es nicht, obwohl /admin/abrechnung die Tabelle liest.
--   care_notes → pflege.lesen
--       haengt ueber verlauf_id/massnahme_id am Pflegeprozess.
--   absences → personal.lesen
--       `grund` traegt Krankheit — Gesundheitsdatum der Mitarbeitenden.
--   caregiver_bonuses → bonus.verwalten
--       Verguetung ist Vorbehalt der Administration.
--
-- Diese vier bleiben fuer die jeweils betroffene Rolle blind — das ist
-- die richtige Antwort. Damit die Seite es SAGT statt es zu verschweigen,
-- traegt derselbe Stand die passenden `zusatzRechte` in lib/auth/bereiche.ts
-- nach.
--
-- `documents` steht bewusst NICHT in dieser Liste: der einzige Befund dort
-- (/admin/sepa) war ein Fehlbefund des Linters — die Seite spricht
-- `supabase.storage.from('documents')` an, den Speicher-Eimer, nicht die
-- Tabelle. Die Tabelle fuehrt live Fuehrungszeugnisse und Ausweise; sie
-- bleibt bei is_admin() plus Eigene-Zeilen-Pfad.
--
-- ── ANWENDEN ──────────────────────────────────────────────────────────────
-- Im Supabase-SQL-Editor als `postgres`. Ueber den Dienstschluessel
-- scheitert CREATE POLICY am Eigentuemer:
--   ERROR: must be owner of table absences (42501)  ← am 31.08.2026 geprueft
-- Danach:  npm run lint:rls-sicht     → Abschnitt A muss auf 0 stehen
--          npm run audit:rls-rollen   → A-pdl / A-qm / A-buchhaltung weg
-- ═══════════════════════════════════════════════════════════════════════════

-- ── absences → personal.lesen ─────────────────────────────
--   Abwesenheiten der Pflegekraefte. `grund` traegt Krankheit — ein
--   Gesundheitsdatum der MITARBEITENDEN. Deshalb personal.lesen und nicht
--   einsatz.lesen: die Buchhaltung plant keine Ausfaelle und braucht den
--   Krankheitsgrund einer Kollegin nie.
DROP POLICY IF EXISTS rk_absences_lesen ON public.absences;
CREATE POLICY rk_absences_lesen ON public.absences
  FOR SELECT TO authenticated
  USING (public.darf('personal.lesen') AND organization_id = public.current_org_id());

-- ── applications → personal.lesen ─────────────────────────────
--   Bewerbungen. Personalgewinnung — dieselbe Akte wie das spaetere
--   Arbeitsverhaeltnis, nur frueher.
DROP POLICY IF EXISTS rk_applications_lesen ON public.applications;
CREATE POLICY rk_applications_lesen ON public.applications
  FOR SELECT TO authenticated
  USING (public.darf('personal.lesen') AND organization_id = public.current_org_id());

-- ── bookings → einsatz.lesen ─────────────────────────────
--   Termine der Kundschaft. Das Einsatzgeschehen selbst; pdl, qm und
--   buchhaltung tragen einsatz.lesen alle drei.
DROP POLICY IF EXISTS rk_bookings_lesen ON public.bookings;
CREATE POLICY rk_bookings_lesen ON public.bookings
  FOR SELECT TO authenticated
  USING (public.darf('einsatz.lesen') AND organization_id = public.current_org_id());

-- ── care_notes → pflege.lesen ─────────────────────────────
--   Pflegenotizen. Die Tabelle traegt verlauf_id und massnahme_id — sie
--   haengt am Pflegeprozess und kann Gesundheitsangaben zum Klienten
--   enthalten. NICHT stammdaten.lesen (das haette die Buchhaltung
--   eingeschlossen, der lib/auth/rollen.ts ausdruecklich keine
--   Gesundheitsdaten zugesteht).
DROP POLICY IF EXISTS rk_care_notes_lesen ON public.care_notes;
CREATE POLICY rk_care_notes_lesen ON public.care_notes
  FOR SELECT TO authenticated
  USING (public.darf('pflege.lesen') AND organization_id = public.current_org_id());

-- ── caregiver_bonuses → bonus.verwalten ─────────────────────────────
--   Verguetung, nicht Personalstammdatum. Der Vorbehalt steht schon in
--   BEREICHE ('/admin/bonuses' → bonus.verwalten) und in
--   NUR_ADMINISTRATION. Die Policy AENDERT NICHTS an der Sichtbarkeit
--   (bonus.verwalten haben nur admin und superadmin, genau wie
--   is_admin()); sie schreibt die Entscheidung nur dorthin, wo sie
--   gelesen wird — in die Datenbank. Vorher stand dort keine, und
--   'niemand hat es entschieden' sah aus wie 'niemand darf'.
DROP POLICY IF EXISTS rk_caregiver_bonuses_lesen ON public.caregiver_bonuses;
CREATE POLICY rk_caregiver_bonuses_lesen ON public.caregiver_bonuses
  FOR SELECT TO authenticated
  USING (public.darf('bonus.verwalten') AND organization_id = public.current_org_id());

-- ── caregiver_documents → personal.lesen ─────────────────────────────
--   Personalakte: Fuehrungszeugnis, Vertraege, Nachweise — genau das, was
--   lib/auth/rollen.ts der Buchhaltung ausdruecklich verwehrt.
DROP POLICY IF EXISTS rk_caregiver_documents_lesen ON public.caregiver_documents;
CREATE POLICY rk_caregiver_documents_lesen ON public.caregiver_documents
  FOR SELECT TO authenticated
  USING (public.darf('personal.lesen') AND organization_id = public.current_org_id());

-- ── caregiver_initials_history → personal.lesen ─────────────────────────────
--   Handzeichen-Historie der Mitarbeitenden; Teil der Personalakte und
--   Grundlage jeder Unterschriftszuordnung.
DROP POLICY IF EXISTS rk_caregiver_initials_history_lesen ON public.caregiver_initials_history;
CREATE POLICY rk_caregiver_initials_history_lesen ON public.caregiver_initials_history
  FOR SELECT TO authenticated
  USING (public.darf('personal.lesen') AND organization_id = public.current_org_id());

-- ── caregiver_qualifications → personal.lesen ─────────────────────────────
--   Qualifikationsnachweise. Der Ursprungsbefund vom 29.08.2026:
--   /admin/nachweise zeigte der Pflegedienstleitung 'keine Nachweise
--   vorhanden', obwohl Fuehrungszeugnisse abliefen.
DROP POLICY IF EXISTS rk_caregiver_qualifications_lesen ON public.caregiver_qualifications;
CREATE POLICY rk_caregiver_qualifications_lesen ON public.caregiver_qualifications
  FOR SELECT TO authenticated
  USING (public.darf('personal.lesen') AND organization_id = public.current_org_id());

-- ── client_preferred_substitutes → einsatz.lesen ─────────────────────────────
--   Wunsch-Vertretungen je Klient. Reine Einsatzplanung — weder
--   Gesundheits- noch Personalakte.
DROP POLICY IF EXISTS rk_client_preferred_substitutes_lesen ON public.client_preferred_substitutes;
CREATE POLICY rk_client_preferred_substitutes_lesen ON public.client_preferred_substitutes
  FOR SELECT TO authenticated
  USING (public.darf('einsatz.lesen') AND organization_id = public.current_org_id());

-- ── cooperation_partners → stammdaten.lesen ─────────────────────────────
--   Kooperationspartner — Stammdaten des Umfelds, keine Gesundheits-
--   und keine Personaldaten.
DROP POLICY IF EXISTS rk_cooperation_partners_lesen ON public.cooperation_partners;
CREATE POLICY rk_cooperation_partners_lesen ON public.cooperation_partners
  FOR SELECT TO authenticated
  USING (public.darf('stammdaten.lesen') AND organization_id = public.current_org_id());

-- ── datenannahmestellen → abrechnung.lesen ─────────────────────────────
--   DTA-Datenannahmestellen. Abrechnungsstammdaten; die Zeilen ohne
--   organization_id sind bundesweite Vorgaben und werden vom Fence
--   ausdruecklich durchgelassen — die Policy bildet das nach.
DROP POLICY IF EXISTS rk_datenannahmestellen_lesen ON public.datenannahmestellen;
CREATE POLICY rk_datenannahmestellen_lesen ON public.datenannahmestellen
  FOR SELECT TO authenticated
  USING (public.darf('abrechnung.lesen') AND (organization_id IS NULL OR organization_id = public.current_org_id()));

-- ── dta_dakota_auftraege → abrechnung.lesen ─────────────────────────────
--   DTA-Auftraege an die Kostentraeger — der Versandvorgang der
--   Kassenabrechnung. Gehoert zur Abrechnung und zu nichts sonst.
DROP POLICY IF EXISTS rk_dta_dakota_auftraege_lesen ON public.dta_dakota_auftraege;
CREATE POLICY rk_dta_dakota_auftraege_lesen ON public.dta_dakota_auftraege
  FOR SELECT TO authenticated
  USING (public.darf('abrechnung.lesen') AND organization_id = public.current_org_id());

-- ── einsatz_absagen → einsatz.lesen ─────────────────────────────
--   Abgesagte Einsaetze samt Ersatzsuche. Einsatzgeschehen; die
--   Buchhaltung braucht es fuer nicht erbrachte Leistungen.
DROP POLICY IF EXISTS rk_einsatz_absagen_lesen ON public.einsatz_absagen;
CREATE POLICY rk_einsatz_absagen_lesen ON public.einsatz_absagen
  FOR SELECT TO authenticated
  USING (public.darf('einsatz.lesen') AND organization_id = public.current_org_id());

-- ── kostentraeger_kontakte → stammdaten.lesen ─────────────────────────────
--   Ansprechpersonen bei Kassen und Kostentraegern — Kontaktstammdaten des
--   Umfelds, keine Gesundheits- und keine Personaldaten.
DROP POLICY IF EXISTS rk_kostentraeger_kontakte_lesen ON public.kostentraeger_kontakte;
CREATE POLICY rk_kostentraeger_kontakte_lesen ON public.kostentraeger_kontakte
  FOR SELECT TO authenticated
  USING (public.darf('stammdaten.lesen') AND organization_id = public.current_org_id());

-- ── monthly_closings → abrechnung.lesen ─────────────────────────────
--   Monatsabschluesse je Klient — die Rechnungsgrundlage und damit
--   Gegenstand der Abrechnung.
DROP POLICY IF EXISTS rk_monthly_closings_lesen ON public.monthly_closings;
CREATE POLICY rk_monthly_closings_lesen ON public.monthly_closings
  FOR SELECT TO authenticated
  USING (public.darf('abrechnung.lesen') AND organization_id = public.current_org_id());

-- ── ocr_results → einsatz.lesen ─────────────────────────────
--   Texterkennung eingescannter Leistungsnachweise. Der Nachweis ist
--   Einsatzgeschehen; qm prueft ihn, die Buchhaltung rechnet ihn ab.
DROP POLICY IF EXISTS rk_ocr_results_lesen ON public.ocr_results;
CREATE POLICY rk_ocr_results_lesen ON public.ocr_results
  FOR SELECT TO authenticated
  USING (public.darf('einsatz.lesen') AND organization_id = public.current_org_id());

-- ── partner_visits → stammdaten.lesen ─────────────────────────────
--   Besuche bei Kooperationspartnern. Gehoert sachlich zu
--   cooperation_partners und traegt deshalb dasselbe Recht.
DROP POLICY IF EXISTS rk_partner_visits_lesen ON public.partner_visits;
CREATE POLICY rk_partner_visits_lesen ON public.partner_visits
  FOR SELECT TO authenticated
  USING (public.darf('stammdaten.lesen') AND organization_id = public.current_org_id());

-- ── payment_allocations → abrechnung.lesen ─────────────────────────────
--   Zuordnung von Zahlungen zu Rechnungen; ohne sie ist kein offener Posten
--   nachvollziehbar.
DROP POLICY IF EXISTS rk_payment_allocations_lesen ON public.payment_allocations;
CREATE POLICY rk_payment_allocations_lesen ON public.payment_allocations
  FOR SELECT TO authenticated
  USING (public.darf('abrechnung.lesen') AND organization_id = public.current_org_id());

-- ── payment_status → abrechnung.lesen ─────────────────────────────
--   Zahlungsstand je Rechnung — die Sicht der Buchhaltung auf offene Posten.
DROP POLICY IF EXISTS rk_payment_status_lesen ON public.payment_status;
CREATE POLICY rk_payment_status_lesen ON public.payment_status
  FOR SELECT TO authenticated
  USING (public.darf('abrechnung.lesen') AND organization_id = public.current_org_id());

-- ── review_errors → einsatz.lesen ─────────────────────────────
--   Prueffehler am Leistungsnachweis (haengen an service_record_id und
--   ocr_result_id). Drei Seiten lesen sie aus drei Bereichen — QM-
--   Pruefprotokoll, Monatsabschluss, Nachweis-Upload. einsatz.lesen ist
--   das Recht, das alle drei Rollen tragen, und zugleich das, dem der
--   Gegenstand gehoert: der Nachweis.
DROP POLICY IF EXISTS rk_review_errors_lesen ON public.review_errors;
CREATE POLICY rk_review_errors_lesen ON public.review_errors
  FOR SELECT TO authenticated
  USING (public.darf('einsatz.lesen') AND organization_id = public.current_org_id());

-- ── state_settings → einsatz.lesen ─────────────────────────────
--   Bundeslandfreischaltung. /admin/kalender liest daraus die
--   Bundeslaender fuer die Feiertage. Schreiben bleibt bei is_admin();
--   diese Policy gilt ausschliesslich fuer SELECT.
DROP POLICY IF EXISTS rk_state_settings_lesen ON public.state_settings;
CREATE POLICY rk_state_settings_lesen ON public.state_settings
  FOR SELECT TO authenticated
  USING (public.darf('einsatz.lesen') AND organization_id = public.current_org_id());

-- ── substitution_requests → einsatz.lesen ─────────────────────────────
--   Vertretungsanfragen im Dienstplan — Teil der laufenden Einsatzplanung.
DROP POLICY IF EXISTS rk_substitution_requests_lesen ON public.substitution_requests;
CREATE POLICY rk_substitution_requests_lesen ON public.substitution_requests
  FOR SELECT TO authenticated
  USING (public.darf('einsatz.lesen') AND organization_id = public.current_org_id());

-- ── verordnung_leistungen → pflege.lesen ─────────────────────────────
--   Positionen einer aerztlichen Verordnung. Teilt das Schicksal der
--   Verordnung selbst und damit deren Recht.
DROP POLICY IF EXISTS rk_verordnung_leistungen_lesen ON public.verordnung_leistungen;
CREATE POLICY rk_verordnung_leistungen_lesen ON public.verordnung_leistungen
  FOR SELECT TO authenticated
  USING (public.darf('pflege.lesen') AND organization_id = public.current_org_id());

-- ── verordnungen → pflege.lesen ─────────────────────────────
--   Aerztliche Verordnungen. Die Tabelle fuehrt eine Spalte `diagnose` —
--   ein Gesundheitsdatum. Deshalb pflege.lesen, obwohl /admin/abrechnung
--   sie ebenfalls liest: die Buchhaltung bekommt hier bewusst NICHTS.
--   Braucht die Abrechnung die Genehmigungsdaten, gehoert dafuer eine
--   Route her, die nur die abrechnungsrelevanten Spalten herausgibt —
--   RLS kann keine Spalten ausblenden.
DROP POLICY IF EXISTS rk_verordnungen_lesen ON public.verordnungen;
CREATE POLICY rk_verordnungen_lesen ON public.verordnungen
  FOR SELECT TO authenticated
  USING (public.darf('pflege.lesen') AND organization_id = public.current_org_id());

