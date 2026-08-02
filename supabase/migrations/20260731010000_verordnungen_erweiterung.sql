-- ═══════════════════════════════════════════════════════════════
-- Verordnungs-Workflow — Erweiterung
-- Kostenträger, Leistungspreise, Kassen-Kontakte, Kürzungen,
-- Absagen-Tracking, Genehmigungs-Abgleich
-- ═══════════════════════════════════════════════════════════════
BEGIN;

-- a) Kostenträger auf verordnungen ────────────────────────────────
ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS kostentraeger_typ text NOT NULL DEFAULT 'krankenkasse' CHECK (kostentraeger_typ IN ('krankenkasse', 'sozialamt', 'privat', 'berufsgenossenschaft'));
ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS kostentraeger_name text;
ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS kostentraeger_ik_nummer text; -- Institutionskennzeichen

-- b) Leistungspreise pro Bundesland ────────────────────────────────
CREATE TABLE IF NOT EXISTS leistungspreise (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bundesland text NOT NULL CHECK (bundesland IN ('baden_wuerttemberg','bayern','berlin','brandenburg','bremen','hamburg','hessen','mecklenburg_vorpommern','niedersachsen','nordrhein_westfalen','rheinland_pfalz','saarland','sachsen','sachsen_anhalt','schleswig_holstein','thueringen')),
  leistungsart text NOT NULL,
  preis_cent integer NOT NULL, -- price in cents
  gueltig_ab date NOT NULL DEFAULT CURRENT_DATE,
  gueltig_bis date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(bundesland, leistungsart, gueltig_ab)
);

ALTER TABLE leistungspreise ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leistungspreise_admin_all" ON leistungspreise;
CREATE POLICY "leistungspreise_admin_all" ON leistungspreise FOR ALL USING (true) WITH CHECK (true);

-- c) Kassen-Kontaktdatenbank ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kostentraeger_kontakte (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  typ text NOT NULL DEFAULT 'krankenkasse' CHECK (typ IN ('krankenkasse', 'sozialamt', 'berufsgenossenschaft')),
  ik_nummer text,
  email text,
  post_adresse text,
  telefon text,
  fax text,
  bundesland text,
  elektronisch_abrechenbar boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE kostentraeger_kontakte ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "kostentraeger_kontakte_admin_all" ON kostentraeger_kontakte;
CREATE POLICY "kostentraeger_kontakte_admin_all" ON kostentraeger_kontakte FOR ALL USING (true) WITH CHECK (true);

-- d) Kürzungen / Zahlungsstatus auf invoices ──────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS soll_betrag_cent integer;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS ist_betrag_cent integer;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kuerzung_cent integer DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kuerzung_grund text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bezahlt boolean DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS bezahlt_am date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS versand_elektronisch boolean DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS versand_post boolean DEFAULT false;

-- e) Absagen-Tracking ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS einsatz_absagen (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid REFERENCES assignments(id) ON DELETE CASCADE,
  abgesagt_von text NOT NULL CHECK (abgesagt_von IN ('klient', 'mitarbeiterin')),
  abgesagt_am timestamptz DEFAULT now(),
  grund text,
  ersatz_mitarbeiterin_id uuid REFERENCES caregivers(id),
  ersatz_gefunden boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE einsatz_absagen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "einsatz_absagen_admin_all" ON einsatz_absagen;
CREATE POLICY "einsatz_absagen_admin_all" ON einsatz_absagen FOR ALL USING (true) WITH CHECK (true);

-- f) Verordnung-Genehmigung Abgleich-Felder ───────────────────────
ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS genehmigte_leistungsart text;
ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS genehmigung_abgleich_ok boolean;
ALTER TABLE verordnungen ADD COLUMN IF NOT EXISTS genehmigung_abweichung text;

COMMIT;
