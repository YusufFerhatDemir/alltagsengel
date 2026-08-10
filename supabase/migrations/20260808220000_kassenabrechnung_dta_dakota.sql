-- =============================================================================
-- Migration: Kassenabrechnung + DTA + DAKOTA + Rückläufer + Fehlerprotokolle + Korrekturläufe
-- Datum: 2026-08-08
-- Beschreibung: Erweitert bestehende Abrechnungsinfrastruktur um vollständige
--   Kassenabrechnungs-Engine mit DTA-Workflow, DAKOTA-Connector-Schicht,
--   Rückläufer-Verarbeitung, zentralem Fehlermanagement und Korrekturläufen.
-- Abhängigkeiten: 20260808210000 (Zahlungen/Forderungen), 20260808130000 (Expansion Phase 2)
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ABRECHNUNGSLÄUFE ERWEITERN (bestehende Tabelle)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.abrechnungslaeufe
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS bundesland text,
  ADD COLUMN IF NOT EXISTS lauf_typ text DEFAULT 'erstabrechnung',
  ADD COLUMN IF NOT EXISTS korrektur_von uuid,
  ADD COLUMN IF NOT EXISTS anzahl_positionen integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pruefsumme text,
  ADD COLUMN IF NOT EXISTS validierung_bestanden boolean,
  ADD COLUMN IF NOT EXISTS validierung_ergebnis jsonb,
  ADD COLUMN IF NOT EXISTS export_datei_hash text,
  ADD COLUMN IF NOT EXISTS technische_version text DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS edifact_version text DEFAULT 'PLGA/PLAA TA1 6.5.1',
  ADD COLUMN IF NOT EXISTS freigegeben_von uuid,
  ADD COLUMN IF NOT EXISTS freigegeben_am timestamptz,
  ADD COLUMN IF NOT EXISTS dakota_auftrag_id uuid,
  ADD COLUMN IF NOT EXISTS antwort_datei_url text,
  ADD COLUMN IF NOT EXISTS antwort_status text,
  ADD COLUMN IF NOT EXISTS storniert_am timestamptz,
  ADD COLUMN IF NOT EXISTS storniert_von uuid,
  ADD COLUMN IF NOT EXISTS storno_grund text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.abrechnungslaeufe
  DROP CONSTRAINT IF EXISTS chk_lauf_status,
  ADD CONSTRAINT chk_lauf_status CHECK (status IN (
    'erstellt', 'validierung_laeuft', 'validierung_fehlgeschlagen',
    'geprueft', 'freigegeben', 'export_laeuft',
    'bereit_zum_export', 'exportiert',
    'bereit_zur_uebermittlung', 'uebermittlung_laeuft',
    'uebermittelt', 'quittiert',
    'angenommen', 'teilweise_abgelehnt', 'abgelehnt',
    'korrektur_erforderlich', 'korrigiert', 'abgeschlossen',
    'storniert'
  ));

ALTER TABLE public.abrechnungslaeufe
  DROP CONSTRAINT IF EXISTS chk_lauf_typ,
  ADD CONSTRAINT chk_lauf_typ CHECK (lauf_typ IN (
    'erstabrechnung', 'korrekturabrechnung', 'nachberechnung',
    'storno', 'wiederholungslauf', 'sammelabrechnung'
  ));

ALTER TABLE public.abrechnungslaeufe
  DROP CONSTRAINT IF EXISTS chk_antwort_status,
  ADD CONSTRAINT chk_antwort_status CHECK (antwort_status IS NULL OR antwort_status IN (
    'angenommen', 'angenommen_mit_hinweis', 'teilweise_abgelehnt',
    'abgelehnt', 'technischer_fehler', 'fachlicher_fehler',
    'duplikat', 'korrektur_erforderlich'
  ));

ALTER TABLE public.abrechnungslaeufe
  DROP CONSTRAINT IF EXISTS fk_lauf_korrektur_von,
  ADD CONSTRAINT fk_lauf_korrektur_von FOREIGN KEY (korrektur_von)
    REFERENCES public.abrechnungslaeufe(id);

CREATE INDEX IF NOT EXISTS idx_abrechnungslaeufe_org
  ON public.abrechnungslaeufe(organization_id);
CREATE INDEX IF NOT EXISTS idx_abrechnungslaeufe_monat_status
  ON public.abrechnungslaeufe(abrechnungsmonat, status);
CREATE INDEX IF NOT EXISTS idx_abrechnungslaeufe_kt_ik
  ON public.abrechnungslaeufe(kostentraeger_ik);
CREATE INDEX IF NOT EXISTS idx_abrechnungslaeufe_bundesland
  ON public.abrechnungslaeufe(bundesland);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LAUF-RECHNUNGEN VERKNÜPFUNG (M:N)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dta_lauf_rechnungen (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  lauf_id uuid NOT NULL REFERENCES public.abrechnungslaeufe(id),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id),
  position_im_lauf integer NOT NULL,
  betrag_cent integer NOT NULL,
  status text DEFAULT 'inkludiert',
  created_at timestamptz DEFAULT now(),
  CONSTRAINT chk_dlr_status CHECK (status IN (
    'inkludiert', 'angenommen', 'abgelehnt', 'teilweise_abgelehnt', 'korrigiert'
  )),
  CONSTRAINT uq_dlr_lauf_invoice UNIQUE (lauf_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_dlr_org ON public.dta_lauf_rechnungen(organization_id);
CREATE INDEX IF NOT EXISTS idx_dlr_invoice ON public.dta_lauf_rechnungen(invoice_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. KOSTENTRÄGER-STAMMDATEN (erweitert, historisiert)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dta_kostentraeger (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  ik_nummer text NOT NULL,
  name text NOT NULL,
  typ text NOT NULL,
  kassenart text,
  bundesland text,
  abrechnungsweg text DEFAULT 'edifact',
  leistungsarten text[] DEFAULT '{}',
  datenannahmestelle_id uuid REFERENCES public.datenannahmestellen(id),
  dateiformat text DEFAULT 'PLGA/PLAA',
  technische_parameter jsonb DEFAULT '{}',
  ansprechpartner text,
  email text,
  telefon text,
  fax text,
  post_adresse text,
  gueltig_ab date NOT NULL DEFAULT CURRENT_DATE,
  gueltig_bis date,
  ist_aktiv boolean DEFAULT true,
  notizen text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT chk_kt_typ CHECK (typ IN (
    'pflegekasse', 'krankenkasse', 'sozialamt', 'berufsgenossenschaft',
    'privatkasse', 'sonstiger'
  )),
  CONSTRAINT chk_kt_kassenart CHECK (kassenart IS NULL OR kassenart IN (
    'AO', 'BK', 'BN', 'EK', 'IK', 'LK', 'SE'
  )),
  CONSTRAINT chk_kt_abrechnungsweg CHECK (abrechnungsweg IN (
    'edifact', 'papier', 'portal', 'sonstig'
  ))
);

CREATE INDEX IF NOT EXISTS idx_dta_kt_org ON public.dta_kostentraeger(organization_id);
CREATE INDEX IF NOT EXISTS idx_dta_kt_ik ON public.dta_kostentraeger(ik_nummer);
CREATE INDEX IF NOT EXISTS idx_dta_kt_bundesland ON public.dta_kostentraeger(bundesland);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dta_kt_org_ik_gueltig
  ON public.dta_kostentraeger(organization_id, ik_nummer, gueltig_ab)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ANNAHMESTELLEN ERWEITERN (bestehende Tabelle)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.datenannahmestellen
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS bundesland text,
  ADD COLUMN IF NOT EXISTS kassenart text,
  ADD COLUMN IF NOT EXISTS leistungsarten text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dateiformat text DEFAULT 'PLGA/PLAA',
  ADD COLUMN IF NOT EXISTS max_dateigroesse_kb integer DEFAULT 10240,
  ADD COLUMN IF NOT EXISTS gueltig_ab date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS gueltig_bis date,
  ADD COLUMN IF NOT EXISTS letzte_verbindung_am timestamptz,
  ADD COLUMN IF NOT EXISTS verbindung_status text DEFAULT 'nicht_getestet',
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.datenannahmestellen
  DROP CONSTRAINT IF EXISTS chk_das_verbindung,
  ADD CONSTRAINT chk_das_verbindung CHECK (verbindung_status IN (
    'nicht_getestet', 'erfolgreich', 'fehlgeschlagen', 'zertifikat_abgelaufen'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. DAKOTA-AUFTRÄGE (Versandaufträge an DAKOTA Connector)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dta_dakota_auftraege (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  lauf_id uuid NOT NULL REFERENCES public.abrechnungslaeufe(id),
  datenannahmestelle_id uuid REFERENCES public.datenannahmestellen(id),
  empfaenger_ik text NOT NULL,
  absender_ik text NOT NULL,
  logischer_dateiname text NOT NULL,
  physikalischer_dateiname text,
  nutzdaten_url text,
  auftragsdatei_url text,
  nutzdaten_hash text,
  nutzdaten_groesse_bytes integer,
  verschluesselt boolean DEFAULT false,
  status text DEFAULT 'erstellt',
  fehler_code text,
  fehler_meldung text,
  versand_versuche integer DEFAULT 0,
  letzter_versuch_am timestamptz,
  uebermittelt_am timestamptz,
  quittung_am timestamptz,
  quittung_referenz text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT chk_da_status CHECK (status IN (
    'erstellt', 'verschluesselung_laeuft', 'verschluesselt',
    'bereit_zur_uebermittlung', 'uebermittlung_laeuft',
    'uebermittelt', 'quittiert',
    'technischer_fehler', 'abgebrochen',
    'externer_zugang_fehlt'
  ))
);

CREATE INDEX IF NOT EXISTS idx_da_org ON public.dta_dakota_auftraege(organization_id);
CREATE INDEX IF NOT EXISTS idx_da_lauf ON public.dta_dakota_auftraege(lauf_id);
CREATE INDEX IF NOT EXISTS idx_da_status ON public.dta_dakota_auftraege(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RÜCKLÄUFER (Rückmeldungen von Kostenträgern/Annahmestellen)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dta_ruecklaeufer (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  lauf_id uuid REFERENCES public.abrechnungslaeufe(id),
  dakota_auftrag_id uuid REFERENCES public.dta_dakota_auftraege(id),
  invoice_id uuid REFERENCES public.invoices(id),
  client_id uuid,
  kostentraeger_ik text,
  datenannahmestelle_ik text,
  ruecklaeufer_typ text NOT NULL,
  status text NOT NULL DEFAULT 'eingegangen',
  fehler_code text,
  fehler_text text,
  original_meldung text,
  betrag_angefordert_cent integer,
  betrag_anerkannt_cent integer,
  betrag_abgelehnt_cent integer,
  betrag_differenz_cent integer GENERATED ALWAYS AS (
    COALESCE(betrag_angefordert_cent, 0) - COALESCE(betrag_anerkannt_cent, 0)
  ) STORED,
  positionen_gesamt integer,
  positionen_angenommen integer,
  positionen_abgelehnt integer,
  ablehnungsgruende jsonb DEFAULT '[]',
  hinweise jsonb DEFAULT '[]',
  quelldatei_url text,
  quelldatei_hash text,
  quelldatei_name text,
  importiert_am timestamptz DEFAULT now(),
  bearbeitet_von uuid,
  bearbeitet_am timestamptz,
  korrektur_lauf_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT chk_rl_typ CHECK (ruecklaeufer_typ IN (
    'quittung', 'annahmebestaetigung', 'fehlermeldung',
    'abrechnungsergebnis', 'zahlungsavis', 'sonstige'
  )),
  CONSTRAINT chk_rl_status CHECK (status IN (
    'eingegangen', 'in_verarbeitung', 'zugeordnet',
    'angenommen', 'angenommen_mit_hinweis',
    'teilweise_abgelehnt', 'abgelehnt',
    'technischer_fehler', 'fachlicher_fehler',
    'duplikat', 'korrektur_erforderlich',
    'korrektur_erstellt', 'erledigt'
  ))
);

CREATE INDEX IF NOT EXISTS idx_rl_org ON public.dta_ruecklaeufer(organization_id);
CREATE INDEX IF NOT EXISTS idx_rl_lauf ON public.dta_ruecklaeufer(lauf_id);
CREATE INDEX IF NOT EXISTS idx_rl_invoice ON public.dta_ruecklaeufer(invoice_id);
CREATE INDEX IF NOT EXISTS idx_rl_status ON public.dta_ruecklaeufer(status);
CREATE INDEX IF NOT EXISTS idx_rl_kt_ik ON public.dta_ruecklaeufer(kostentraeger_ik);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RÜCKLÄUFER-POSITIONEN (Einzelpositionen pro Rückläufer)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dta_ruecklaeufer_positionen (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  ruecklaeufer_id uuid NOT NULL REFERENCES public.dta_ruecklaeufer(id) ON DELETE CASCADE,
  invoice_item_id uuid REFERENCES public.invoice_items(id),
  position_nummer integer,
  leistungsart text,
  leistungsdatum date,
  status text NOT NULL DEFAULT 'offen',
  betrag_angefordert_cent integer,
  betrag_anerkannt_cent integer,
  kuerzung_cent integer GENERATED ALWAYS AS (
    COALESCE(betrag_angefordert_cent, 0) - COALESCE(betrag_anerkannt_cent, 0)
  ) STORED,
  fehler_code text,
  fehler_text text,
  ablehnungsgrund text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT chk_rlp_status CHECK (status IN (
    'offen', 'angenommen', 'abgelehnt', 'gekuerzt', 'korrigiert'
  ))
);

CREATE INDEX IF NOT EXISTS idx_rlp_org ON public.dta_ruecklaeufer_positionen(organization_id);
CREATE INDEX IF NOT EXISTS idx_rlp_rl ON public.dta_ruecklaeufer_positionen(ruecklaeufer_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. FEHLERPROTOKOLL (zentrales Fehlerdashboard)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dta_fehlerprotokoll (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  lauf_id uuid REFERENCES public.abrechnungslaeufe(id),
  dakota_auftrag_id uuid REFERENCES public.dta_dakota_auftraege(id),
  ruecklaeufer_id uuid REFERENCES public.dta_ruecklaeufer(id),
  invoice_id uuid REFERENCES public.invoices(id),
  client_id uuid,
  kostentraeger_ik text,
  fehler_quelle text NOT NULL,
  fehler_kategorie text NOT NULL,
  fehler_code text,
  fehler_meldung text NOT NULL,
  original_meldung text,
  interne_erklaerung text,
  schweregrad text DEFAULT 'fehler',
  bearbeitungsstatus text DEFAULT 'neu',
  verantwortlicher uuid,
  loesung text,
  loesung_am timestamptz,
  korrektur_lauf_id uuid,
  wiedervorlage_am timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT chk_fp_quelle CHECK (fehler_quelle IN (
    'validierung', 'export', 'verschluesselung', 'transport',
    'annahmestelle', 'kostentraeger', 'ruecklaeufer', 'intern'
  )),
  CONSTRAINT chk_fp_kategorie CHECK (fehler_kategorie IN (
    'technisch', 'fachlich', 'daten', 'zertifikat',
    'verbindung', 'format', 'inhalt', 'sonstig'
  )),
  CONSTRAINT chk_fp_schwere CHECK (schweregrad IN (
    'hinweis', 'warnung', 'fehler', 'kritisch'
  )),
  CONSTRAINT chk_fp_bearbeitungsstatus CHECK (bearbeitungsstatus IN (
    'neu', 'in_pruefung', 'korrektur_erforderlich', 'korrigiert',
    'erneut_eingereicht', 'erledigt', 'ignoriert'
  ))
);

CREATE INDEX IF NOT EXISTS idx_fp_org ON public.dta_fehlerprotokoll(organization_id);
CREATE INDEX IF NOT EXISTS idx_fp_lauf ON public.dta_fehlerprotokoll(lauf_id);
CREATE INDEX IF NOT EXISTS idx_fp_status ON public.dta_fehlerprotokoll(bearbeitungsstatus);
CREATE INDEX IF NOT EXISTS idx_fp_invoice ON public.dta_fehlerprotokoll(invoice_id);
CREATE INDEX IF NOT EXISTS idx_fp_schwere ON public.dta_fehlerprotokoll(schweregrad);
CREATE INDEX IF NOT EXISTS idx_fp_wiedervorlage ON public.dta_fehlerprotokoll(wiedervorlage_am)
  WHERE wiedervorlage_am IS NOT NULL AND bearbeitungsstatus NOT IN ('erledigt', 'ignoriert');

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. KORREKTURLÄUFE (Referenz Original → Korrektur)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dta_korrekturlaeufe (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  original_lauf_id uuid NOT NULL REFERENCES public.abrechnungslaeufe(id),
  korrektur_lauf_id uuid REFERENCES public.abrechnungslaeufe(id),
  ruecklaeufer_id uuid REFERENCES public.dta_ruecklaeufer(id),
  fehler_ids uuid[] DEFAULT '{}',
  korrektur_typ text NOT NULL,
  korrektur_grund text NOT NULL,
  betroffene_rechnungen integer DEFAULT 0,
  betroffene_positionen integer DEFAULT 0,
  differenz_cent integer DEFAULT 0,
  status text DEFAULT 'angelegt',
  angelegt_von uuid,
  freigegeben_von uuid,
  freigegeben_am timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT chk_kl_typ CHECK (korrektur_typ IN (
    'korrekturabrechnung', 'nachberechnung', 'storno',
    'teilstorno', 'gutschrift'
  )),
  CONSTRAINT chk_kl_status CHECK (status IN (
    'angelegt', 'in_bearbeitung', 'validiert', 'freigegeben',
    'exportiert', 'uebermittelt', 'abgeschlossen', 'abgebrochen'
  ))
);

CREATE INDEX IF NOT EXISTS idx_kl_org ON public.dta_korrekturlaeufe(organization_id);
CREATE INDEX IF NOT EXISTS idx_kl_original ON public.dta_korrekturlaeufe(original_lauf_id);
CREATE INDEX IF NOT EXISTS idx_kl_korrektur ON public.dta_korrekturlaeufe(korrektur_lauf_id);
CREATE INDEX IF NOT EXISTS idx_kl_status ON public.dta_korrekturlaeufe(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. PRE-FLIGHT VALIDIERUNGSERGEBNISSE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dta_validierungen (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL,
  lauf_id uuid NOT NULL REFERENCES public.abrechnungslaeufe(id),
  validiert_am timestamptz DEFAULT now(),
  validiert_von uuid,
  bestanden boolean NOT NULL,
  fehler_anzahl integer DEFAULT 0,
  warnungen_anzahl integer DEFAULT 0,
  ergebnis jsonb NOT NULL DEFAULT '[]',
  pruefpunkte jsonb NOT NULL DEFAULT '{}',
  dauer_ms integer,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_val_org ON public.dta_validierungen(organization_id);
CREATE INDEX IF NOT EXISTS idx_val_lauf ON public.dta_validierungen(lauf_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. DTA AUDIT TRAIL (erweitert billing_audit_trail um DTA-Entitäten)
-- ─────────────────────────────────────────────────────────────────────────────

-- billing_audit_trail existiert bereits, entity_type ist text ohne constraint.
-- Wir fügen neue entity_types hinzu die von der Engine genutzt werden:
-- 'dta_lauf', 'dta_export', 'dta_validierung', 'dta_freigabe',
-- 'dta_uebermittlung', 'dakota_auftrag', 'ruecklaeufer', 'fehlerprotokoll',
-- 'korrekturlauf', 'dta_abschluss'

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. DOPPELVERSAND-SCHUTZ
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_lauf_dedup
  ON public.abrechnungslaeufe(organization_id, abrechnungsmonat, kostentraeger_ik, lauf_typ)
  WHERE status NOT IN ('storniert', 'abgelehnt', 'korrigiert')
    AND deleted_at IS NULL
    AND lauf_typ = 'erstabrechnung';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dakota_dedup
  ON public.dta_dakota_auftraege(lauf_id)
  WHERE status NOT IN ('abgebrochen', 'technischer_fehler');

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. RLS POLICIES (RESTRICTIVE org_fence auf allen neuen Tabellen)
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: is_admin() sollte bereits existieren (aus früheren Migrationen)

-- abrechnungslaeufe: RLS aktivieren (war vorher ohne)
ALTER TABLE public.abrechnungslaeufe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_fence_abrechnungslaeufe ON public.abrechnungslaeufe;
CREATE POLICY org_fence_abrechnungslaeufe ON public.abrechnungslaeufe
  AS RESTRICTIVE FOR ALL
  USING (
    organization_id IS NULL
    OR organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS admin_abrechnungslaeufe ON public.abrechnungslaeufe;
CREATE POLICY admin_abrechnungslaeufe ON public.abrechnungslaeufe
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
    )
  );

-- dta_lauf_rechnungen
ALTER TABLE public.dta_lauf_rechnungen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_fence_dlr ON public.dta_lauf_rechnungen;
CREATE POLICY org_fence_dlr ON public.dta_lauf_rechnungen
  AS RESTRICTIVE FOR ALL
  USING (
    organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS admin_dlr ON public.dta_lauf_rechnungen;
CREATE POLICY admin_dlr ON public.dta_lauf_rechnungen
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
    )
  );

-- dta_kostentraeger
ALTER TABLE public.dta_kostentraeger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_fence_kt ON public.dta_kostentraeger;
CREATE POLICY org_fence_kt ON public.dta_kostentraeger
  AS RESTRICTIVE FOR ALL
  USING (
    organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS admin_kt ON public.dta_kostentraeger;
CREATE POLICY admin_kt ON public.dta_kostentraeger
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
    )
  );

-- datenannahmestellen: RLS aktivieren
ALTER TABLE public.datenannahmestellen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_fence_das ON public.datenannahmestellen;
CREATE POLICY org_fence_das ON public.datenannahmestellen
  AS RESTRICTIVE FOR ALL
  USING (
    organization_id IS NULL
    OR organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS admin_das ON public.datenannahmestellen;
CREATE POLICY admin_das ON public.datenannahmestellen
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
    )
  );

-- dta_dakota_auftraege
ALTER TABLE public.dta_dakota_auftraege ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_fence_da ON public.dta_dakota_auftraege;
CREATE POLICY org_fence_da ON public.dta_dakota_auftraege
  AS RESTRICTIVE FOR ALL
  USING (
    organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS admin_da ON public.dta_dakota_auftraege;
CREATE POLICY admin_da ON public.dta_dakota_auftraege
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
    )
  );

-- dta_ruecklaeufer
ALTER TABLE public.dta_ruecklaeufer ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_fence_rl ON public.dta_ruecklaeufer;
CREATE POLICY org_fence_rl ON public.dta_ruecklaeufer
  AS RESTRICTIVE FOR ALL
  USING (
    organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS admin_rl ON public.dta_ruecklaeufer;
CREATE POLICY admin_rl ON public.dta_ruecklaeufer
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
    )
  );

-- dta_ruecklaeufer_positionen
ALTER TABLE public.dta_ruecklaeufer_positionen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_fence_rlp ON public.dta_ruecklaeufer_positionen;
CREATE POLICY org_fence_rlp ON public.dta_ruecklaeufer_positionen
  AS RESTRICTIVE FOR ALL
  USING (
    organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS admin_rlp ON public.dta_ruecklaeufer_positionen;
CREATE POLICY admin_rlp ON public.dta_ruecklaeufer_positionen
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
    )
  );

-- dta_fehlerprotokoll
ALTER TABLE public.dta_fehlerprotokoll ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_fence_fp ON public.dta_fehlerprotokoll;
CREATE POLICY org_fence_fp ON public.dta_fehlerprotokoll
  AS RESTRICTIVE FOR ALL
  USING (
    organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS admin_fp ON public.dta_fehlerprotokoll;
CREATE POLICY admin_fp ON public.dta_fehlerprotokoll
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
    )
  );

-- dta_korrekturlaeufe
ALTER TABLE public.dta_korrekturlaeufe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_fence_kl ON public.dta_korrekturlaeufe;
CREATE POLICY org_fence_kl ON public.dta_korrekturlaeufe
  AS RESTRICTIVE FOR ALL
  USING (
    organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS admin_kl ON public.dta_korrekturlaeufe;
CREATE POLICY admin_kl ON public.dta_korrekturlaeufe
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
    )
  );

-- dta_validierungen
ALTER TABLE public.dta_validierungen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_fence_val ON public.dta_validierungen;
CREATE POLICY org_fence_val ON public.dta_validierungen
  AS RESTRICTIVE FOR ALL
  USING (
    organization_id = public.current_org_id()
  );

DROP POLICY IF EXISTS admin_val ON public.dta_validierungen;
CREATE POLICY admin_val ON public.dta_validierungen
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'superadmin')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. IMMUTABLE AUDIT TRIGGERS (UPDATE/DELETE blockieren)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_modify_dta_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $prevent_mod$
BEGIN
  RAISE EXCEPTION 'DTA-Audit-Einträge sind unveränderbar (append-only)';
END;
$prevent_mod$;

DO $apply_triggers$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'dta_validierungen',
      'dta_ruecklaeufer_positionen'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_immutable_%I ON public.%I',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE TRIGGER trg_immutable_%I
       BEFORE UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.prevent_modify_dta_audit()',
      tbl, tbl
    );
  END LOOP;
END;
$apply_triggers$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. STATUS-TRANSITION TRIGGER FÜR ABRECHNUNGSLÄUFE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_lauf_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $lauf_st$
DECLARE
  erlaubt text[];
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  CASE OLD.status
    WHEN 'erstellt' THEN
      erlaubt := ARRAY['validierung_laeuft', 'storniert'];
    WHEN 'validierung_laeuft' THEN
      erlaubt := ARRAY['geprueft', 'validierung_fehlgeschlagen'];
    WHEN 'validierung_fehlgeschlagen' THEN
      erlaubt := ARRAY['validierung_laeuft', 'storniert'];
    WHEN 'geprueft' THEN
      erlaubt := ARRAY['freigegeben', 'storniert'];
    WHEN 'freigegeben' THEN
      erlaubt := ARRAY['export_laeuft', 'storniert'];
    WHEN 'export_laeuft' THEN
      erlaubt := ARRAY['bereit_zum_export', 'exportiert', 'validierung_fehlgeschlagen'];
    WHEN 'bereit_zum_export' THEN
      erlaubt := ARRAY['exportiert', 'storniert'];
    WHEN 'exportiert' THEN
      erlaubt := ARRAY['bereit_zur_uebermittlung', 'storniert'];
    WHEN 'bereit_zur_uebermittlung' THEN
      erlaubt := ARRAY['uebermittlung_laeuft', 'storniert'];
    WHEN 'uebermittlung_laeuft' THEN
      erlaubt := ARRAY['uebermittelt', 'bereit_zur_uebermittlung'];
    WHEN 'uebermittelt' THEN
      erlaubt := ARRAY['quittiert', 'angenommen', 'teilweise_abgelehnt', 'abgelehnt'];
    WHEN 'quittiert' THEN
      erlaubt := ARRAY['angenommen', 'teilweise_abgelehnt', 'abgelehnt'];
    WHEN 'angenommen' THEN
      erlaubt := ARRAY['abgeschlossen'];
    WHEN 'teilweise_abgelehnt' THEN
      erlaubt := ARRAY['korrektur_erforderlich', 'abgeschlossen'];
    WHEN 'abgelehnt' THEN
      erlaubt := ARRAY['korrektur_erforderlich'];
    WHEN 'korrektur_erforderlich' THEN
      erlaubt := ARRAY['korrigiert'];
    WHEN 'korrigiert' THEN
      erlaubt := ARRAY['abgeschlossen'];
    WHEN 'abgeschlossen' THEN
      erlaubt := ARRAY[]::text[];
    WHEN 'storniert' THEN
      erlaubt := ARRAY[]::text[];
    ELSE
      erlaubt := ARRAY[]::text[];
  END CASE;

  IF NOT (NEW.status = ANY(erlaubt)) THEN
    RAISE EXCEPTION 'Ungültiger Statusübergang für Abrechnungslauf: % → % (erlaubt: %)',
      OLD.status, NEW.status, array_to_string(erlaubt, ', ');
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$lauf_st$;

DROP TRIGGER IF EXISTS trg_lauf_status ON public.abrechnungslaeufe;
CREATE TRIGGER trg_lauf_status
  BEFORE UPDATE OF status ON public.abrechnungslaeufe
  FOR EACH ROW EXECUTE FUNCTION public.validate_lauf_status_transition();

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. UPDATED_AT AUTO-TRIGGER
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $upd$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$upd$;

DO $apply_updated$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'dta_kostentraeger',
      'dta_dakota_auftraege',
      'dta_ruecklaeufer',
      'dta_fehlerprotokoll',
      'dta_korrekturlaeufe'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at_%I ON public.%I',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at_%I
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      tbl, tbl
    );
  END LOOP;
END;
$apply_updated$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. VIEWS FÜR ADMIN-DASHBOARD
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.dta_dashboard AS
  SELECT
    al.organization_id,
    al.bundesland,
    COUNT(*) FILTER (WHERE al.status NOT IN ('storniert')) AS laeufe_gesamt,
    COUNT(*) FILTER (WHERE al.status = 'erstellt') AS laeufe_offen,
    COUNT(*) FILTER (WHERE al.status IN ('geprueft', 'freigegeben')) AS laeufe_bereit,
    COUNT(*) FILTER (WHERE al.status IN ('exportiert', 'bereit_zur_uebermittlung', 'uebermittelt')) AS laeufe_in_uebermittlung,
    COUNT(*) FILTER (WHERE al.status = 'angenommen') AS laeufe_angenommen,
    COUNT(*) FILTER (WHERE al.status IN ('teilweise_abgelehnt', 'abgelehnt')) AS laeufe_probleme,
    COUNT(*) FILTER (WHERE al.status = 'abgeschlossen') AS laeufe_abgeschlossen,
    COALESCE(SUM(al.gesamtbetrag_cent) FILTER (WHERE al.status NOT IN ('storniert')), 0) AS gesamt_cent,
    COALESCE(SUM(al.gesamtbetrag_cent) FILTER (WHERE al.status = 'angenommen'), 0) AS angenommen_cent,
    (SELECT COUNT(*) FROM public.dta_fehlerprotokoll fp
     WHERE fp.organization_id = al.organization_id
       AND fp.bearbeitungsstatus IN ('neu', 'in_pruefung', 'korrektur_erforderlich')) AS offene_fehler,
    (SELECT COUNT(*) FROM public.dta_ruecklaeufer rl
     WHERE rl.organization_id = al.organization_id
       AND rl.status IN ('eingegangen', 'in_verarbeitung')) AS offene_ruecklaeufer
  FROM public.abrechnungslaeufe al
  WHERE al.deleted_at IS NULL
  GROUP BY al.organization_id, al.bundesland;

CREATE OR REPLACE VIEW public.dta_fehler_dashboard AS
  SELECT
    fp.organization_id,
    fp.fehler_quelle,
    fp.fehler_kategorie,
    fp.schweregrad,
    fp.bearbeitungsstatus,
    COUNT(*) AS anzahl,
    MIN(fp.created_at) AS aeltester,
    MAX(fp.created_at) AS neuester
  FROM public.dta_fehlerprotokoll fp
  GROUP BY fp.organization_id, fp.fehler_quelle, fp.fehler_kategorie,
           fp.schweregrad, fp.bearbeitungsstatus;

COMMIT;
