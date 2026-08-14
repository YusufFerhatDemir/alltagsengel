-- =============================================================================
-- MIGRATION: 20260719_eylem_audit_complete_features.sql
-- =============================================================================
-- Befund (19.07.2026): Professionelle Prüfung durch Eylem (25 Jahre Erfahrung,
-- 1000+ Betreuungskräfte geführt) ergab 12 fehlende Kernfunktionen.
--
-- Diese Migration schließt den "Kreislauf" den die Pflegekasse braucht:
-- Leistung erfassen → Zeit tracken → Unterschreiben → Abrechnen → Nachweis
--
-- Neue Tabellen:
--   care_notes           — Rollenübergreifendes Notizsystem (BK, Klient, Büro)
--   verordnungen         — Ärztliche Verordnungen / Bewilligungsbescheide
--   service_pricing      — Zentrale Preistabelle Alltagsbegleitung
--
-- Neue Spalten:
--   caregivers           — lifetime_registration_number, ik_nummer
--   clients              — Gesundheitsdaten, Notfallkontakte
--   care_recipients      — Gesundheitsdaten, Notfallkontakte (Marktplatz-Spiegel)
--
-- RLS-Erweiterungen:
--   service_records      — Betreuungskraft darf eigene Records lesen + erstellen
--   invoices             — Klient darf eigene Rechnungen lesen
--   care_notes           — Rollen-basierter Zugriff
--
-- Konventionen: snake_case, uuid PK, timestamptz, text+CHECK statt Enum,
--   IF NOT EXISTS, RLS-Muster aus 20260706.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. CARE_NOTES — Rollenübergreifendes Notizsystem
-- ---------------------------------------------------------------------------
-- Betreuungskraft, Klient und Verwaltung können Notizen zu einem Klienten
-- oder zu einem konkreten Einsatz (service_record) hinterlegen.
-- Autor-Tracking mit Rolle, damit klar ist wer was geschrieben hat.

CREATE TABLE IF NOT EXISTS public.care_notes (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id       uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    service_record_id uuid REFERENCES public.service_records(id) ON DELETE SET NULL,
    author_id       uuid NOT NULL,  -- profiles.id oder caregivers.user_id
    author_role     text NOT NULL CHECK (author_role IN ('engel', 'kunde', 'buero', 'pdl', 'admin')),
    author_name     text NOT NULL DEFAULT '',
    category        text NOT NULL DEFAULT 'allgemein' CHECK (category IN (
        'allgemein', 'gesundheit', 'verhalten', 'medikamente', 'vorfall',
        'uebergabe', 'wunsch', 'beschwerde'
    )),
    content         text NOT NULL,
    is_urgent       boolean NOT NULL DEFAULT false,
    is_internal     boolean NOT NULL DEFAULT false,  -- nur für Büro/PDL sichtbar
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_care_notes_client_id ON public.care_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_care_notes_service_record_id ON public.care_notes(service_record_id);
CREATE INDEX IF NOT EXISTS idx_care_notes_author_id ON public.care_notes(author_id);
CREATE INDEX IF NOT EXISTS idx_care_notes_created_at ON public.care_notes(created_at DESC);

DROP TRIGGER IF EXISTS trg_care_notes_updated_at ON public.care_notes;
CREATE TRIGGER trg_care_notes_updated_at
    BEFORE UPDATE ON public.care_notes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.care_notes ENABLE ROW LEVEL SECURITY;

-- Admin/Büro sehen alles
DROP POLICY IF EXISTS care_notes_admin_all ON public.care_notes;
CREATE POLICY care_notes_admin_all ON public.care_notes
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS care_notes_staff_read ON public.care_notes;
CREATE POLICY care_notes_staff_read ON public.care_notes
    FOR SELECT USING (public.is_internal_staff());
DROP POLICY IF EXISTS care_notes_staff_write ON public.care_notes;
CREATE POLICY care_notes_staff_write ON public.care_notes
    FOR INSERT WITH CHECK (public.is_internal_staff());
-- Service Role (API)
DROP POLICY IF EXISTS care_notes_service_all ON public.care_notes;
CREATE POLICY care_notes_service_all ON public.care_notes
    FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Betreuungskraft: eigene Notizen lesen + neue erstellen
DROP POLICY IF EXISTS care_notes_caregiver_read ON public.care_notes;
CREATE POLICY care_notes_caregiver_read ON public.care_notes
    FOR SELECT USING (
        author_id = auth.uid()
        OR (
            is_internal = false
            AND EXISTS (
                SELECT 1 FROM public.caregivers c
                WHERE c.user_id = auth.uid()
                AND EXISTS (
                    SELECT 1 FROM public.assignments a
                    WHERE a.caregiver_id = c.id
                    AND a.client_id = care_notes.client_id
                    AND a.status = 'active'
                )
            )
        )
    );
DROP POLICY IF EXISTS care_notes_caregiver_insert ON public.care_notes;
CREATE POLICY care_notes_caregiver_insert ON public.care_notes
    FOR INSERT WITH CHECK (
        author_id = auth.uid()
        AND author_role = 'engel'
    );
-- Klient: eigene nicht-interne Notizen lesen + eigene erstellen
DROP POLICY IF EXISTS care_notes_client_read ON public.care_notes;
CREATE POLICY care_notes_client_read ON public.care_notes
    FOR SELECT USING (
        is_internal = false
        AND EXISTS (
            SELECT 1 FROM public.clients cl
            WHERE cl.id = care_notes.client_id
            AND cl.user_id = auth.uid()
        )
    );
DROP POLICY IF EXISTS care_notes_client_insert ON public.care_notes;
CREATE POLICY care_notes_client_insert ON public.care_notes
    FOR INSERT WITH CHECK (
        author_id = auth.uid()
        AND author_role = 'kunde'
    );


-- ---------------------------------------------------------------------------
-- 2. VERORDNUNGEN — Ärztliche Verordnungen + Genehmigungen
-- ---------------------------------------------------------------------------
-- Verordnungen werden vom Arzt ausgestellt und müssen von der Pflegekasse
-- genehmigt werden. Das System muss ablaufende Genehmigungen überwachen
-- und rechtzeitig neue anfordern.

CREATE TABLE IF NOT EXISTS public.verordnungen (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    -- Verordnungs-Daten
    verordnung_type     text NOT NULL CHECK (verordnung_type IN (
        'entlastung_45b', 'verhinderung_39', 'behandlungspflege_37',
        'haeusliche_pflege_36', 'sonstige'
    )),
    ausstellungsdatum   date NOT NULL,
    arzt_name           text,
    arzt_praxis         text,
    diagnose            text,
    leistung_beschreibung text,
    verordnung_document_url text,  -- Storage-Link zum Scan
    -- Genehmigung durch Pflegekasse
    genehmigung_status  text NOT NULL DEFAULT 'ausstehend' CHECK (genehmigung_status IN (
        'ausstehend', 'beantragt', 'genehmigt', 'abgelehnt', 'abgelaufen', 'widerspruch'
    )),
    genehmigung_datum   date,
    genehmigung_bis     date,  -- Ablaufdatum der Genehmigung
    genehmigung_aktenzeichen text,
    genehmigung_document_url text,
    -- Erinnerungen
    erinnerung_30_tage  boolean NOT NULL DEFAULT false,  -- 30 Tage vor Ablauf erinnert?
    erinnerung_14_tage  boolean NOT NULL DEFAULT false,  -- 14 Tage vor Ablauf erinnert?
    erinnerung_7_tage   boolean NOT NULL DEFAULT false,
    -- Neuantrag
    neuantrag_erforderlich boolean NOT NULL DEFAULT false,
    neuantrag_gestellt_am date,
    notes               text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verordnungen_client_id ON public.verordnungen(client_id);
CREATE INDEX IF NOT EXISTS idx_verordnungen_genehmigung_bis ON public.verordnungen(genehmigung_bis);
CREATE INDEX IF NOT EXISTS idx_verordnungen_status ON public.verordnungen(genehmigung_status);

DROP TRIGGER IF EXISTS trg_verordnungen_updated_at ON public.verordnungen;
CREATE TRIGGER trg_verordnungen_updated_at
    BEFORE UPDATE ON public.verordnungen
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.verordnungen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS verordnungen_admin_all ON public.verordnungen;
CREATE POLICY verordnungen_admin_all ON public.verordnungen
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS verordnungen_staff_read ON public.verordnungen;
CREATE POLICY verordnungen_staff_read ON public.verordnungen
    FOR SELECT USING (public.is_internal_staff());
DROP POLICY IF EXISTS verordnungen_service_all ON public.verordnungen;
CREATE POLICY verordnungen_service_all ON public.verordnungen
    FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Klient sieht eigene Verordnungen
DROP POLICY IF EXISTS verordnungen_client_read ON public.verordnungen;
CREATE POLICY verordnungen_client_read ON public.verordnungen
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.clients cl
            WHERE cl.id = verordnungen.client_id
            AND cl.user_id = auth.uid()
        )
    );


-- ---------------------------------------------------------------------------
-- 3. SERVICE_PRICING — Zentrale Preistabelle Alltagsbegleitung
-- ---------------------------------------------------------------------------
-- Statt hardcodierter Preise an verschiedenen Stellen: eine Quelle der Wahrheit.
-- Preise gelten ab valid_from und werden nie gelöscht (Audit-Trail).

CREATE TABLE IF NOT EXISTS public.service_pricing (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_type    text NOT NULL CHECK (service_type IN (
        'alltagsbegleitung', 'betreuung_45a', 'verhinderungspflege',
        'hauswirtschaft', 'einkaufsservice', 'begleitservice',
        'nachtbetreuung', 'wochenendbetreuung', 'krankenfahrt', 'sonstige'
    )),
    budget_type     text NOT NULL CHECK (budget_type IN (
        'entlastung', 'verhinderung', 'carryover', 'private'
    )),
    description     text NOT NULL DEFAULT '',
    hourly_rate     numeric NOT NULL,  -- Stundensatz in Euro
    min_hours       numeric NOT NULL DEFAULT 1,
    billing_unit    text NOT NULL DEFAULT 'stunde' CHECK (billing_unit IN (
        'stunde', 'einsatz', 'pauschal', 'kilometer'
    )),
    -- Gültigkeit
    valid_from      date NOT NULL DEFAULT CURRENT_DATE,
    valid_until     date,  -- NULL = unbegrenzt gültig
    is_active       boolean NOT NULL DEFAULT true,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_pricing_type ON public.service_pricing(service_type, budget_type);
CREATE INDEX IF NOT EXISTS idx_service_pricing_active ON public.service_pricing(is_active, valid_from);

DROP TRIGGER IF EXISTS trg_service_pricing_updated_at ON public.service_pricing;
CREATE TRIGGER trg_service_pricing_updated_at
    BEFORE UPDATE ON public.service_pricing
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.service_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_pricing_admin_all ON public.service_pricing;
CREATE POLICY service_pricing_admin_all ON public.service_pricing
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS service_pricing_staff_read ON public.service_pricing;
CREATE POLICY service_pricing_staff_read ON public.service_pricing
    FOR SELECT USING (public.is_internal_staff());
DROP POLICY IF EXISTS service_pricing_service_all ON public.service_pricing;
CREATE POLICY service_pricing_service_all ON public.service_pricing
    FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Alle authentifizierten User dürfen Preise lesen (für Angebots-Anzeige)
DROP POLICY IF EXISTS service_pricing_auth_read ON public.service_pricing;
CREATE POLICY service_pricing_auth_read ON public.service_pricing
    FOR SELECT TO authenticated USING (is_active = true);


-- ---------------------------------------------------------------------------
-- 4. CAREGIVERS — Lebenslange Nummern + IK
-- ---------------------------------------------------------------------------

ALTER TABLE public.caregivers
    ADD COLUMN IF NOT EXISTS lifetime_registration_number text,
    ADD COLUMN IF NOT EXISTS ik_nummer text,
    ADD COLUMN IF NOT EXISTS qualification_level text DEFAULT 'betreuungskraft_45a'
        CHECK (qualification_level IN (
            'betreuungskraft_45a', 'pflegehelferin', 'pflegefachkraft',
            'hauswirtschafterin', 'alltagsbegleiterin', 'sonstige'
        ));

COMMENT ON COLUMN public.caregivers.lifetime_registration_number IS
    'Lebenslange Pflegekraft-Nummer (vom Landesamt vergeben)';
COMMENT ON COLUMN public.caregivers.ik_nummer IS
    'Institutionskennzeichen — für Abrechnung mit Pflegekasse';


-- ---------------------------------------------------------------------------
-- 5. CLIENTS — Gesundheitsdaten + Notfallkontakte
-- ---------------------------------------------------------------------------
-- Eylem: "Sieht die Betreuungskraft alle wichtigen Daten des Klienten?"
-- Antwort vorher: Nein. Jetzt: Ja.

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS allergies text,
    ADD COLUMN IF NOT EXISTS medications text,
    ADD COLUMN IF NOT EXISTS mobility_status text CHECK (mobility_status IN (
        'mobil', 'eingeschraenkt', 'rollstuhl', 'bettlaegerig', NULL
    )),
    ADD COLUMN IF NOT EXISTS dietary_restrictions text,
    ADD COLUMN IF NOT EXISTS medical_conditions text,
    ADD COLUMN IF NOT EXISTS emergency_contact_name text,
    ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
    ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
    ADD COLUMN IF NOT EXISTS next_of_kin_name text,
    ADD COLUMN IF NOT EXISTS next_of_kin_phone text,
    ADD COLUMN IF NOT EXISTS next_of_kin_email text,
    ADD COLUMN IF NOT EXISTS next_of_kin_relationship text,
    ADD COLUMN IF NOT EXISTS hausarzt_name text,
    ADD COLUMN IF NOT EXISTS hausarzt_phone text,
    ADD COLUMN IF NOT EXISTS versichertennummer text,
    ADD COLUMN IF NOT EXISTS pflegekasse_name text,
    ADD COLUMN IF NOT EXISTS pflegekasse_ik text;


-- ---------------------------------------------------------------------------
-- 6. CARE_RECIPIENTS — Gesundheitsdaten (Marktplatz-Spiegel)
-- ---------------------------------------------------------------------------

ALTER TABLE public.care_recipients
    ADD COLUMN IF NOT EXISTS allergies text,
    ADD COLUMN IF NOT EXISTS medications text,
    ADD COLUMN IF NOT EXISTS mobility_status text CHECK (mobility_status IN (
        'mobil', 'eingeschraenkt', 'rollstuhl', 'bettlaegerig', NULL
    )),
    ADD COLUMN IF NOT EXISTS emergency_contact_name text,
    ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
    ADD COLUMN IF NOT EXISTS medical_conditions text;


-- ---------------------------------------------------------------------------
-- 7. RLS-ERWEITERUNGEN — Betreuungskraft + Klient Sichtbarkeit
-- ---------------------------------------------------------------------------

-- 7a. service_records: BK darf eigene Records lesen + neue im Draft erstellen
DO $$
BEGIN
    -- Prüfen ob Policy schon existiert
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'service_records'
        AND policyname = 'service_records_caregiver_read'
    ) THEN
        EXECUTE 'DROP POLICY IF EXISTS service_records_caregiver_read ON public.service_records;
CREATE POLICY service_records_caregiver_read ON public.service_records
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.caregivers c
                    WHERE c.user_id = auth.uid()
                    AND c.id = service_records.caregiver_id
                )
            )';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'service_records'
        AND policyname = 'service_records_caregiver_insert'
    ) THEN
        EXECUTE 'DROP POLICY IF EXISTS service_records_caregiver_insert ON public.service_records;
CREATE POLICY service_records_caregiver_insert ON public.service_records
            FOR INSERT WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.caregivers c
                    WHERE c.user_id = auth.uid()
                    AND c.id = service_records.caregiver_id
                )
                AND status = ''draft''
            )';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'service_records'
        AND policyname = 'service_records_caregiver_update'
    ) THEN
        EXECUTE 'DROP POLICY IF EXISTS service_records_caregiver_update ON public.service_records;
CREATE POLICY service_records_caregiver_update ON public.service_records
            FOR UPDATE USING (
                EXISTS (
                    SELECT 1 FROM public.caregivers c
                    WHERE c.user_id = auth.uid()
                    AND c.id = service_records.caregiver_id
                )
                AND status IN (''draft'', ''incomplete'')
            )';
    END IF;
END $$;

-- 7b. service_records: Klient darf eigene Records lesen (für Leistungsnachweis)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'service_records'
        AND policyname = 'service_records_client_read'
    ) THEN
        EXECUTE 'DROP POLICY IF EXISTS service_records_client_read ON public.service_records;
CREATE POLICY service_records_client_read ON public.service_records
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.clients cl
                    WHERE cl.user_id = auth.uid()
                    AND cl.id = service_records.client_id
                )
            )';
    END IF;
END $$;

-- 7c. invoices: Klient darf eigene Rechnungen lesen
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'invoices'
        AND policyname = 'invoices_client_read'
    ) THEN
        EXECUTE 'DROP POLICY IF EXISTS invoices_client_read ON public.invoices;
CREATE POLICY invoices_client_read ON public.invoices
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.clients cl
                    WHERE cl.user_id = auth.uid()
                    AND cl.id = invoices.client_id
                )
            )';
    END IF;
END $$;

-- 7d. invoice_items: Klient darf Items lesen (für Aufschlüsselung)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'invoice_items'
        AND policyname = 'invoice_items_client_read'
    ) THEN
        EXECUTE 'DROP POLICY IF EXISTS invoice_items_client_read ON public.invoice_items;
CREATE POLICY invoice_items_client_read ON public.invoice_items
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.invoices inv
                    JOIN public.clients cl ON cl.id = inv.client_id
                    WHERE inv.id = invoice_items.invoice_id
                    AND cl.user_id = auth.uid()
                )
            )';
    END IF;
END $$;

-- 7e. client_budgets: Klient darf eigenes Budget lesen
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'client_budgets'
        AND policyname = 'client_budgets_client_read'
    ) THEN
        EXECUTE 'DROP POLICY IF EXISTS client_budgets_client_read ON public.client_budgets;
CREATE POLICY client_budgets_client_read ON public.client_budgets
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.clients cl
                    WHERE cl.user_id = auth.uid()
                    AND cl.id = client_budgets.client_id
                )
            )';
    END IF;
END $$;

-- 7f. clients: BK darf zugewiesene Klienten-Daten lesen
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'clients'
        AND policyname = 'clients_caregiver_read'
    ) THEN
        EXECUTE 'DROP POLICY IF EXISTS clients_caregiver_read ON public.clients;
CREATE POLICY clients_caregiver_read ON public.clients
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.caregivers c
                    JOIN public.assignments a ON a.caregiver_id = c.id
                    WHERE c.user_id = auth.uid()
                    AND a.client_id = clients.id
                    AND a.status = ''active''
                )
            )';
    END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 8. STANDARD-PREISE EINFÜGEN
-- ---------------------------------------------------------------------------

INSERT INTO public.service_pricing (service_type, budget_type, description, hourly_rate, min_hours, billing_unit)
VALUES
    ('alltagsbegleitung', 'entlastung', 'Alltagsbegleitung über Entlastungsbetrag §45b', 35.00, 1, 'stunde'),
    ('alltagsbegleitung', 'verhinderung', 'Alltagsbegleitung über Verhinderungspflege §39', 35.00, 1, 'stunde'),
    ('alltagsbegleitung', 'private', 'Alltagsbegleitung privat', 40.00, 1, 'stunde'),
    ('betreuung_45a', 'entlastung', 'Betreuung nach §45a über Entlastungsbetrag', 35.00, 1, 'stunde'),
    ('betreuung_45a', 'verhinderung', 'Betreuung nach §45a über Verhinderungspflege', 35.00, 1, 'stunde'),
    ('hauswirtschaft', 'entlastung', 'Hauswirtschaftliche Unterstützung', 35.00, 1, 'stunde'),
    ('hauswirtschaft', 'private', 'Hauswirtschaft privat', 38.00, 1, 'stunde'),
    ('einkaufsservice', 'entlastung', 'Einkaufsbegleitung / Einkaufsservice', 35.00, 1, 'stunde'),
    ('begleitservice', 'entlastung', 'Begleitservice (Arzt, Behörde, Freizeit)', 35.00, 1, 'stunde'),
    ('begleitservice', 'private', 'Begleitservice privat', 40.00, 1, 'stunde')
ON CONFLICT DO NOTHING;


COMMIT;
