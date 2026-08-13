-- ═══════════════════════════════════════════════════════════════
-- Stream 2 — Kassenabrechnung: Versandpipeline, Rückläufer-Codes,
--            Wiedervorlage (Reprocessing)
--
-- Schliesst die drei Lücken zwischen "Datei erzeugt" und "Geld da":
--
--   1. dta_versand_protokoll  — lückenloser Nachweis JEDES Versandversuchs,
--                               auch der abgebrochenen. Bisher gab es nur
--                               Zählerfelder auf dta_dakota_auftraege
--                               (versand_versuche, letzter_versuch_am) —
--                               daraus lässt sich nicht rekonstruieren, WER
--                               WANN WAS versucht hat und woran es scheiterte.
--   2. dta_fehlercode_katalog — Übersetzung der Fehlercodes der Kassen in
--                               vier interne Kategorien.
--   3. dta_wiedervorlage      — Arbeitsvorrat für abgelehnte Positionen:
--                               korrigieren → erneut einreichen.
--
-- WAS DIESE MIGRATION ABSICHTLICH NICHT TUT
-- Sie befüllt den Fehlercode-Katalog NICHT mit angeblichen Codes der
-- Kostenträger. Die tatsächlichen Codes stehen in den Technischen Anlagen und
-- den Fehlerverzeichnissen der jeweiligen Datenannahmestelle; erfundene Codes
-- würden echte Rückmeldungen still falsch einsortieren und damit Ablehnungen
-- als erledigt erscheinen lassen. Der Katalog startet leer, die vier
-- KATEGORIEN stehen als CHECK-Constraint fest — jeder unbekannte Code landet
-- in 'unbekannt' und damit sichtbar auf dem Tisch statt in der Ablage.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. dta_versand_protokoll — jeder Versuch, für alle Kanäle
-- ─────────────────────────────────────────────────────────────────────────────
-- Eine Zeile pro Versuch, unabhängig vom Ausgang. Auch der Fall
-- "extern gesperrt, nichts gesendet" wird protokolliert: er ist der Nachweis,
-- dass zu diesem Zeitpunkt bewusst nichts hinausging.
--
-- Der Kanal ist bewusst breit modelliert (§ 105-SFTP, § 302, KIM), damit
-- § 302 und KIM später keinen zweiten Protokolltyp brauchen — ein einziger
-- Nachweisstrang für alles, was das Haus in Richtung Kostenträger verlässt.

CREATE TABLE IF NOT EXISTS public.dta_versand_protokoll (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT current_org_id()
                  REFERENCES public.organizations(id),

  -- Bezug: mindestens einer dieser Verweise ist gesetzt.
  lauf_id             uuid REFERENCES public.abrechnungslaeufe(id),
  dakota_auftrag_id   uuid REFERENCES public.dta_dakota_auftraege(id),
  -- Freier Verweis für Kanäle ohne eigene Auftragstabelle (§ 302, KIM).
  externe_referenz    text,

  kanal           text NOT NULL
                  CHECK (kanal IN ('sftp_105', 'sftp_302', 'kim', 'manuell')),

  -- Welcher Schritt der Pipeline wurde protokolliert.
  phase           text NOT NULL
                  CHECK (phase IN (
                    'vorbereitung',      -- Dateien geladen, Konfiguration geprüft
                    'verschluesselung',  -- SECON
                    'gate',              -- externe Freigabe geprüft
                    'uebertragung',      -- SFTP/KIM
                    'quittung',          -- Rückmeldung des Transports
                    'antwortabruf'       -- Abruf des Antwortverzeichnisses
                  )),

  ergebnis        text NOT NULL
                  CHECK (ergebnis IN (
                    'erfolg',
                    'testmodus',         -- erzeugt, absichtlich nicht gesendet
                    'gestoppt_extern',   -- Feature-Gate zu (ITSG/§302/KIM)
                    'gestoppt_intern',   -- Readiness/Konfiguration unvollständig
                    'fehler'
                  )),

  -- Menschenlesbares Protokoll des Versuchs. Enthält NIE Zugangsdaten:
  -- die Transportschicht protokolliert Host/User/Pfad, niemals Key/Passwort.
  protokoll       text,
  fehler_code     text,
  fehler_meldung  text,

  -- Nachweis über den Dateiinhalt zum Zeitpunkt des Versuchs. Erlaubt später
  -- die Frage "war das dieselbe Datei?" ohne die Datei selbst zu behalten.
  datei_name      text,
  datei_hash      text,
  datei_groesse_bytes integer,
  verschluesselt  boolean NOT NULL DEFAULT false,

  -- Zielsystem, soweit bekannt. Host bewusst ohne Port/Pfad-Details.
  empfaenger_ik   text,
  ziel_host       text,

  -- Zustand der externen Freigaben zum Zeitpunkt des Versuchs. Beantwortet
  -- rückblickend "war der Kanal damals offen?" — ohne die Env-Historie.
  freigabe_status jsonb NOT NULL DEFAULT '{}',

  dauer_ms        integer,

  ausgeloest_von  uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dta_versand_protokoll_org
  ON public.dta_versand_protokoll(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dta_versand_protokoll_lauf
  ON public.dta_versand_protokoll(lauf_id);
CREATE INDEX IF NOT EXISTS idx_dta_versand_protokoll_auftrag
  ON public.dta_versand_protokoll(dakota_auftrag_id);
CREATE INDEX IF NOT EXISTS idx_dta_versand_protokoll_ergebnis
  ON public.dta_versand_protokoll(organization_id, ergebnis);

COMMENT ON TABLE public.dta_versand_protokoll IS
  'Nachweis jedes Versandversuchs an eine Datenannahmestelle — auch der '
  'abgebrochenen. Wird nie aktualisiert oder gelöscht, nur angefügt.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. dta_fehlercode_katalog — Codes der Kassen → interne Kategorie
-- ─────────────────────────────────────────────────────────────────────────────
-- Startet LEER. Jeder Eintrag muss eine Quelle nennen (welches Dokument,
-- welcher Stand) — dieselbe Regel wie bei den Tarifen: was nicht belegt ist,
-- wird nicht verwendet.

CREATE TABLE IF NOT EXISTS public.dta_fehlercode_katalog (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id),

  -- Der Code, wie ihn die Kasse/Annahmestelle meldet.
  kassen_code     text NOT NULL,
  -- Von wem der Code stammt (IK der Annahmestelle/Kasse), NULL = allgemein.
  quelle_ik       text,

  kategorie       text NOT NULL
                  CHECK (kategorie IN (
                    'verarbeitungsfehler',   -- Transport/Technik: Datei unlesbar, Format
                    'datenfehler',           -- Inhalt: Feld fehlt/unplausibel
                    'tarifabweichung',       -- Betrag/Position weicht vom Vertrag ab
                    'versicherter_unbekannt',-- Versichertennummer/Zuordnung
                    'unbekannt'              -- nicht im Katalog — muss ein Mensch ansehen
                  )),

  beschreibung    text NOT NULL,
  -- Kann die Position nach Korrektur erneut eingereicht werden?
  korrigierbar    boolean NOT NULL DEFAULT true,
  -- Handlungsanweisung für die Sachbearbeitung.
  massnahme       text,

  -- Pflichtbeleg: ohne Quelle kein Katalogeintrag.
  spec_quelle     text NOT NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- Ein Code darf pro Quelle und Organisation nur einmal existieren, sonst
-- entscheidet die Sortierreihenfolge, welche Kategorie gilt.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dta_fehlercode_katalog
  ON public.dta_fehlercode_katalog(
    COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kassen_code,
    COALESCE(quelle_ik, '')
  )
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.dta_fehlercode_katalog IS
  'Übersetzung der Fehlercodes der Kostenträger in vier interne Kategorien. '
  'Bewusst leer ausgeliefert — Einträge nur mit Beleg (spec_quelle).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. dta_wiedervorlage — Reprocessing-Queue
-- ─────────────────────────────────────────────────────────────────────────────
-- Arbeitsvorrat aus abgelehnten/gekürzten Positionen. Eine Zeile pro Position,
-- die korrigiert und erneut eingereicht werden soll.
--
-- Warum eigene Tabelle und nicht ein Status auf dta_ruecklaeufer_positionen:
-- die Position gehört zur Rückmeldung der Kasse und wird nicht verändert (sie
-- ist Beleg). Die Wiedervorlage ist der eigene Vorgang daneben, mit eigenem
-- Bearbeiter, eigener Historie und eigenem Ergebnis.

CREATE TABLE IF NOT EXISTS public.dta_wiedervorlage (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT current_org_id()
                  REFERENCES public.organizations(id),

  ruecklaeufer_id           uuid NOT NULL REFERENCES public.dta_ruecklaeufer(id),
  ruecklaeufer_position_id  uuid REFERENCES public.dta_ruecklaeufer_positionen(id),
  original_lauf_id          uuid REFERENCES public.abrechnungslaeufe(id),
  invoice_id                uuid REFERENCES public.invoices(id),
  client_id                 uuid,

  kategorie       text NOT NULL
                  CHECK (kategorie IN (
                    'verarbeitungsfehler', 'datenfehler',
                    'tarifabweichung', 'versicherter_unbekannt', 'unbekannt'
                  )),
  fehler_code     text,
  fehler_text     text,

  status          text NOT NULL DEFAULT 'offen'
                  CHECK (status IN (
                    'offen',            -- muss angesehen werden
                    'in_korrektur',     -- jemand arbeitet daran
                    'korrigiert',       -- Korrektur eingetragen, wartet auf Einreichung
                    'eingereicht',      -- in einem Korrekturlauf enthalten
                    'erledigt',         -- von der Kasse angenommen
                    'verworfen'         -- bewusst nicht weiterverfolgt (mit Begründung)
                  )),

  betrag_angefordert_cent integer,
  betrag_anerkannt_cent   integer,
  -- Differenz, um die es geht. Generiert, damit sie nicht auseinanderläuft.
  betrag_offen_cent integer GENERATED ALWAYS AS (
    COALESCE(betrag_angefordert_cent, 0) - COALESCE(betrag_anerkannt_cent, 0)
  ) STORED,

  -- Was die Sachbearbeitung geändert hat (Freitext + strukturierte Notiz).
  korrektur_notiz     text,
  korrektur_daten     jsonb NOT NULL DEFAULT '{}',
  verworfen_grund     text,

  -- Ergebnis der Wiedereinreichung.
  korrektur_lauf_id   uuid REFERENCES public.abrechnungslaeufe(id),
  eingereicht_am      timestamptz,

  -- Frist: Kassen weisen verspätete Korrekturen zurück.
  faellig_am      date,

  bearbeitet_von  uuid REFERENCES auth.users(id),
  bearbeitet_am   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- 'verworfen' ohne Begründung wäre ein stilles Fallenlassen einer Forderung.
  CONSTRAINT dta_wiedervorlage_verworfen_braucht_grund
    CHECK (status <> 'verworfen' OR verworfen_grund IS NOT NULL)
);

-- Dieselbe Position darf nicht zweimal in der Queue landen — sonst wird
-- derselbe Betrag doppelt nachgefordert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dta_wiedervorlage_position
  ON public.dta_wiedervorlage(ruecklaeufer_position_id)
  WHERE ruecklaeufer_position_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dta_wiedervorlage_org_status
  ON public.dta_wiedervorlage(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_dta_wiedervorlage_ruecklaeufer
  ON public.dta_wiedervorlage(ruecklaeufer_id);
CREATE INDEX IF NOT EXISTS idx_dta_wiedervorlage_faellig
  ON public.dta_wiedervorlage(organization_id, faellig_am)
  WHERE status IN ('offen', 'in_korrektur', 'korrigiert');

COMMENT ON TABLE public.dta_wiedervorlage IS
  'Reprocessing-Queue: abgelehnte/gekürzte Positionen, die korrigiert und '
  'erneut eingereicht werden. Eine Zeile je Position, Dublettenschutz per '
  'Unique-Index auf ruecklaeufer_position_id.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. updated_at-Trigger
-- ─────────────────────────────────────────────────────────────────────────────
-- search_path explizit gesetzt: SECURITY DEFINER ohne festen search_path war
-- bereits Gegenstand eines Audit-Befunds in diesem Projekt.

CREATE OR REPLACE FUNCTION public.set_updated_at_dta_versand()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dta_fehlercode_katalog_updated ON public.dta_fehlercode_katalog;
CREATE TRIGGER trg_dta_fehlercode_katalog_updated
  BEFORE UPDATE ON public.dta_fehlercode_katalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_dta_versand();

DROP TRIGGER IF EXISTS trg_dta_wiedervorlage_updated ON public.dta_wiedervorlage;
CREATE TRIGGER trg_dta_wiedervorlage_updated
  BEFORE UPDATE ON public.dta_wiedervorlage
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_dta_versand();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS — org_fence RESTRICTIVE + Admin-CRUD, anon ausgesperrt
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.dta_versand_protokoll   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dta_fehlercode_katalog  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dta_wiedervorlage       ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dta_versand_protokoll' AND policyname = 'org_fence_dta_versand_protokoll') THEN
    CREATE POLICY org_fence_dta_versand_protokoll ON public.dta_versand_protokoll AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  -- Der Katalog kennt bewusst auch organisationsübergreifende Zeilen
  -- (organization_id IS NULL): ein Fehlercode der DAVASO bedeutet für jeden
  -- Mandanten dasselbe. Der Fence lässt diese Zeilen lesend durch.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dta_fehlercode_katalog' AND policyname = 'org_fence_dta_fehlercode_katalog') THEN
    CREATE POLICY org_fence_dta_fehlercode_katalog ON public.dta_fehlercode_katalog AS RESTRICTIVE FOR ALL
      USING (organization_id IS NULL OR organization_id = current_org_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dta_wiedervorlage' AND policyname = 'org_fence_dta_wiedervorlage') THEN
    CREATE POLICY org_fence_dta_wiedervorlage ON public.dta_wiedervorlage AS RESTRICTIVE FOR ALL
      USING (organization_id = current_org_id());
  END IF;

  -- Reine Admin-Bereiche: Versandnachweis, Fehlerkatalog und Wiedervorlage
  -- gehören zur Abrechnung, nicht zur operativen Pflege.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dta_versand_protokoll' AND policyname = 'admin_dta_versand_protokoll_all') THEN
    CREATE POLICY admin_dta_versand_protokoll_all ON public.dta_versand_protokoll FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dta_fehlercode_katalog' AND policyname = 'admin_dta_fehlercode_katalog_all') THEN
    CREATE POLICY admin_dta_fehlercode_katalog_all ON public.dta_fehlercode_katalog FOR ALL
      USING (is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dta_wiedervorlage' AND policyname = 'admin_dta_wiedervorlage_all') THEN
    CREATE POLICY admin_dta_wiedervorlage_all ON public.dta_wiedervorlage FOR ALL
      USING (is_admin());
  END IF;
END $$;

REVOKE ALL ON public.dta_versand_protokoll  FROM anon;
REVOKE ALL ON public.dta_fehlercode_katalog FROM anon;
REVOKE ALL ON public.dta_wiedervorlage      FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Audit-Entity-Typen erweitern
-- ─────────────────────────────────────────────────────────────────────────────
-- Muss deckungsgleich mit AUDIT_ENTITY_TYPES in lib/billing/core/audit.ts
-- bleiben — __tests__/abrechnung/schema-konsistenz.test.ts prüft das.
-- Ohne diesen Schritt scheitert jeder logBillingAction-Aufruf der neuen
-- Module mit 23514 (Check-Constraint) — und zwar erst zur Laufzeit.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_audit_trail_entity_type_check'
      AND pg_get_constraintdef(oid) LIKE '%dta_wiedervorlage%'
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
          -- Stream 2 — Versandpipeline (Migration 20260902010000)
          'dta_versand', 'dta_wiedervorlage', 'dta_fehlercode'
        ])
      );
  END IF;
END $$;

COMMIT;
