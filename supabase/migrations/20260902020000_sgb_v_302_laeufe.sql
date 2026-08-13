-- ═══════════════════════════════════════════════════════════════
-- Stream 2 — § 302 SGB V: Abrechnungsläufe
--
-- Block 17 (20260826020000) legte Versionsregister und Routing an, aber keine
-- Tabelle für den Lauf selbst. Damit hatte der § 302-Pfad kein Gegenstück zu
-- `abrechnungslaeufe` — ein Versandweg ohne Vorgang, den er versenden könnte.
--
-- Diese Migration ergänzt genau das: `sgb_v_laeufe` mit demselben
-- Statusmodell wie der § 105-Pfad, damit lib/abrechnung/sgb-v/versand.ts
-- dieselbe Pipeline fahren kann (Erzeugung → Gate → Übertragung → Rückmeldung)
-- und dasselbe Protokoll schreibt (dta_versand_protokoll, kanal='sftp_302').
--
-- WEITERHIN FAIL-CLOSED
-- Die Tabelle macht den Kanal NICHT scharf. Ein Lauf kann angelegt werden und
-- bleibt in 'erstellt', weil `erzeugeSgbVDatei()` ohne vorliegende Technische
-- Anlage 1 wirft und das Gate SGB_V_302_FREIGABE zusätzlich zu ist. Der
-- Vorgang existiert, die Ausführung ist gesperrt — dasselbe Muster wie SECON
-- und KIM.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.sgb_v_laeufe (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT current_org_id()
                  REFERENCES public.organizations(id),

  abrechnungsmonat text NOT NULL CHECK (abrechnungsmonat ~ '^\d{4}-\d{2}'),
  bundesland       text,

  kostentraeger_ik   text CHECK (kostentraeger_ik IS NULL OR kostentraeger_ik ~ '^\d{9}$'),
  kostentraeger_name text,
  -- Aus sgb_v_routing aufgelöst, zum Zeitpunkt der Lauferstellung eingefroren:
  -- ändert sich das Routing später, bleibt nachvollziehbar, wohin gesendet wurde.
  datenannahmestelle_ik   text CHECK (datenannahmestelle_ik IS NULL OR datenannahmestelle_ik ~ '^\d{9}$'),
  datenannahmestelle_name text,

  -- Welche Formatversion galt. NULL, solange keine spec-bestätigte Version
  -- existiert — genau der Normalfall bis zur Freischaltung.
  formatversion_id uuid REFERENCES public.sgb_v_formatversionen(id),
  ta_version       text,

  -- Statusmodell bewusst identisch zu abrechnungslaeufe.status, damit
  -- Oberfläche, Pipeline-Orchestrator und Auswertungen nicht zwei Vokabulare
  -- auseinanderhalten müssen.
  status          text NOT NULL DEFAULT 'erstellt'
                  CHECK (status IN (
                    'erstellt', 'validierung_laeuft', 'validierung_fehlgeschlagen',
                    'geprueft', 'freigegeben', 'export_laeuft',
                    'bereit_zum_export', 'exportiert',
                    'bereit_zur_uebermittlung', 'uebermittlung_laeuft',
                    'uebermittelt', 'quittiert',
                    'angenommen', 'teilweise_abgelehnt', 'abgelehnt',
                    'korrektur_erforderlich', 'korrigiert', 'abgeschlossen',
                    'storniert',
                    -- Zusätzlich zum § 105-Modell: der Kanal ist extern zu.
                    'gesperrt_extern'
                  )),

  -- Warum der Lauf steht. Wird beim Stopp am Gate gesetzt und beim nächsten
  -- Versuch überschrieben — nie stillschweigend geleert.
  sperr_grund     text,

  anzahl_faelle       integer NOT NULL DEFAULT 0,
  anzahl_positionen   integer NOT NULL DEFAULT 0,
  gesamtbetrag_cent   integer NOT NULL DEFAULT 0,

  -- Erzeugte Datei. Bleibt NULL, solange der Generator gesperrt ist.
  logischer_dateiname   text,
  datei_url             text,
  datei_hash            text,
  -- '0' = Test, '2' = Produktion. Default Test: eine Produktionsdatei
  -- entsteht nur, wenn sie ausdrücklich angefordert wird.
  dateiindikator        text NOT NULL DEFAULT '0' CHECK (dateiindikator IN ('0', '2')),

  freigegeben_von uuid REFERENCES auth.users(id),
  freigegeben_am  timestamptz,
  uebermittelt_am timestamptz,
  antwort_status  text,
  antwort_am      timestamptz,

  erstellt_von    uuid REFERENCES auth.users(id),
  erstellt_am     timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sgb_v_laeufe_org_status
  ON public.sgb_v_laeufe(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_sgb_v_laeufe_monat
  ON public.sgb_v_laeufe(organization_id, abrechnungsmonat);

-- Pro Monat und Kostenträger höchstens ein aktiver Lauf — sonst wird derselbe
-- Zeitraum zweimal abgerechnet.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sgb_v_laeufe_monat_kt
  ON public.sgb_v_laeufe(organization_id, abrechnungsmonat, COALESCE(kostentraeger_ik, 'SAMMEL'))
  WHERE deleted_at IS NULL AND status NOT IN ('storniert', 'validierung_fehlgeschlagen');

COMMENT ON TABLE public.sgb_v_laeufe IS
  '§ 302-Abrechnungsläufe (häusliche Krankenpflege). Gegenstück zu '
  'abrechnungslaeufe für den § 105-Pfad. Erzeugung und Versand bleiben '
  'gesperrt, bis TA1 vorliegt und SGB_V_302_FREIGABE=true gesetzt ist.';

DROP TRIGGER IF EXISTS trg_sgb_v_laeufe_updated ON public.sgb_v_laeufe;
CREATE TRIGGER trg_sgb_v_laeufe_updated
  BEFORE UPDATE ON public.sgb_v_laeufe
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_dta_versand();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — org_fence RESTRICTIVE + Admin-CRUD, anon ausgesperrt
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.sgb_v_laeufe ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sgb_v_laeufe' AND policyname = 'org_fence_sgb_v_laeufe') THEN
    CREATE POLICY org_fence_sgb_v_laeufe ON public.sgb_v_laeufe AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sgb_v_laeufe' AND policyname = 'admin_sgb_v_laeufe_all') THEN
    CREATE POLICY admin_sgb_v_laeufe_all ON public.sgb_v_laeufe FOR ALL
      USING (is_admin());
  END IF;
END $$;

REVOKE ALL ON public.sgb_v_laeufe FROM anon;

COMMIT;
