-- ═══════════════════════════════════════════════════════════════
-- Stream 2 — Kassenabrechnung betriebsreif: Betriebsmodus,
--            Zugangsmittel-Rotation, Dead-Letter-Queue
--
-- Die Versandpipeline (20260902010000) beantwortet "was ist beim Versuch
-- passiert". Diese Migration beantwortet die drei Fragen davor und danach:
--
--   1. abrechnung_betriebsmodus  — Sendet dieser Kanal gerade Testdateien
--                                  (Dateiindikator '0') oder Echtdateien ('2')?
--                                  Bisher stand '2' hartkodiert im Export —
--                                  jede erzeugte Datei behauptete Echtabrechnung,
--                                  auch die allererste, vor jeder Testübertragung.
--   2. abrechnung_credential_rotationen
--                                — Wann wurde welches Zugangsmittel ausgetauscht?
--                                  METADATEN, niemals Geheimnisse: der Schlüssel
--                                  selbst liegt im privaten Bucket oder in einer
--                                  Env-Variable, hier steht nur, DASS und WANN.
--   3. dta_dead_letter           — Was nach den Wiederholversuchen nicht
--                                  zustellbar war. Ohne diese Tabelle endet ein
--                                  endgültig gescheiterter Versand als
--                                  Auftragsstatus 'technischer_fehler' und fällt
--                                  aus dem Blick — eine nicht gestellte Forderung,
--                                  die niemandem auffällt.
--
-- WAS DIESE MIGRATION ABSICHTLICH NICHT TUT
-- Sie legt KEINE Zeile in abrechnung_betriebsmodus an. Kein Datensatz bedeutet
-- Testbetrieb — der Umschalter muss bewusst und begründet umgelegt werden, und
-- eine per Migration vorbelegte Zeile wäre genau die Vorbelegung, die niemand
-- geprüft hat. Sie speichert auch keine Zugangsdaten: die CHECK-Constraints auf
-- abrechnung_credential_rotationen weisen Schlüsselmaterial aktiv ab.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. abrechnung_betriebsmodus — Test ('0') oder Produktion ('2') je Kanal
-- ─────────────────────────────────────────────────────────────────────────────
-- Eine Zeile je (Organisation, Kanal). Fehlt die Zeile, gilt Testbetrieb —
-- die Anwendung liest den Modus fail-closed, nicht die Datenbank.
--
-- WARUM DAS HIER EINE DB-ZEILE IST UND KEINE ENV-VARIABLE
-- Die drei Env-Gates (ITSG_ZERTIFIZIERT, SGB_V_302_FREIGABE, KIM_AKTIV)
-- behaupten, dass ein externer Dritter etwas erteilt hat — das kann kein
-- Admin-Klick wahr machen. Der Betriebsmodus behauptet nichts über Dritte: er
-- ist die hauseigene Entscheidung "ab jetzt echt", getroffen NACH bestandener
-- Testübertragung. Diese Entscheidung braucht einen Bearbeiter, einen
-- Zeitpunkt, eine Begründung und einen Verlauf — alles Dinge, die eine
-- Env-Variable nicht hat. Das Gate bleibt trotzdem die stärkere Sperre: ein
-- Kanal in 'produktion' bei geschlossenem Gate sendet weiterhin nichts.

CREATE TABLE IF NOT EXISTS public.abrechnung_betriebsmodus (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT current_org_id()
                  REFERENCES public.organizations(id),

  kanal           text NOT NULL
                  CHECK (kanal IN ('sftp_105', 'sftp_302', 'kim')),

  modus           text NOT NULL DEFAULT 'test'
                  CHECK (modus IN ('test', 'produktion')),

  -- Nachweis der Testübertragung, ohne den 'produktion' nicht gesetzt werden
  -- darf. Die Anwendung erzwingt beides; hier stehen sie als Beleg.
  testuebertragung_am        date,
  -- Was die Annahmestelle bestätigt hat: Ticket, Mail, Protokollnummer.
  -- Freitext, weil jede Annahmestelle es anders benennt.
  testuebertragung_referenz  text,
  testuebertragung_stelle    text,

  begruendung     text,

  umgestellt_am   timestamptz NOT NULL DEFAULT now(),
  umgestellt_von  uuid REFERENCES auth.users(id),

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Produktion ohne Nachweis wäre der Zustand, den diese Tabelle verhindern
  -- soll: eine Echtdatei, die nie gegen die Annahmestelle geprüft wurde.
  CONSTRAINT abrechnung_betriebsmodus_produktion_braucht_nachweis
    CHECK (
      modus <> 'produktion'
      OR (testuebertragung_am IS NOT NULL
          AND testuebertragung_referenz IS NOT NULL
          AND length(btrim(testuebertragung_referenz)) > 0)
    ),
  CONSTRAINT abrechnung_betriebsmodus_braucht_begruendung
    CHECK (begruendung IS NULL OR length(btrim(begruendung)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_abrechnung_betriebsmodus
  ON public.abrechnung_betriebsmodus(organization_id, kanal);

COMMENT ON TABLE public.abrechnung_betriebsmodus IS
  'Test- oder Produktionsbetrieb je Übertragungskanal. Fehlende Zeile = Test. '
  'Produktion nur mit belegter Testübertragung (CHECK-Constraint).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. abrechnung_betriebsmodus_historie — jeder Wechsel, unveränderlich
-- ─────────────────────────────────────────────────────────────────────────────
-- Die Frage "wer hat wann auf Echtbetrieb gestellt" muss auch dann noch
-- beantwortbar sein, wenn längst wieder zurückgeschaltet wurde. Deshalb eine
-- eigene, nur anfügende Tabelle statt einer Spalte mit dem letzten Wert.

CREATE TABLE IF NOT EXISTS public.abrechnung_betriebsmodus_historie (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT current_org_id()
                  REFERENCES public.organizations(id),

  kanal           text NOT NULL
                  CHECK (kanal IN ('sftp_105', 'sftp_302', 'kim')),
  modus_vorher    text CHECK (modus_vorher IN ('test', 'produktion')),
  modus_nachher   text NOT NULL CHECK (modus_nachher IN ('test', 'produktion')),

  begruendung     text NOT NULL,
  testuebertragung_am        date,
  testuebertragung_referenz  text,

  -- Zustand der Env-Gates im Moment des Umschaltens. Beantwortet später
  -- "war der Kanal damals überhaupt offen?", ohne die Env-Historie zu haben.
  freigabe_status jsonb NOT NULL DEFAULT '{}',

  umgestellt_von  uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abrechnung_betriebsmodus_historie_org
  ON public.abrechnung_betriebsmodus_historie(organization_id, kanal, created_at DESC);

COMMENT ON TABLE public.abrechnung_betriebsmodus_historie IS
  'Unveränderlicher Verlauf aller Wechsel zwischen Test- und Produktionsbetrieb.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. abrechnung_credential_rotationen — Austauschprotokoll, OHNE Geheimnisse
-- ─────────────────────────────────────────────────────────────────────────────
-- Zugangsmittel liegen an genau zwei Orten: im privaten Storage-Bucket
-- (PKCS#12-Zertifikat, SSH-Private-Keys) oder in einer Env-Variable
-- (SECON_ZERT_PASSWORT). In der Datenbank steht ausschliesslich, DASS und WANN
-- etwas ausgetauscht wurde — Fingerprint und Ablaufdatum reichen, um eine
-- Rotation nachzuweisen und eine anstehende zu erkennen.
--
-- Die CHECK-Constraints sind kein Schmuck: sie sind die letzte Sperre, wenn ein
-- künftiger Aufrufer versehentlich den Dateiinhalt statt des Fingerprints
-- übergibt. Sie weisen PEM-Header, PKCS#12-Kopfbytes und überlange Werte ab.

CREATE TABLE IF NOT EXISTS public.abrechnung_credential_rotationen (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT current_org_id()
                  REFERENCES public.organizations(id),

  -- Kennung aus dem Katalog in lib/abrechnung/credentials.ts.
  credential_id   text NOT NULL,
  art             text NOT NULL CHECK (art IN ('bucket', 'env')),

  -- Wofür das Zugangsmittel gebraucht wird — dient nur der Anzeige.
  kanal           text CHECK (kanal IN ('sftp_105', 'sftp_302', 'kim', 'alle')),
  -- Bezug bei mehrfach vorhandenen Zugangsmitteln (z. B. SSH-Key je Stelle).
  bezug_id        uuid,
  bezug_label     text,

  ereignis        text NOT NULL
                  CHECK (ereignis IN (
                    'hinterlegt',   -- erstmals abgelegt
                    'rotiert',      -- ersetzt, Vorgänger bleibt bis Ablauf gültig
                    'entfernt',     -- zurückgezogen
                    'geprueft'      -- Lesbarkeit/Gültigkeit kontrolliert
                  )),

  -- Kurzer Hashwert zur Wiedererkennung, KEIN Schlüsselmaterial.
  fingerprint_neu text,
  fingerprint_alt text,
  gueltig_bis     date,

  -- Wo es liegt — Pfad bzw. Name der Env-Variable, nie der Wert.
  ablage_ort      text,

  notiz           text,

  ausgefuehrt_von uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Kein Schlüsselmaterial in diesen Spalten. Bewusst über alle Freitextfelder,
  -- nicht nur über die Fingerprint-Spalten: der wahrscheinliche Fehlgriff ist
  -- ein Dateiinhalt in `notiz`.
  CONSTRAINT abrechnung_credential_rotationen_kein_schluesselmaterial
    CHECK (
      COALESCE(fingerprint_neu, '') !~ 'PRIVATE KEY'
      AND COALESCE(fingerprint_alt, '') !~ 'PRIVATE KEY'
      AND COALESCE(notiz, '')         !~ 'PRIVATE KEY'
      AND COALESCE(ablage_ort, '')    !~ 'PRIVATE KEY'
      AND COALESCE(notiz, '')         !~ 'BEGIN CERTIFICATE'
    ),
  CONSTRAINT abrechnung_credential_rotationen_laengen
    CHECK (
      length(COALESCE(fingerprint_neu, '')) <= 128
      AND length(COALESCE(fingerprint_alt, '')) <= 128
      AND length(COALESCE(ablage_ort, '')) <= 512
      AND length(COALESCE(notiz, '')) <= 2000
    )
);

CREATE INDEX IF NOT EXISTS idx_abrechnung_credential_rotationen_org
  ON public.abrechnung_credential_rotationen(organization_id, credential_id, created_at DESC);

COMMENT ON TABLE public.abrechnung_credential_rotationen IS
  'Austauschprotokoll für Zertifikate, SSH-Keys und Passwort-Env-Variablen. '
  'Enthält NUR Metadaten (Fingerprint, Ablaufdatum, Ablageort) — niemals '
  'Schlüsselmaterial; CHECK-Constraints weisen es ab.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. dta_dead_letter — was endgültig nicht zustellbar war
-- ─────────────────────────────────────────────────────────────────────────────
-- Eine Zeile entsteht, wenn die Wiederholversuche erschöpft sind ODER wenn ein
-- Fehler auftritt, der nicht automatisch wiederholt werden darf (etwa: die
-- Auftragsdatei war schon halb oben — ein zweiter Versuch könnte bei der
-- Annahmestelle eine zweite Verarbeitung auslösen).
--
-- Der Zweck ist Sichtbarkeit, nicht Automatik: ein Eintrag hier bedeutet
-- "ein Mensch muss entscheiden". Genau deshalb hat 'verworfen' einen
-- Begründungszwang — eine Forderung, die niemand mehr verfolgt, muss jemand
-- ausdrücklich fallengelassen haben.

CREATE TABLE IF NOT EXISTS public.dta_dead_letter (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL DEFAULT current_org_id()
                  REFERENCES public.organizations(id),

  kanal           text NOT NULL
                  CHECK (kanal IN ('sftp_105', 'sftp_302', 'kim', 'manuell')),

  lauf_id             uuid REFERENCES public.abrechnungslaeufe(id),
  dakota_auftrag_id   uuid REFERENCES public.dta_dakota_auftraege(id),
  externe_referenz    text,
  -- Letzte Protokollzeile des gescheiterten Versuchs.
  versand_protokoll_id uuid REFERENCES public.dta_versand_protokoll(id),

  -- Warum es hier gelandet ist. 'nicht_wiederholbar' ist der Fall, in dem ein
  -- automatischer Retry gefährlicher wäre als das Liegenbleiben.
  grund           text NOT NULL
                  CHECK (grund IN (
                    'versuche_erschoepft',
                    'nicht_wiederholbar',
                    'dauerhafter_fehler',
                    'manuell_eingestellt'
                  )),

  fehler_code     text,
  fehler_meldung  text,
  -- Bis wohin der letzte Versuch gekommen ist (verbindung/nutzdaten/…).
  letzte_phase    text,

  versuche        integer NOT NULL DEFAULT 0,
  erster_versuch_am  timestamptz,
  letzter_versuch_am timestamptz,

  datei_name      text,
  datei_hash      text,
  empfaenger_ik   text,

  status          text NOT NULL DEFAULT 'offen'
                  CHECK (status IN (
                    'offen',            -- niemand hat es angesehen
                    'in_analyse',       -- jemand arbeitet daran
                    'wiedervorgelegt',  -- zurück in die Warteschlange gegeben
                    'erledigt',         -- zugestellt oder anderweitig geklärt
                    'verworfen'         -- bewusst aufgegeben (mit Begründung)
                  )),

  notiz             text,
  verworfen_grund   text,
  wiedervorgelegt_am timestamptz,

  bearbeitet_von  uuid REFERENCES auth.users(id),
  bearbeitet_am   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dta_dead_letter_verworfen_braucht_grund
    CHECK (status <> 'verworfen' OR (verworfen_grund IS NOT NULL AND length(btrim(verworfen_grund)) > 0))
);

-- Ein Auftrag darf nur EINEN offenen Dead-Letter-Eintrag haben. Ohne diesen
-- Index legt jeder weitere gescheiterte Versuch eine zweite Zeile an und die
-- Liste zeigt dieselbe Datei mehrfach — mit unterschiedlichen Zählerständen.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dta_dead_letter_offen_je_auftrag
  ON public.dta_dead_letter(dakota_auftrag_id)
  WHERE dakota_auftrag_id IS NOT NULL
    AND status IN ('offen', 'in_analyse');

CREATE INDEX IF NOT EXISTS idx_dta_dead_letter_org_status
  ON public.dta_dead_letter(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dta_dead_letter_kanal
  ON public.dta_dead_letter(organization_id, kanal, status);

COMMENT ON TABLE public.dta_dead_letter IS
  'Endgültig nicht zustellbare Übertragungen — sichtbarer Arbeitsvorrat statt '
  'stillem Fehlschlag. Ein offener Eintrag je Auftrag (Unique-Index).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. updated_at-Trigger
-- ─────────────────────────────────────────────────────────────────────────────
-- search_path explizit: fehlender search_path bei neuen Triggern war bereits
-- Gegenstand eines Audit-Befunds in diesem Projekt.

CREATE OR REPLACE FUNCTION public.set_updated_at_abrechnung_betrieb()
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

DROP TRIGGER IF EXISTS trg_abrechnung_betriebsmodus_updated ON public.abrechnung_betriebsmodus;
CREATE TRIGGER trg_abrechnung_betriebsmodus_updated
  BEFORE UPDATE ON public.abrechnung_betriebsmodus
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_abrechnung_betrieb();

DROP TRIGGER IF EXISTS trg_dta_dead_letter_updated ON public.dta_dead_letter;
CREATE TRIGGER trg_dta_dead_letter_updated
  BEFORE UPDATE ON public.dta_dead_letter
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_abrechnung_betrieb();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RLS — org_fence RESTRICTIVE + Admin-CRUD, anon ausgesperrt
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.abrechnung_betriebsmodus           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abrechnung_betriebsmodus_historie  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abrechnung_credential_rotationen   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dta_dead_letter                    ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'abrechnung_betriebsmodus',
    'abrechnung_betriebsmodus_historie',
    'abrechnung_credential_rotationen',
    'dta_dead_letter'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'org_fence_' || t
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL USING (organization_id = current_org_id())',
        'org_fence_' || t, t
      );
    END IF;

    -- Betriebsmodus, Rotationsprotokoll und Dead-Letter gehören zur
    -- Abrechnung, nicht zur operativen Pflege: nur Admins.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'admin_' || t || '_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (is_admin())',
        'admin_' || t || '_all', t
      );
    END IF;

    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Audit-Entity-Typen erweitern
-- ─────────────────────────────────────────────────────────────────────────────
-- Muss deckungsgleich mit AUDIT_ENTITY_TYPES in lib/billing/core/audit.ts
-- bleiben — __tests__/abrechnung/schema-konsistenz.test.ts prüft das.
-- Ohne diesen Schritt scheitert jeder logBillingAction-Aufruf der neuen
-- Module mit 23514 (Check-Constraint), und zwar erst zur Laufzeit.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'billing_audit_trail_entity_type_check'
      AND pg_get_constraintdef(oid) LIKE '%dta_dead_letter%'
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
          -- Stream 2 — Betriebsreife (Migration 20260903010000)
          'abrechnung_betriebsmodus', 'abrechnung_credential', 'dta_dead_letter'
        ])
      );
  END IF;
END $$;

COMMIT;
