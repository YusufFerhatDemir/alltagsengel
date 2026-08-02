-- ═══════════════════════════════════════════════════════════════
-- Verordnungs-Workflow komplett (30.07.2026)
-- ═══════════════════════════════════════════════════════════════
-- Erweitert die `verordnungen`-Tabelle um den vollständigen Workflow:
--   Erfassung → Kassengenehmigung → Verplanung → Leistungsnachweis → Abrechnung
--
-- 1. Leistungsart (§37 SGB V Grundpflege-Kategorien), Gültigkeitszeitraum
--    (Verordnungen gelten 2–6 Monate), Verordnungsnummer des Arztes,
--    Zeitstempel für Antrag/Antwort der Kasse, Abrechnungsstatus.
-- 2. Verknüpfung von service_records / assignments / invoices mit der
--    Verordnung, damit Leistungen, Einsatzplanung und Rechnungen je
--    Genehmigungsnummer nachvollziehbar sind.
-- 3. Privater Storage-Bucket `verordnungen` für die Scans der Verordnungen.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, text+CHECK statt Enums.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. VERORDNUNGEN — Workflow-Spalten
-- ---------------------------------------------------------------------------

-- Leistungsart nach §37 SGB V (Grundpflege-Kategorien)
ALTER TABLE public.verordnungen
    ADD COLUMN IF NOT EXISTS leistungsart text CHECK (leistungsart IN (
        'grosse_koerperpflege', 'kleine_koerperpflege', 'hilfe_ausscheiden',
        'hauswirtschaft', 'behandlungspflege', 'sonstige'
    ));

-- Gültigkeitszeitraum der Verordnung (typisch 2–6 Monate)
ALTER TABLE public.verordnungen
    ADD COLUMN IF NOT EXISTS gueltig_von date;
ALTER TABLE public.verordnungen
    ADD COLUMN IF NOT EXISTS gueltig_bis date;

-- Verordnungsnummer vom Arzt (Muster 12 / Rezeptnummer)
ALTER TABLE public.verordnungen
    ADD COLUMN IF NOT EXISTS verordnung_nummer text;

-- Zeitstempel des Kassen-Workflows
ALTER TABLE public.verordnungen
    ADD COLUMN IF NOT EXISTS kassengenehmigung_beantragt_am timestamptz;
ALTER TABLE public.verordnungen
    ADD COLUMN IF NOT EXISTS kassengenehmigung_antwort_am timestamptz;

-- Abrechnungsstatus je Verordnung
ALTER TABLE public.verordnungen
    ADD COLUMN IF NOT EXISTS abrechnungs_status text NOT NULL DEFAULT 'offen'
    CHECK (abrechnungs_status IN (
        'offen', 'teilweise_abgerechnet', 'vollstaendig_abgerechnet'
    ));

-- Genehmigtes Stundenkontingent (für Verbrauchs-Übersicht Ist vs. Genehmigt)
ALTER TABLE public.verordnungen
    ADD COLUMN IF NOT EXISTS genehmigte_stunden_gesamt numeric(6,2);
ALTER TABLE public.verordnungen
    ADD COLUMN IF NOT EXISTS genehmigte_stunden_pro_woche numeric(5,2);

-- ---------------------------------------------------------------------------
-- 2. VERKNÜPFUNGEN — Leistungen, Einsatzplanung, Rechnungen je Verordnung
-- ---------------------------------------------------------------------------

-- Welche Leistung wurde unter welcher Verordnung erbracht?
ALTER TABLE public.service_records
    ADD COLUMN IF NOT EXISTS verordnung_id uuid REFERENCES public.verordnungen(id) ON DELETE SET NULL;

-- Einsatzplanung je Verordnung
ALTER TABLE public.assignments
    ADD COLUMN IF NOT EXISTS verordnung_id uuid REFERENCES public.verordnungen(id) ON DELETE SET NULL;

-- Abrechnung je Genehmigungsnummer
ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS verordnung_id uuid REFERENCES public.verordnungen(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_records_verordnung ON public.service_records(verordnung_id);
CREATE INDEX IF NOT EXISTS idx_assignments_verordnung     ON public.assignments(verordnung_id);
CREATE INDEX IF NOT EXISTS idx_invoices_verordnung        ON public.invoices(verordnung_id);
CREATE INDEX IF NOT EXISTS idx_verordnungen_gueltig_bis   ON public.verordnungen(gueltig_bis);
CREATE INDEX IF NOT EXISTS idx_verordnungen_abrechnung    ON public.verordnungen(abrechnungs_status);

-- ---------------------------------------------------------------------------
-- 3. STORAGE — Privater Bucket für Verordnungs-Scans
-- ---------------------------------------------------------------------------
-- DSGVO: Verordnungen enthalten Diagnosen — Bucket ist privat, Zugriff nur
-- über signierte URLs (analog service-proofs). Nur Admins + service_role.

INSERT INTO storage.buckets (id, name, public)
VALUES ('verordnungen', 'verordnungen', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
    DROP POLICY IF EXISTS verordnungen_scans_admin_all ON storage.objects;
CREATE POLICY verordnungen_scans_admin_all ON storage.objects
        FOR ALL USING (bucket_id = 'verordnungen' AND public.is_admin())
        WITH CHECK (bucket_id = 'verordnungen' AND public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    DROP POLICY IF EXISTS verordnungen_scans_service_all ON storage.objects;
CREATE POLICY verordnungen_scans_service_all ON storage.objects
        FOR ALL TO service_role
        USING (bucket_id = 'verordnungen')
        WITH CHECK (bucket_id = 'verordnungen');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
