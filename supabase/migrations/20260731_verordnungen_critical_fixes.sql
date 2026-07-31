-- ═══════════════════════════════════════════════════════════════
-- Verordnungs-Workflow — Kritische Fixes (31.07.2026)
-- ═══════════════════════════════════════════════════════════════
-- Alltagsengel deckt BEIDES ab: Alltagsbegleitung §45a/§45b SGB XI
-- UND ambulante Pflege §37 SGB V / §36 SGB XI.
--
-- 1. Multi-Leistungsart: verordnung_leistungen (mehrere Positionen
--    pro Rezept, z. B. große Körperpflege 2x/Woche + Medikamente tägl.)
-- 2. RLS-Fix: USING(true)-Policies durch public.is_admin() ersetzen
-- 3. Pflegekasse + Beihilfe + PKV als Kostenträger
-- 4. Pflegegrad, Versichertennummer, Geburtsdatum, Krankenkasse auf clients
-- 5. Abtretungserklärung auf verordnungen
-- 6. Soft-Delete (Revisionssicherheit) — UI filtert deleted_at IS NULL
-- 7. Leistungsart-CHECK erweitert (Behandlungspflege-Unterkategorien)
--
-- Idempotent: IF NOT EXISTS / DROP IF EXISTS.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Multi-Leistungsart pro Verordnung
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verordnung_leistungen (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  verordnung_id uuid NOT NULL REFERENCES verordnungen(id) ON DELETE CASCADE,
  leistungsart text NOT NULL,
  haeufigkeit text, -- z.B. '2x_woche', 'taeglich', '1x_woche'
  menge integer DEFAULT 1,
  dauer_minuten integer, -- Dauer pro Einsatz
  leistungskomplex text, -- LK-Nummer (LK1-LK35) für §89 SGB XI
  preis_cent integer,
  bemerkung text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verordnung_leistungen_verordnung
  ON verordnung_leistungen(verordnung_id);

ALTER TABLE verordnung_leistungen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_only" ON verordnung_leistungen;
CREATE POLICY "admin_only" ON verordnung_leistungen
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. RLS fixen — unsichere USING(true)-Policies ersetzen
-- ---------------------------------------------------------------------------
-- leistungspreise
DROP POLICY IF EXISTS "leistungspreise_policy" ON leistungspreise;
DROP POLICY IF EXISTS "leistungspreise_admin_all" ON leistungspreise;
DROP POLICY IF EXISTS "admin_leistungspreise" ON leistungspreise;
CREATE POLICY "admin_leistungspreise" ON leistungspreise
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- kostentraeger_kontakte
DROP POLICY IF EXISTS "kostentraeger_kontakte_policy" ON kostentraeger_kontakte;
DROP POLICY IF EXISTS "kostentraeger_kontakte_admin_all" ON kostentraeger_kontakte;
DROP POLICY IF EXISTS "admin_kostentraeger" ON kostentraeger_kontakte;
CREATE POLICY "admin_kostentraeger" ON kostentraeger_kontakte
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- einsatz_absagen
DROP POLICY IF EXISTS "einsatz_absagen_policy" ON einsatz_absagen;
DROP POLICY IF EXISTS "einsatz_absagen_admin_all" ON einsatz_absagen;
DROP POLICY IF EXISTS "admin_absagen" ON einsatz_absagen;
CREATE POLICY "admin_absagen" ON einsatz_absagen
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Pflegekasse + weitere Kostenträger
-- ---------------------------------------------------------------------------
ALTER TABLE verordnungen DROP CONSTRAINT IF EXISTS verordnungen_kostentraeger_typ_check;
ALTER TABLE verordnungen ADD CONSTRAINT verordnungen_kostentraeger_typ_check
  CHECK (kostentraeger_typ IN ('krankenkasse', 'pflegekasse', 'sozialamt', 'privat', 'berufsgenossenschaft', 'beihilfe', 'pkv'));

ALTER TABLE kostentraeger_kontakte DROP CONSTRAINT IF EXISTS kostentraeger_kontakte_typ_check;
ALTER TABLE kostentraeger_kontakte ADD CONSTRAINT kostentraeger_kontakte_typ_check
  CHECK (typ IN ('krankenkasse', 'pflegekasse', 'sozialamt', 'berufsgenossenschaft', 'beihilfe', 'pkv'));

-- ---------------------------------------------------------------------------
-- 4. Pflegegrad + Versichertennummer auf clients
-- ---------------------------------------------------------------------------
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pflegegrad integer CHECK (pflegegrad BETWEEN 1 AND 5);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS versichertennummer text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS geburtsdatum date;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS krankenkasse text;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS krankenkasse_ik text;

-- ---------------------------------------------------------------------------
-- 5. Abtretungserklärung
-- ---------------------------------------------------------------------------
ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS abtretungserklaerung_vorhanden boolean DEFAULT false;
ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS abtretungserklaerung_datum date;
ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS abtretungserklaerung_document_url text;

-- ---------------------------------------------------------------------------
-- 6. Soft-Delete statt Hard-Delete (Revisionssicherheit)
--    UI filtert überall: WHERE deleted_at IS NULL
-- ---------------------------------------------------------------------------
ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS deleted_by uuid;
CREATE INDEX IF NOT EXISTS idx_verordnungen_deleted_at ON verordnungen(deleted_at);

-- ---------------------------------------------------------------------------
-- 7. Leistungsart-CHECK erweitern (Behandlungspflege-Unterkategorien
--    + §45a/§45b/§39 SGB XI für Alltagsbegleitung/Entlastung)
-- ---------------------------------------------------------------------------
ALTER TABLE verordnungen DROP CONSTRAINT IF EXISTS verordnungen_leistungsart_check;
ALTER TABLE verordnungen ADD CONSTRAINT verordnungen_leistungsart_check
  CHECK (leistungsart IN (
    'grosse_koerperpflege', 'kleine_koerperpflege', 'hilfe_ausscheiden',
    'hauswirtschaft', 'behandlungspflege', 'medikamentengabe',
    'injektionen', 'wundversorgung', 'kompressionsstruempfe',
    'blutzuckermessung', 'katheter', 'stomaversorgung',
    'alltagsbegleitung_45a', 'verhinderungspflege_39',
    'entlastung_45b', 'sonstige'
  ));

COMMIT;
