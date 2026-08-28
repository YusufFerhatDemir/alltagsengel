-- Rollback für 20261015000000_angels_policy_haertung.sql

BEGIN;

-- INSERT zurückgeben
GRANT INSERT ON public.angels TO authenticated;

-- INSERT-Policy wiederherstellen
CREATE POLICY "Angels can create own profile" ON public.angels
  FOR INSERT WITH CHECK (auth.uid() = id);

-- UPDATE-Spalteneinschränkung aufheben
REVOKE UPDATE ON public.angels FROM authenticated;
GRANT UPDATE ON public.angels TO authenticated;

-- Stale admin-Policy wiederherstellen (nur als Rollback-Sicherheit)
CREATE POLICY "Admins can manage all angels" ON public.angels
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
  );

COMMIT;
