-- ═══════════════════════════════════════════════════════════════
-- § 302 SGB V — komplette interne Pipeline (WS2)
--
-- Block 17 (20260826020000, 20260902020000) legte Versionsregister,
-- Routing und den Lauf selbst an. Diese Migration schliesst die Lücken
-- zwischen "Lauf erstellt" und "Geld da / Rückmeldung verarbeitet",
-- OHNE die bestehenden generischen Pipelines (Rückläufer, Fehlerkatalog,
-- Zahlungsabgleich) für § 302 zu duplizieren:
--
--   1. dta_ruecklaeufer.sgb_v_lauf_id     — Brücke, damit Rückmeldungen
--      zu einem § 302-Lauf zugeordnet werden können (bisher nur
--      lauf_id → abrechnungslaeufe, das § 105-Modell).
--   2. zahlungseingaenge.sgb_v_lauf_id    — dieselbe Brücke für den
--      Zahlungsabgleich: § 302 hat keine invoices-Zeile, die Kasse zahlt
--      auf den Lauf/die Fälle, nicht auf eine Rechnung.
--   3. sgb_v_laeufe.korrektur_von         — Storno-/Korrekturkette,
--      analog zu abrechnungslaeufe.korrektur_von.
--   4. sgb_v_korrekturlaeufe              — Korrektur-/Storno-Vorgänge,
--      analog zu dta_korrekturlaeufe.
--   5. sgb_v_uebertragungsqueue           — Warteschlange für den
--      Transport-Adapter (Mock/File-Export heute, DAKOTA/KIM später).
--
-- WEITERHIN FAIL-CLOSED: keine dieser Tabellen macht den echten
-- Versand-Kanal scharf. sgb_v_uebertragungsqueue transportiert einen
-- internen Prüf-Export (siehe lib/abrechnung/sgb-v/export-generator.ts),
-- keinen amtlichen EDIFACT-Datensatz — der bleibt an
-- lib/abrechnung/sgb-v/generator.ts gesperrt, bis TA1 vorliegt.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Privater Bucket für den internen Prüf-Export (KEIN amtlicher Datensatz)
-- ─────────────────────────────────────────────────────────────────────────────
-- Keine storage.objects-Policy nötig: der FileExportAdapter schreibt serverseitig
-- über service_role, das RLS umgeht ohnehin. Privater Bucket verhindert
-- lediglich anonymen/öffentlichen Zugriff.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('sgb-v-pruefexporte', 'sgb-v-pruefexporte', false, 5242880, ARRAY['application/json', 'text/csv'])
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. dta_ruecklaeufer — Brücke zu sgb_v_laeufe
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.dta_ruecklaeufer
  ADD COLUMN IF NOT EXISTS sgb_v_lauf_id uuid REFERENCES public.sgb_v_laeufe(id);

CREATE INDEX IF NOT EXISTS idx_dta_ruecklaeufer_sgb_v_lauf
  ON public.dta_ruecklaeufer(sgb_v_lauf_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. zahlungseingaenge — Brücke zu sgb_v_laeufe
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.zahlungseingaenge
  ADD COLUMN IF NOT EXISTS sgb_v_lauf_id uuid REFERENCES public.sgb_v_laeufe(id);

CREATE INDEX IF NOT EXISTS idx_zahlungseingaenge_sgb_v_lauf
  ON public.zahlungseingaenge(sgb_v_lauf_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. sgb_v_laeufe — Korrekturkette
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.sgb_v_laeufe
  ADD COLUMN IF NOT EXISTS korrektur_von uuid REFERENCES public.sgb_v_laeufe(id),
  ADD COLUMN IF NOT EXISTS storno_grund text;

CREATE INDEX IF NOT EXISTS idx_sgb_v_laeufe_korrektur_von
  ON public.sgb_v_laeufe(korrektur_von);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. sgb_v_korrekturlaeufe — Storno/Korrektur-Vorgänge
-- ─────────────────────────────────────────────────────────────────────────────
-- Analog zu dta_korrekturlaeufe (lib/abrechnung/korrekturlaeufe.ts): erst ein
-- Vorgang mit Prüfung/Begründung ("angelegt"), erst bei Ausführung entsteht
-- ein neuer sgb_v_laeufe-Datensatz, auf den korrektur_lauf_id zeigt.

CREATE TABLE IF NOT EXISTS public.sgb_v_korrekturlaeufe (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid NOT NULL DEFAULT current_org_id()
                    REFERENCES public.organizations(id),

  original_lauf_id  uuid NOT NULL REFERENCES public.sgb_v_laeufe(id),
  ruecklaeufer_id    uuid REFERENCES public.dta_ruecklaeufer(id),

  korrektur_typ     text NOT NULL
                    CHECK (korrektur_typ IN ('storno', 'teilstorno', 'korrekturabrechnung')),
  korrektur_grund   text NOT NULL,

  differenz_cent    integer NOT NULL DEFAULT 0,

  status            text NOT NULL DEFAULT 'angelegt'
                    CHECK (status IN ('angelegt', 'in_bearbeitung', 'ausgefuehrt', 'abgebrochen')),

  korrektur_lauf_id uuid REFERENCES public.sgb_v_laeufe(id),
  ausgefuehrt_am    timestamptz,
  ausgefuehrt_von   uuid REFERENCES auth.users(id),

  angelegt_von      uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sgb_v_korrekturlaeufe_org
  ON public.sgb_v_korrekturlaeufe(organization_id);
CREATE INDEX IF NOT EXISTS idx_sgb_v_korrekturlaeufe_original
  ON public.sgb_v_korrekturlaeufe(original_lauf_id);

-- Ein Original-Lauf darf nicht zweimal einen offenen (nicht abgeschlossenen)
-- Storno-Vorgang haben — sonst entscheidet die Bearbeitungsreihenfolge,
-- welche Korrektur gilt.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sgb_v_korrektur_offen
  ON public.sgb_v_korrekturlaeufe(original_lauf_id)
  WHERE status IN ('angelegt', 'in_bearbeitung');

DROP TRIGGER IF EXISTS trg_sgb_v_korrekturlaeufe_updated ON public.sgb_v_korrekturlaeufe;
CREATE TRIGGER trg_sgb_v_korrekturlaeufe_updated
  BEFORE UPDATE ON public.sgb_v_korrekturlaeufe
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_dta_versand();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. sgb_v_uebertragungsqueue — Transport-Warteschlange
-- ─────────────────────────────────────────────────────────────────────────────
-- Trägt NICHT den amtlichen EDIFACT-Datensatz (der bleibt gesperrt), sondern
-- den internen Prüf-Export (JSON/CSV, siehe export-generator.ts). Der
-- Adapter-Typ entscheidet, was mit dem Export passiert:
--   'mock'         — simuliert einen Versand, verändert nichts extern
--   'file_export'  — legt den Export für manuellen Abruf ab
--   'dakota'/'kim' — Platzhalter, wirft "nicht implementiert"

CREATE TABLE IF NOT EXISTS public.sgb_v_uebertragungsqueue (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT current_org_id()
                  REFERENCES public.organizations(id),

  lauf_id         uuid NOT NULL REFERENCES public.sgb_v_laeufe(id),

  adapter_typ     text NOT NULL
                  CHECK (adapter_typ IN ('mock', 'file_export', 'dakota', 'kim')),

  status          text NOT NULL DEFAULT 'wartend'
                  CHECK (status IN (
                    'wartend', 'in_bearbeitung', 'erfolgreich', 'fehlgeschlagen', 'abgebrochen'
                  )),

  versuch_zaehler       integer NOT NULL DEFAULT 0,
  letzter_versuch_am    timestamptz,
  naechster_versuch_am  timestamptz,
  letzter_fehler        text,

  export_hash     text,
  export_groesse_bytes integer,
  ziel_referenz   text,

  eingereiht_von  uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sgb_v_uebertragungsqueue_org_status
  ON public.sgb_v_uebertragungsqueue(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_sgb_v_uebertragungsqueue_lauf
  ON public.sgb_v_uebertragungsqueue(lauf_id);

DROP TRIGGER IF EXISTS trg_sgb_v_uebertragungsqueue_updated ON public.sgb_v_uebertragungsqueue;
CREATE TRIGGER trg_sgb_v_uebertragungsqueue_updated
  BEFORE UPDATE ON public.sgb_v_uebertragungsqueue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_dta_versand();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS — org_fence RESTRICTIVE + Admin-CRUD, anon ausgesperrt
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.sgb_v_korrekturlaeufe    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sgb_v_uebertragungsqueue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sgb_v_korrekturlaeufe' AND policyname = 'org_fence_sgb_v_korrekturlaeufe') THEN
    CREATE POLICY org_fence_sgb_v_korrekturlaeufe ON public.sgb_v_korrekturlaeufe AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sgb_v_korrekturlaeufe' AND policyname = 'admin_sgb_v_korrekturlaeufe_all') THEN
    CREATE POLICY admin_sgb_v_korrekturlaeufe_all ON public.sgb_v_korrekturlaeufe FOR ALL
      USING (is_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sgb_v_uebertragungsqueue' AND policyname = 'org_fence_sgb_v_uebertragungsqueue') THEN
    CREATE POLICY org_fence_sgb_v_uebertragungsqueue ON public.sgb_v_uebertragungsqueue AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sgb_v_uebertragungsqueue' AND policyname = 'admin_sgb_v_uebertragungsqueue_all') THEN
    CREATE POLICY admin_sgb_v_uebertragungsqueue_all ON public.sgb_v_uebertragungsqueue FOR ALL
      USING (is_admin());
  END IF;
END $$;

REVOKE ALL ON public.sgb_v_korrekturlaeufe    FROM anon;
REVOKE ALL ON public.sgb_v_uebertragungsqueue FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Audit-Entity-Typen erweitern
-- ─────────────────────────────────────────────────────────────────────────────
-- Muss deckungsgleich mit AUDIT_ENTITY_TYPES in lib/billing/core/audit.ts
-- bleiben — __tests__/abrechnung/audit-entity-types.test.ts prüft das.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_audit_trail_entity_type_check'
      AND pg_get_constraintdef(oid) LIKE '%sgb_v_korrekturlauf%'
  ) THEN
    ALTER TABLE public.billing_audit_trail
      DROP CONSTRAINT IF EXISTS billing_audit_trail_entity_type_check;
    ALTER TABLE public.billing_audit_trail
      ADD CONSTRAINT billing_audit_trail_entity_type_check CHECK (
        entity_type = ANY(ARRAY[
          'invoice', 'tariff', 'correction', 'snapshot', 'credit_note',
          'payment', 'payment_allocation', 'dunning', 'payment_difference',
          'monthly_closing',
          'dta_lauf', 'dta_kostentraeger', 'dta_dakota_auftrag',
          'dta_ruecklaeufer', 'dta_fehlerprotokoll', 'dta_korrekturlauf',
          'dta_validierung', 'dta_lauf_rechnung', 'dta_annahmestelle',
          'dta_ruecklaeufer_position',
          'dokument', 'dokument_version', 'vertrag', 'kontaktperson',
          'verordnung', 'kundenakte', 'mitarbeiterakte',
          'sepa_mandate', 'sepa_batch', 'dunning_document',
          'billing_fristen',
          'camt_import', 'zahlungseingang', 'klaerfall', 'ruecklastschrift',
          'datev_export', 'datev_kontenzuordnung',
          'sgb_v_lauf', 'sgb_v_formatversion', 'sgb_v_routing',
          'kim_konfiguration', 'kim_formatversion', 'kim_karte', 'kim_nachricht',
          'dta_versand', 'dta_wiedervorlage', 'dta_fehlercode',
          'abrechnung_betriebsmodus', 'abrechnung_credential', 'dta_dead_letter',
          -- WS2 — § 302 Pipeline-Erweiterung
          'sgb_v_korrekturlauf', 'sgb_v_uebertragung', 'sgb_v_zahlungszuordnung'
        ])
      );
  END IF;
END $$;

COMMIT;
