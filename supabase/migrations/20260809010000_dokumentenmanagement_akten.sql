-- ════════════════════════════════════════════════════════════════════
-- Dokumentenmanagement + Digitale Kundenakte + Mitarbeiterakte
-- + Verträge + Verordnungen-Erweiterung + Nachweise
-- ════════════════════════════════════════════════════════════════════
-- Neue Tabellen:
--   akten_dokumente          – Zentrales Dokumentenmanagement
--   akten_dokument_versionen – Versionierung
--   akten_vertraege          – Verträge (Kunde/Mitarbeiter/Org)
--   akten_kontaktpersonen    – Angehörige/Bevollmächtigte/Notfall
--   akten_zugriff_log        – Zugriffs-Audit (append-only)
-- Erweiterungen:
--   clients                  – Erweiterte Stammdaten
--   caregivers               – Beschäftigungsart, Einsatzfreigabe
--   verordnungen             – Abrechnungs-Gate
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- 1) AKTEN_DOKUMENTE — Zentrales Dokumentenmanagement
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.akten_dokumente (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id     uuid NOT NULL DEFAULT current_org_id(),

    -- Zuordnung (genau eine)
    client_id           uuid REFERENCES public.clients(id),
    caregiver_id        uuid REFERENCES public.caregivers(id),
    -- NULL+NULL = Org-Dokument

    -- Dokumentdaten
    titel               text NOT NULL,
    dokument_typ        text NOT NULL
        CHECK (dokument_typ IN (
            'vertrag', 'verordnung', 'genehmigung', 'vollmacht',
            'abtretungserklaerung', 'pflegegradbescheid', 'kostentraegerzusage',
            'ausweis', 'fuehrerschein', 'fuehrungszeugnis', 'erste_hilfe',
            'qualifikation', 'zertifikat', 'schulung', 'leistungsnachweis',
            'rechnung', 'schriftverkehr', 'bescheinigung', 'kuendigung',
            'arbeitsvertrag', 'zusatzvereinbarung', 'datenschutzerklaerung',
            'einwilligung', 'foto', 'sonstiges'
        )),
    kategorie           text NOT NULL DEFAULT 'allgemein'
        CHECK (kategorie IN (
            'stammdaten', 'vertrag', 'pflege', 'abrechnung', 'personal',
            'qualifikation', 'genehmigung', 'korrespondenz', 'allgemein'
        )),

    -- Datei-Metadaten
    dateiname           text NOT NULL,
    dateipfad           text NOT NULL,
    dateigroesse_bytes  bigint,
    mime_type           text,
    sha256_hash         text,

    -- Gültigkeit
    dokument_datum      date,
    gueltig_von         date,
    gueltig_bis         date,
    ablaufdatum         date,

    -- Status / Steuerung
    status              text NOT NULL DEFAULT 'aktiv'
        CHECK (status IN ('entwurf', 'aktiv', 'archiviert', 'gesperrt', 'abgelaufen')),
    sichtbarkeit        text NOT NULL DEFAULT 'intern'
        CHECK (sichtbarkeit IN ('intern', 'kunde', 'engel', 'alle')),
    gesperrt            boolean NOT NULL DEFAULT false,
    gesperrt_grund      text,
    gesperrt_am         timestamptz,
    gesperrt_von        uuid REFERENCES auth.users(id),

    -- Versionierung
    aktuelle_version    integer NOT NULL DEFAULT 1,

    -- Tags / Notizen
    tags                text[] DEFAULT '{}',
    interne_bemerkung   text,

    -- Ablaufwarnungen
    warnung_90_gesendet boolean NOT NULL DEFAULT false,
    warnung_60_gesendet boolean NOT NULL DEFAULT false,
    warnung_30_gesendet boolean NOT NULL DEFAULT false,
    warnung_14_gesendet boolean NOT NULL DEFAULT false,
    warnung_7_gesendet  boolean NOT NULL DEFAULT false,

    -- Audit
    erstellt_von        uuid REFERENCES auth.users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz,
    deleted_by          uuid REFERENCES auth.users(id),

    -- Constraint: Client oder Caregiver, nicht beides
    CONSTRAINT chk_zuordnung CHECK (
        NOT (client_id IS NOT NULL AND caregiver_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_akten_dok_org ON public.akten_dokumente(organization_id);
CREATE INDEX IF NOT EXISTS idx_akten_dok_client ON public.akten_dokumente(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_akten_dok_caregiver ON public.akten_dokumente(caregiver_id) WHERE caregiver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_akten_dok_typ ON public.akten_dokumente(dokument_typ);
CREATE INDEX IF NOT EXISTS idx_akten_dok_status ON public.akten_dokumente(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_akten_dok_ablauf ON public.akten_dokumente(ablaufdatum) WHERE ablaufdatum IS NOT NULL AND status = 'aktiv' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_akten_dok_tags ON public.akten_dokumente USING gin(tags) WHERE deleted_at IS NULL;

-- ──────────────────────────────────────────────────────────────────
-- 2) AKTEN_DOKUMENT_VERSIONEN — Versionierung (append-only)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.akten_dokument_versionen (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id     uuid NOT NULL DEFAULT current_org_id(),
    dokument_id         uuid NOT NULL REFERENCES public.akten_dokumente(id) ON DELETE CASCADE,

    version             integer NOT NULL,
    dateiname           text NOT NULL,
    dateipfad           text NOT NULL,
    dateigroesse_bytes  bigint,
    mime_type           text,
    sha256_hash         text,

    aenderungsgrund     text,
    erstellt_von        uuid REFERENCES auth.users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),

    UNIQUE(dokument_id, version)
);

CREATE INDEX IF NOT EXISTS idx_akten_vers_dok ON public.akten_dokument_versionen(dokument_id);
CREATE INDEX IF NOT EXISTS idx_akten_vers_org ON public.akten_dokument_versionen(organization_id);

-- ──────────────────────────────────────────────────────────────────
-- 3) AKTEN_VERTRAEGE — Vertragsverwaltung
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.akten_vertraege (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id     uuid NOT NULL DEFAULT current_org_id(),

    -- Zuordnung
    client_id           uuid REFERENCES public.clients(id),
    caregiver_id        uuid REFERENCES public.caregivers(id),

    -- Vertragsdaten
    titel               text NOT NULL,
    vertragstyp         text NOT NULL
        CHECK (vertragstyp IN (
            'dienstleistungsvertrag', 'arbeitsvertrag', 'freelancer_vertrag',
            'zusatzvereinbarung', 'abtretungserklaerung', 'vollmacht',
            'datenschutzerklaerung', 'einwilligung', 'kooperationsvertrag',
            'sonstiger'
        )),
    vertragsnummer      text,

    -- Status-Workflow
    status              text NOT NULL DEFAULT 'entwurf'
        CHECK (status IN (
            'entwurf', 'versendet', 'unterschrieben', 'aktiv',
            'gekuendigt', 'beendet', 'storniert'
        )),

    -- Laufzeit
    vertragsbeginn      date,
    vertragsende        date,
    kuendigungsfrist_tage integer,
    auto_verlaengerung  boolean NOT NULL DEFAULT false,

    -- Unterschrift
    unterschrift_datum  date,
    unterschrieben_von  text,
    signatur_typ        text CHECK (signatur_typ IS NULL OR signatur_typ IN (
        'handschriftlich', 'digital', 'signaturepad', 'fernidentifikation'
    )),
    signatur_daten      jsonb,

    -- Dokument
    dokument_id         uuid REFERENCES public.akten_dokumente(id),
    vorlage_id          uuid,
    pdf_url             text,

    -- Sperre nach Unterschrift
    gesperrt            boolean NOT NULL DEFAULT false,

    -- Audit
    bemerkung           text,
    erstellt_von        uuid REFERENCES auth.users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz,

    CONSTRAINT chk_vertrag_zuordnung CHECK (
        NOT (client_id IS NOT NULL AND caregiver_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_vertraege_org ON public.akten_vertraege(organization_id);
CREATE INDEX IF NOT EXISTS idx_vertraege_client ON public.akten_vertraege(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vertraege_caregiver ON public.akten_vertraege(caregiver_id) WHERE caregiver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vertraege_status ON public.akten_vertraege(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vertraege_ende ON public.akten_vertraege(vertragsende) WHERE vertragsende IS NOT NULL AND status IN ('aktiv', 'unterschrieben');

-- ──────────────────────────────────────────────────────────────────
-- 4) AKTEN_KONTAKTPERSONEN — Angehörige / Bevollmächtigte
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.akten_kontaktpersonen (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id     uuid NOT NULL DEFAULT current_org_id(),
    client_id           uuid NOT NULL REFERENCES public.clients(id),

    rolle               text NOT NULL
        CHECK (rolle IN (
            'angehoeriger', 'bevollmaechtigter', 'betreuer',
            'notfallkontakt', 'hausarzt', 'facharzt',
            'pflegeberater', 'sozialarbeiter', 'sonstiger'
        )),

    anrede              text,
    vorname             text NOT NULL,
    nachname            text NOT NULL,
    telefon             text,
    mobil               text,
    email               text,
    adresse             text,
    plz                 text,
    ort                 text,

    -- Vollmacht
    vollmacht_typ       text CHECK (vollmacht_typ IS NULL OR vollmacht_typ IN (
        'vorsorgevollmacht', 'betreuungsvollmacht', 'patientenverfuegung',
        'generalvollmacht', 'bankvollmacht', 'sonstige'
    )),
    vollmacht_datum     date,
    vollmacht_dokument_id uuid REFERENCES public.akten_dokumente(id),

    -- Erreichbarkeit
    bevorzugte_kontaktart text CHECK (bevorzugte_kontaktart IS NULL OR bevorzugte_kontaktart IN (
        'telefon', 'mobil', 'email', 'post'
    )),
    erreichbar_von      time,
    erreichbar_bis      time,

    -- Beziehung
    beziehung           text,
    ist_hauptkontakt    boolean NOT NULL DEFAULT false,
    bemerkung           text,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    deleted_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_kontakt_org ON public.akten_kontaktpersonen(organization_id);
CREATE INDEX IF NOT EXISTS idx_kontakt_client ON public.akten_kontaktpersonen(client_id);
CREATE INDEX IF NOT EXISTS idx_kontakt_rolle ON public.akten_kontaktpersonen(rolle);

-- ──────────────────────────────────────────────────────────────────
-- 5) AKTEN_ZUGRIFF_LOG — Zugriffs-Audit (append-only)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.akten_zugriff_log (
    id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id     uuid NOT NULL DEFAULT current_org_id(),

    dokument_id         uuid REFERENCES public.akten_dokumente(id),
    vertrag_id          uuid REFERENCES public.akten_vertraege(id),
    entitaet_typ        text NOT NULL
        CHECK (entitaet_typ IN (
            'dokument', 'vertrag', 'kundenakte', 'mitarbeiterakte',
            'verordnung', 'kontaktperson'
        )),
    entitaet_id         uuid NOT NULL,

    aktion              text NOT NULL
        CHECK (aktion IN (
            'angesehen', 'heruntergeladen', 'hochgeladen', 'bearbeitet',
            'archiviert', 'gesperrt', 'entsperrt', 'geloescht',
            'version_erstellt', 'unterschrieben', 'freigegeben'
        )),

    benutzer_id         uuid NOT NULL REFERENCES auth.users(id),
    benutzer_rolle      text,
    details             jsonb,

    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zugriff_org ON public.akten_zugriff_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_zugriff_dok ON public.akten_zugriff_log(dokument_id) WHERE dokument_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_zugriff_vertrag ON public.akten_zugriff_log(vertrag_id) WHERE vertrag_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_zugriff_entitaet ON public.akten_zugriff_log(entitaet_typ, entitaet_id);
CREATE INDEX IF NOT EXISTS idx_zugriff_benutzer ON public.akten_zugriff_log(benutzer_id);
CREATE INDEX IF NOT EXISTS idx_zugriff_zeit ON public.akten_zugriff_log(created_at);

-- ──────────────────────────────────────────────────────────────────
-- 6) CLIENTS — Erweiterte Stammdaten
-- ──────────────────────────────────────────────────────────────────

DO $client_ext$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'geschlecht') THEN
        ALTER TABLE public.clients ADD COLUMN geschlecht text CHECK (geschlecht IS NULL OR geschlecht IN ('maennlich', 'weiblich', 'divers'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'pflegegrad_seit') THEN
        ALTER TABLE public.clients ADD COLUMN pflegegrad_seit date;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'pflegegrad_bescheid_url') THEN
        ALTER TABLE public.clients ADD COLUMN pflegegrad_bescheid_url text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'bevollmaechtigter_name') THEN
        ALTER TABLE public.clients ADD COLUMN bevollmaechtigter_name text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'bevollmaechtigter_telefon') THEN
        ALTER TABLE public.clients ADD COLUMN bevollmaechtigter_telefon text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'abtretungserklaerung_vorhanden') THEN
        ALTER TABLE public.clients ADD COLUMN abtretungserklaerung_vorhanden boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'bundesland') THEN
        ALTER TABLE public.clients ADD COLUMN bundesland text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'aktenzeichen') THEN
        ALTER TABLE public.clients ADD COLUMN aktenzeichen text;
    END IF;
END
$client_ext$;

-- ──────────────────────────────────────────────────────────────────
-- 7) CAREGIVERS — Erweiterte Stammdaten
-- ──────────────────────────────────────────────────────────────────

DO $cg_ext$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'caregivers' AND column_name = 'beschaeftigungsart') THEN
        ALTER TABLE public.caregivers ADD COLUMN beschaeftigungsart text DEFAULT 'festangestellt'
            CHECK (beschaeftigungsart IS NULL OR beschaeftigungsart IN (
                'festangestellt', 'teilzeit', 'minijob', 'freelancer', 'ehrenamtlich', 'praktikant'
            ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'caregivers' AND column_name = 'eintrittsdatum') THEN
        ALTER TABLE public.caregivers ADD COLUMN eintrittsdatum date;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'caregivers' AND column_name = 'austrittsdatum') THEN
        ALTER TABLE public.caregivers ADD COLUMN austrittsdatum date;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'caregivers' AND column_name = 'einsatzfreigabe') THEN
        ALTER TABLE public.caregivers ADD COLUMN einsatzfreigabe boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'caregivers' AND column_name = 'einsatzfreigabe_am') THEN
        ALTER TABLE public.caregivers ADD COLUMN einsatzfreigabe_am date;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'caregivers' AND column_name = 'fuehrungszeugnis_datum') THEN
        ALTER TABLE public.caregivers ADD COLUMN fuehrungszeugnis_datum date;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'caregivers' AND column_name = 'fuehrungszeugnis_gueltig_bis') THEN
        ALTER TABLE public.caregivers ADD COLUMN fuehrungszeugnis_gueltig_bis date;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'caregivers' AND column_name = 'erste_hilfe_datum') THEN
        ALTER TABLE public.caregivers ADD COLUMN erste_hilfe_datum date;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'caregivers' AND column_name = 'erste_hilfe_gueltig_bis') THEN
        ALTER TABLE public.caregivers ADD COLUMN erste_hilfe_gueltig_bis date;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'caregivers' AND column_name = 'interne_notizen') THEN
        ALTER TABLE public.caregivers ADD COLUMN interne_notizen text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'caregivers' AND column_name = 'bundesland') THEN
        ALTER TABLE public.caregivers ADD COLUMN bundesland text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'caregivers' AND column_name = 'geburtsdatum') THEN
        ALTER TABLE public.caregivers ADD COLUMN geburtsdatum date;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'caregivers' AND column_name = 'geschlecht') THEN
        ALTER TABLE public.caregivers ADD COLUMN geschlecht text CHECK (geschlecht IS NULL OR geschlecht IN ('maennlich', 'weiblich', 'divers'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'caregivers' AND column_name = 'steuer_id') THEN
        ALTER TABLE public.caregivers ADD COLUMN steuer_id text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'caregivers' AND column_name = 'sozialversicherungsnummer') THEN
        ALTER TABLE public.caregivers ADD COLUMN sozialversicherungsnummer text;
    END IF;
END
$cg_ext$;

-- ──────────────────────────────────────────────────────────────────
-- 8) VERORDNUNGEN — Kassen-Gate-Spalten
-- ──────────────────────────────────────────────────────────────────

DO $vo_ext$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'verordnungen' AND column_name = 'abrechnung_gesperrt') THEN
        ALTER TABLE public.verordnungen ADD COLUMN abrechnung_gesperrt boolean NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'verordnungen' AND column_name = 'abrechnung_sperrgrund') THEN
        ALTER TABLE public.verordnungen ADD COLUMN abrechnung_sperrgrund text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'verordnungen' AND column_name = 'erinnerung_90_tage') THEN
        ALTER TABLE public.verordnungen ADD COLUMN erinnerung_90_tage boolean NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'verordnungen' AND column_name = 'erinnerung_60_tage') THEN
        ALTER TABLE public.verordnungen ADD COLUMN erinnerung_60_tage boolean NOT NULL DEFAULT false;
    END IF;
END
$vo_ext$;

-- ──────────────────────────────────────────────────────────────────
-- 9) RLS Policies
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE public.akten_dokumente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.akten_dokument_versionen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.akten_vertraege ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.akten_kontaktpersonen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.akten_zugriff_log ENABLE ROW LEVEL SECURITY;

-- Admin: Full access
DO $rls_dok$
BEGIN
    DROP POLICY IF EXISTS "admin_akten_dokumente" ON public.akten_dokumente;
    CREATE POLICY "admin_akten_dokumente" ON public.akten_dokumente
        FOR ALL USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        );
END $rls_dok$;

DO $rls_vers$
BEGIN
    DROP POLICY IF EXISTS "admin_akten_versionen" ON public.akten_dokument_versionen;
    CREATE POLICY "admin_akten_versionen" ON public.akten_dokument_versionen
        FOR ALL USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        );
END $rls_vers$;

DO $rls_vert$
BEGIN
    DROP POLICY IF EXISTS "admin_akten_vertraege" ON public.akten_vertraege;
    CREATE POLICY "admin_akten_vertraege" ON public.akten_vertraege
        FOR ALL USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        );
END $rls_vert$;

DO $rls_kp$
BEGIN
    DROP POLICY IF EXISTS "admin_akten_kontaktpersonen" ON public.akten_kontaktpersonen;
    CREATE POLICY "admin_akten_kontaktpersonen" ON public.akten_kontaktpersonen
        FOR ALL USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        );
END $rls_kp$;

DO $rls_log$
BEGIN
    DROP POLICY IF EXISTS "admin_akten_zugriff" ON public.akten_zugriff_log;
    CREATE POLICY "admin_akten_zugriff" ON public.akten_zugriff_log
        FOR ALL USING (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
        );
END $rls_log$;

-- Kunden: Nur eigene, nicht-interne Dokumente lesen
DO $rls_kunde_dok$
BEGIN
    DROP POLICY IF EXISTS "kunde_akten_dokumente_select" ON public.akten_dokumente;
    CREATE POLICY "kunde_akten_dokumente_select" ON public.akten_dokumente
        FOR SELECT USING (
            sichtbarkeit IN ('kunde', 'alle')
            AND deleted_at IS NULL
            AND client_id IN (
                SELECT c.id FROM public.clients c WHERE c.user_id = auth.uid()
            )
        );
END $rls_kunde_dok$;

-- Kunden: Eigene Verträge lesen
DO $rls_kunde_vert$
BEGIN
    DROP POLICY IF EXISTS "kunde_akten_vertraege_select" ON public.akten_vertraege;
    CREATE POLICY "kunde_akten_vertraege_select" ON public.akten_vertraege
        FOR SELECT USING (
            deleted_at IS NULL
            AND client_id IN (
                SELECT c.id FROM public.clients c WHERE c.user_id = auth.uid()
            )
        );
END $rls_kunde_vert$;

-- Engel: Eigene Dokumente lesen (nicht-interne)
DO $rls_engel_dok$
BEGIN
    DROP POLICY IF EXISTS "engel_akten_dokumente_select" ON public.akten_dokumente;
    CREATE POLICY "engel_akten_dokumente_select" ON public.akten_dokumente
        FOR SELECT USING (
            sichtbarkeit IN ('engel', 'alle')
            AND deleted_at IS NULL
            AND caregiver_id IN (
                SELECT cg.id FROM public.caregivers cg WHERE cg.user_id = auth.uid()
            )
        );
END $rls_engel_dok$;

-- Engel: Eigene Verträge lesen
DO $rls_engel_vert$
BEGIN
    DROP POLICY IF EXISTS "engel_akten_vertraege_select" ON public.akten_vertraege;
    CREATE POLICY "engel_akten_vertraege_select" ON public.akten_vertraege
        FOR SELECT USING (
            deleted_at IS NULL
            AND caregiver_id IN (
                SELECT cg.id FROM public.caregivers cg WHERE cg.user_id = auth.uid()
            )
        );
END $rls_engel_vert$;

-- org_fence: RESTRICTIVE policies
DO $fence_dok$
BEGIN
    DROP POLICY IF EXISTS "org_fence_akten_dokumente" ON public.akten_dokumente;
    CREATE POLICY "org_fence_akten_dokumente" ON public.akten_dokumente
        AS RESTRICTIVE FOR ALL USING (
            organization_id = public.current_org_id()
        );
END $fence_dok$;

DO $fence_vers$
BEGIN
    DROP POLICY IF EXISTS "org_fence_akten_versionen" ON public.akten_dokument_versionen;
    CREATE POLICY "org_fence_akten_versionen" ON public.akten_dokument_versionen
        AS RESTRICTIVE FOR ALL USING (
            organization_id = public.current_org_id()
        );
END $fence_vers$;

DO $fence_vert$
BEGIN
    DROP POLICY IF EXISTS "org_fence_akten_vertraege" ON public.akten_vertraege;
    CREATE POLICY "org_fence_akten_vertraege" ON public.akten_vertraege
        AS RESTRICTIVE FOR ALL USING (
            organization_id = public.current_org_id()
        );
END $fence_vert$;

DO $fence_kp$
BEGIN
    DROP POLICY IF EXISTS "org_fence_akten_kontaktpersonen" ON public.akten_kontaktpersonen;
    CREATE POLICY "org_fence_akten_kontaktpersonen" ON public.akten_kontaktpersonen
        AS RESTRICTIVE FOR ALL USING (
            organization_id = public.current_org_id()
        );
END $fence_kp$;

DO $fence_log$
BEGIN
    DROP POLICY IF EXISTS "org_fence_akten_zugriff" ON public.akten_zugriff_log;
    CREATE POLICY "org_fence_akten_zugriff" ON public.akten_zugriff_log
        AS RESTRICTIVE FOR ALL USING (
            organization_id = public.current_org_id()
        );
END $fence_log$;

-- ──────────────────────────────────────────────────────────────────
-- 10) Triggers
-- ──────────────────────────────────────────────────────────────────

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_updated_at_akten_dokumente ON public.akten_dokumente;
CREATE TRIGGER trg_updated_at_akten_dokumente BEFORE UPDATE ON public.akten_dokumente
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_akten_vertraege ON public.akten_vertraege;
CREATE TRIGGER trg_updated_at_akten_vertraege BEFORE UPDATE ON public.akten_vertraege
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_akten_kontaktpersonen ON public.akten_kontaktpersonen;
CREATE TRIGGER trg_updated_at_akten_kontaktpersonen BEFORE UPDATE ON public.akten_kontaktpersonen
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Immutable audit log
CREATE OR REPLACE FUNCTION public.prevent_modify_akten_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $prevent_audit$
BEGIN
    RAISE EXCEPTION 'Akten-Zugriff-Log ist unveraenderbar (append-only)';
END;
$prevent_audit$;

DROP TRIGGER IF EXISTS trg_immutable_akten_zugriff ON public.akten_zugriff_log;
CREATE TRIGGER trg_immutable_akten_zugriff
    BEFORE UPDATE OR DELETE ON public.akten_zugriff_log
    FOR EACH ROW EXECUTE FUNCTION public.prevent_modify_akten_audit();

-- Immutable document versions
DROP TRIGGER IF EXISTS trg_immutable_akten_versionen ON public.akten_dokument_versionen;
CREATE TRIGGER trg_immutable_akten_versionen
    BEFORE UPDATE OR DELETE ON public.akten_dokument_versionen
    FOR EACH ROW EXECUTE FUNCTION public.prevent_modify_akten_audit();

-- Prevent editing locked documents
CREATE OR REPLACE FUNCTION public.prevent_locked_document_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $lock_check$
BEGIN
    IF OLD.gesperrt = true AND NEW.gesperrt = true THEN
        -- Allow only unlock (gesperrt -> false)
        IF NEW.titel != OLD.titel OR NEW.dateipfad != OLD.dateipfad
           OR NEW.dateiname != OLD.dateiname OR NEW.status != OLD.status THEN
            RAISE EXCEPTION 'Gesperrtes Dokument kann nicht bearbeitet werden. Erst entsperren.';
        END IF;
    END IF;
    RETURN NEW;
END;
$lock_check$;

DROP TRIGGER IF EXISTS trg_locked_document ON public.akten_dokumente;
CREATE TRIGGER trg_locked_document
    BEFORE UPDATE ON public.akten_dokumente
    FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_document_edit();

-- Prevent editing signed contracts
CREATE OR REPLACE FUNCTION public.prevent_signed_contract_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $sign_check$
BEGIN
    IF OLD.gesperrt = true THEN
        IF NEW.titel != OLD.titel OR NEW.vertragstyp != OLD.vertragstyp
           OR NEW.vertragsbeginn IS DISTINCT FROM OLD.vertragsbeginn
           OR NEW.pdf_url IS DISTINCT FROM OLD.pdf_url THEN
            RAISE EXCEPTION 'Unterschriebener Vertrag kann nicht bearbeitet werden.';
        END IF;
    END IF;
    RETURN NEW;
END;
$sign_check$;

DROP TRIGGER IF EXISTS trg_locked_contract ON public.akten_vertraege;
CREATE TRIGGER trg_locked_contract
    BEFORE UPDATE ON public.akten_vertraege
    FOR EACH ROW EXECUTE FUNCTION public.prevent_signed_contract_edit();

-- ──────────────────────────────────────────────────────────────────
-- 11) Audit-Trail erweitern
-- ──────────────────────────────────────────────────────────────────

DO $audit_ext2$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'billing_audit_trail' AND column_name = 'entity_type'
    ) THEN
        ALTER TABLE public.billing_audit_trail
            DROP CONSTRAINT IF EXISTS billing_audit_trail_entity_type_check;
        ALTER TABLE public.billing_audit_trail
            ADD CONSTRAINT billing_audit_trail_entity_type_check
            CHECK (entity_type IN (
                'invoice', 'tariff', 'correction', 'snapshot', 'credit_note',
                'payment', 'payment_allocation', 'dunning', 'payment_difference',
                'monthly_closing',
                'dta_lauf', 'dta_kostentraeger', 'dta_dakota_auftrag',
                'dta_ruecklaeufer', 'dta_fehlerprotokoll', 'dta_korrekturlauf',
                'dta_validierung', 'dta_lauf_rechnung', 'dta_annahmestelle',
                'dta_ruecklaeufer_position',
                'dokument', 'dokument_version', 'vertrag', 'kontaktperson',
                'verordnung', 'kundenakte', 'mitarbeiterakte'
            ));
    END IF;
END
$audit_ext2$;

-- ──────────────────────────────────────────────────────────────────
-- 12) Views
-- ──────────────────────────────────────────────────────────────────

-- Ablaufwarnungen Dashboard
CREATE OR REPLACE VIEW public.akten_ablauf_dashboard AS
SELECT
    organization_id,
    id AS dokument_id,
    titel,
    dokument_typ,
    kategorie,
    client_id,
    caregiver_id,
    ablaufdatum,
    CASE
        WHEN ablaufdatum < CURRENT_DATE THEN 'abgelaufen'
        WHEN ablaufdatum <= CURRENT_DATE + INTERVAL '7 days' THEN '7_tage'
        WHEN ablaufdatum <= CURRENT_DATE + INTERVAL '14 days' THEN '14_tage'
        WHEN ablaufdatum <= CURRENT_DATE + INTERVAL '30 days' THEN '30_tage'
        WHEN ablaufdatum <= CURRENT_DATE + INTERVAL '60 days' THEN '60_tage'
        WHEN ablaufdatum <= CURRENT_DATE + INTERVAL '90 days' THEN '90_tage'
        ELSE 'ok'
    END AS dringlichkeit,
    (ablaufdatum - CURRENT_DATE) AS tage_bis_ablauf
FROM public.akten_dokumente
WHERE ablaufdatum IS NOT NULL
  AND status = 'aktiv'
  AND deleted_at IS NULL
  AND ablaufdatum <= CURRENT_DATE + INTERVAL '90 days'
ORDER BY ablaufdatum ASC;

-- Kundenakte Übersicht
CREATE OR REPLACE VIEW public.kundenakte_uebersicht AS
SELECT
    c.id AS client_id,
    c.organization_id,
    c.first_name,
    c.last_name,
    c.pflegegrad,
    c.pflegekasse_name,
    c.status AS client_status,
    COUNT(DISTINCT d.id) FILTER (WHERE d.deleted_at IS NULL) AS dokumente_gesamt,
    COUNT(DISTINCT v.id) FILTER (WHERE v.deleted_at IS NULL) AS vertraege_gesamt,
    COUNT(DISTINCT vo.id) FILTER (WHERE vo.deleted_at IS NULL) AS verordnungen_gesamt,
    COUNT(DISTINCT kp.id) FILTER (WHERE kp.deleted_at IS NULL) AS kontaktpersonen_gesamt,
    COUNT(DISTINCT d.id) FILTER (WHERE d.ablaufdatum IS NOT NULL AND d.ablaufdatum < CURRENT_DATE AND d.status = 'aktiv' AND d.deleted_at IS NULL) AS abgelaufene_dokumente
FROM public.clients c
LEFT JOIN public.akten_dokumente d ON d.client_id = c.id
LEFT JOIN public.akten_vertraege v ON v.client_id = c.id
LEFT JOIN public.verordnungen vo ON vo.client_id = c.id
LEFT JOIN public.akten_kontaktpersonen kp ON kp.client_id = c.id
GROUP BY c.id, c.organization_id, c.first_name, c.last_name, c.pflegegrad, c.pflegekasse_name, c.status;

-- Mitarbeiterakte Übersicht
CREATE OR REPLACE VIEW public.mitarbeiterakte_uebersicht AS
SELECT
    cg.id AS caregiver_id,
    cg.organization_id,
    cg.first_name,
    cg.last_name,
    cg.status AS caregiver_status,
    cg.einsatzfreigabe,
    cg.beschaeftigungsart,
    COUNT(DISTINCT d.id) FILTER (WHERE d.deleted_at IS NULL) AS dokumente_gesamt,
    COUNT(DISTINCT v.id) FILTER (WHERE v.deleted_at IS NULL) AS vertraege_gesamt,
    COUNT(DISTINCT d.id) FILTER (WHERE d.ablaufdatum IS NOT NULL AND d.ablaufdatum < CURRENT_DATE AND d.status = 'aktiv' AND d.deleted_at IS NULL) AS abgelaufene_dokumente
FROM public.caregivers cg
LEFT JOIN public.akten_dokumente d ON d.caregiver_id = cg.id
LEFT JOIN public.akten_vertraege v ON v.caregiver_id = cg.id
GROUP BY cg.id, cg.organization_id, cg.first_name, cg.last_name, cg.status, cg.einsatzfreigabe, cg.beschaeftigungsart;

-- ──────────────────────────────────────────────────────────────────
-- 13) Storage Bucket für Verträge
-- ──────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('vertraege', 'vertraege', false, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Mitarbeiter-Dokumente Bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('mitarbeiter-dokumente', 'mitarbeiter-dokumente', false, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Kunden-Dokumente Bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('kunden-dokumente', 'kunden-dokumente', false, 20971520, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

COMMIT;
