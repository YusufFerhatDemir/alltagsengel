-- Content Blocks: Admin-managed text content for public pages
CREATE TABLE IF NOT EXISTS public.content_blocks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  title text,
  content text NOT NULL,
  context text DEFAULT 'public' CHECK (context IN ('public','admin','internal')),
  language text DEFAULT 'de' CHECK (language IN ('de','en','tr','fr')),
  status text DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_blocks_key ON public.content_blocks(key);
CREATE INDEX IF NOT EXISTS idx_content_blocks_status ON public.content_blocks(status);
CREATE INDEX IF NOT EXISTS idx_content_blocks_context ON public.content_blocks(context);

ALTER TABLE public.content_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active content" ON public.content_blocks
  FOR SELECT USING (status = 'active' AND context = 'public');

CREATE POLICY "Admin manages all content" ON public.content_blocks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );

-- Seed default content blocks
INSERT INTO public.content_blocks (key, title, content, context) VALUES
  ('kf_homepage_price', 'Krankenfahrten Preis-Label (Homepage)', 'Preis nach Region & Fahrtart', 'public'),
  ('kf_homepage_desc', 'Krankenfahrten Beschreibung (Homepage)', 'Sichere Fahrten zu Ärzten, Kliniken und Therapien', 'public'),
  ('kf_landing_title', 'Krankenfahrten Landing Title', 'Krankenfahrten-Vermittlung', 'public'),
  ('kf_landing_subtitle', 'Krankenfahrten Landing Subtitle', 'Sicher und zuverlässig zum Arzt — die Preise richten sich nach Region, Fahrtart und Hilfebedarf', 'public'),
  ('kf_landing_what_title', 'Was sind Krankenfahrten?', 'Was sind Krankenfahrten?', 'public'),
  ('kf_landing_what_text', 'Krankenfahrten Erklärung', 'Krankenfahrten sind Fahrten zu medizinischen Behandlungen, die von der Krankenkasse genehmigt oder verordnet werden. Wir vermitteln qualifizierte Fahrer, die Sie sicher und pünktlich zu Ihren Arztterminen bringen.', 'public'),
  ('kf_landing_services_title', 'Leistungen Title', 'Unsere Leistungen', 'public'),
  ('kf_landing_service_1', 'Leistung 1', 'Fahrten zu Ärzten, Kliniken und Therapien', 'public'),
  ('kf_landing_service_2', 'Leistung 2', 'Begleitung für mobilitätseingeschränkte Personen', 'public'),
  ('kf_landing_service_3', 'Leistung 3', 'Pünktliche Abholung und Rückfahrt', 'public'),
  ('kf_landing_service_4', 'Leistung 4', 'Abrechnung über Verordnung möglich', 'public'),
  ('kf_landing_service_5', 'Leistung 5', 'Verfügbarkeit nach Region und Partnernetz', 'public'),
  ('kf_landing_price_note', 'Preis-Hinweis', 'Die Preise richten sich nach Region, Fahrtart, Hilfebedarf, Dokumentenstatus und Partnerverfügbarkeit. Bei ärztlicher Verordnung übernimmt die Krankenkasse die Kosten ganz oder teilweise.', 'public'),
  ('kf_landing_step_1', 'Schritt 1', 'Registrieren Sie sich als Kunde bei Alltagsengel', 'public'),
  ('kf_landing_step_2', 'Schritt 2', 'Buchen Sie eine Krankenfahrt mit Datum und Ziel', 'public'),
  ('kf_landing_step_3', 'Schritt 3', 'Ein Fahrer wird Ihnen zugeteilt und holt Sie ab', 'public')
ON CONFLICT (key) DO NOTHING;
