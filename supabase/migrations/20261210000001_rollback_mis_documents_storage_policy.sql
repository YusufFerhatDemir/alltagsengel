-- Rücknahme zu 20261210000000_mis_documents_storage_policy.sql
--
-- Danach ist `mis-documents` wieder ohne Policy — also fuer `anon` und
-- `authenticated` vollstaendig zu. Das ist der Zustand VOR Block 103 und
-- fail-closed; er bricht nichts auf, er macht die MIS-Dokumentenlenkung
-- nur wieder unbenutzbar.

DROP POLICY IF EXISTS mis_documents_storage_select ON storage.objects;
DROP POLICY IF EXISTS mis_documents_storage_insert ON storage.objects;
DROP POLICY IF EXISTS mis_documents_storage_update ON storage.objects;
DROP POLICY IF EXISTS mis_documents_storage_delete ON storage.objects;
