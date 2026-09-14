-- Rücknahme zu 20261215000000_abrechnung_storage_mandantenzaun.sql
--
-- Stellt die mandantenblinden Policies wieder her. Danach liest die
-- Administration jeder Organisation die Abrechnungsdateien jeder anderen
-- — das ist der Zustand VOR Block 104 und ausdruecklich kein guter.

DROP POLICY IF EXISTS admin_abrechnung_storage_select ON storage.objects;
DROP POLICY IF EXISTS admin_abrechnung_storage_insert ON storage.objects;
DROP POLICY IF EXISTS admin_abrechnung_storage_update ON storage.objects;
DROP POLICY IF EXISTS admin_abrechnung_storage_delete ON storage.objects;

CREATE POLICY admin_abrechnung_storage_select ON storage.objects
  FOR SELECT USING (bucket_id = 'abrechnung' AND is_admin());

CREATE POLICY admin_abrechnung_storage_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'abrechnung' AND is_admin());

CREATE POLICY admin_abrechnung_storage_update ON storage.objects
  FOR UPDATE USING (bucket_id = 'abrechnung' AND is_admin());

CREATE POLICY admin_abrechnung_storage_delete ON storage.objects
  FOR DELETE USING (bucket_id = 'abrechnung' AND is_admin());
