-- ═══════════════════════════════════════════════════════════════════════
-- mis-documents: der Bucket ohne Policy (Block 103, 14.09.2026)
-- ═══════════════════════════════════════════════════════════════════════
--
-- BEFUND
--
-- `storage.objects` traegt RLS (relrowsecurity=true). Jede der fuenfzehn
-- vorhandenen Policies nennt ausdruecklich ihren `bucket_id`; eine
-- bucket-uebergreifende gibt es nicht. Versorgt sind damit genau fuenf
-- Buckets: abrechnung, documents, dta-dateien, service-proofs,
-- verordnungen.
--
-- `mis-documents` gehoert NICHT dazu — und ist der einzige Bucket, der
-- aus einer Oberflaeche mit dem BROWSER-Client angefasst wird
-- (app/mis/documents/page.tsx). Fuer `authenticated` ist er damit
-- vollstaendig zu: jeder Upload und jede signierte URL scheitert.
--
-- Leise. `supabase.storage.…upload()` wirft nicht, es gibt `error`
-- zurueck — und genau der wurde dort verworfen, waehrend der
-- Datenbankeintrag trotzdem angelegt wurde.
--
-- LIVE NACHGEMESSEN am 14.09.2026:
--     mis_documents mit file_path : 1
--     Objekte in mis-documents    : 0
--     Zeilen ohne ihre Datei      : 1
--
-- Der eine vorhandene Eintrag zeigt auf eine Datei, die es nie gegeben
-- hat. Die Oberflaeche hat beim Anlegen Erfolg gemeldet.
--
-- ── WARUM DIESE BEDINGUNGEN ────────────────────────────────────────────
--
-- Gespiegelt wird, was fuer die TABELLE `mis_documents` schon gilt
-- (live aus pg_policies gelesen):
--     Admin full access on mis_documents  ALL  is_admin()
--     mis_documents_org_fence             ALL  organization_id = current_org_id()
--
-- Der Speicher kennt keine `organization_id`-Spalte, deshalb steht der
-- Mandant im PFAD. Die Oberflaeche legt heute unter `documents/<name>`
-- ab — ohne Mandantensegment. Diese Migration verlangt es ab sofort:
-- `<organization_id>/documents/<name>`. Der Code wird im selben Zug
-- umgestellt; der eine Altbestandseintrag traegt ohnehin keine Datei.
--
-- Das ist dasselbe Muster wie bei `dta-dateien`, wo der Mandant als
-- zweites Pfadsegment geprueft wird — nur steht er hier an erster
-- Stelle, weil es kein vorangestelltes Sammelverzeichnis gibt.
--
-- KEIN `service_role`-Zweig: der Dienstschluessel umgeht RLS ohnehin.
-- Eine Policy dafuer waere Zierde und wuerde vortaeuschen, dass hier
-- etwas geprueft wird, was gar nicht geprueft werden kann.
-- ═══════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS mis_documents_storage_select ON storage.objects;
DROP POLICY IF EXISTS mis_documents_storage_insert ON storage.objects;
DROP POLICY IF EXISTS mis_documents_storage_update ON storage.objects;
DROP POLICY IF EXISTS mis_documents_storage_delete ON storage.objects;

CREATE POLICY mis_documents_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'mis-documents'
    AND (storage.foldername(name))[1] = (current_org_id())::text
  );

CREATE POLICY mis_documents_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'mis-documents'
    AND (storage.foldername(name))[1] = (current_org_id())::text
  );

-- Aendern und Entfernen bleiben der Administration vorbehalten: ein
-- freigegebenes Dokument der Lenkung darf nicht von jedem Mitglied des
-- Mandanten ueberschrieben werden.
CREATE POLICY mis_documents_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'mis-documents'
    AND is_admin()
    AND (storage.foldername(name))[1] = (current_org_id())::text
  );

CREATE POLICY mis_documents_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'mis-documents'
    AND is_admin()
    AND (storage.foldername(name))[1] = (current_org_id())::text
  );
