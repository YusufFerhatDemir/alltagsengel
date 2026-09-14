-- ═══════════════════════════════════════════════════════════════════════
-- Abrechnungsdateien: der Zaun, den nur der Nachbarbucket hatte
-- (Block 104, 14.09.2026)
-- ═══════════════════════════════════════════════════════════════════════
--
-- BEFUND
--
-- `is_admin()` ist MANDANTENBLIND. Live aus pg_proc gelesen:
--
--     SELECT EXISTS (SELECT 1 FROM public.profiles
--                     WHERE id = auth.uid()
--                       AND role = ANY (ARRAY['admin','superadmin'])
--                       AND deleted_at IS NULL)
--
-- Keine Organisation, nirgends. Die vier Policies auf dem Bucket
-- `abrechnung` pruefen aber NUR das:
--
--     admin_abrechnung_storage_select   USING (bucket_id = 'abrechnung' AND is_admin())
--     … dasselbe fuer insert, update, delete
--
-- Damit liest, schreibt, aendert und loescht die Administration JEDER
-- Organisation die Abrechnungsdateien JEDER anderen. In diesem Bucket
-- liegen die DTA-Dateien fuer die Datenannahmestellen — Versichertendaten,
-- Leistungen, Betraege, je Kostentraeger.
--
-- DER NACHBAR MACHT ES RICHTIG. `dta-dateien`, im selben System, mit
-- denselben Mitteln:
--
--     USING (bucket_id = 'dta-dateien' AND is_admin()
--            AND (storage.foldername(name))[2] = (current_org_id())::text)
--
-- Wieder derselbe Satz wie in den Bloecken 55 bis 103: der Riegel, der
-- entscheidet, war lockerer als sein Gegenstueck nebenan.
--
-- ── WARUM DAS OHNE CODE-AENDERUNG GEHT ────────────────────────────────
-- Der Pfad traegt die Organisation bereits. lib/abrechnung/
-- kassenabrechnung-engine.ts legt ab als
--
--     dta/<organization_id>/<laufId>/<dateiname>
--
-- Das zweite Segment IST der Mandant — genau wie bei `dta-dateien`. Die
-- Bedingung liest ihn also nur aus, sie verlangt nichts Neues.
--
-- ── WAS DIESER ZAUN NICHT LEISTET ─────────────────────────────────────
-- `current_org_id()` faellt am Ende auf die Stamm-Organisation zurueck
-- (live gelesen: COALESCE(…, '00000000-0000-4000-8000-000460629986')).
-- Ein Administrator ohne Mitgliedschaft, ohne caregivers- und ohne
-- clients-Zeile landet damit in der Stamm-Org und sieht DEREN Dateien.
-- Das ist die bekannte Fail-open-Eigenschaft der Funktion; sie wird hier
-- NICHT behoben, und `dta-dateien` lebt seit jeher mit derselben Grenze.
-- Der Zaun schliesst den Weg zwischen ZWEI gepflegten Mandanten — nicht
-- den Sonderfall eines Kontos ohne jede Zuordnung.
--
-- ── LAGE BEIM EINSPIELEN ──────────────────────────────────────────────
-- Der Bucket `abrechnung` enthaelt live NULL Objekte (14.09.2026). Es
-- gibt keinen Altbestand, dem der Zaun den Zugriff nehmen koennte.
-- ═══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS admin_abrechnung_storage_select ON storage.objects;
DROP POLICY IF EXISTS admin_abrechnung_storage_insert ON storage.objects;
DROP POLICY IF EXISTS admin_abrechnung_storage_update ON storage.objects;
DROP POLICY IF EXISTS admin_abrechnung_storage_delete ON storage.objects;

CREATE POLICY admin_abrechnung_storage_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'abrechnung'
    AND is_admin()
    AND (storage.foldername(name))[2] = (current_org_id())::text
  );

CREATE POLICY admin_abrechnung_storage_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'abrechnung'
    AND is_admin()
    AND (storage.foldername(name))[2] = (current_org_id())::text
  );

CREATE POLICY admin_abrechnung_storage_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'abrechnung'
    AND is_admin()
    AND (storage.foldername(name))[2] = (current_org_id())::text
  );

CREATE POLICY admin_abrechnung_storage_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'abrechnung'
    AND is_admin()
    AND (storage.foldername(name))[2] = (current_org_id())::text
  );
