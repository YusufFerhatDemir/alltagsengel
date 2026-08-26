-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE 8 — EINMAL-FREIGABE FUER DEN ERSTEN ECHTEN RECHNUNGSVERSAND
--
-- WAS DIESE MIGRATION LOEST
-- Der erste echte Rechnungsversand ist der einzige Vorgang im System, den
-- man nicht zurueckholen kann: die Mail ist beim Kunden, sobald Resend sie
-- angenommen hat. `invoice_email_log` steht live auf 0 — es gibt also keinen
-- Bestandsbetrieb, an dem sich zeigen wuerde, ob der Weg stimmt.
--
-- Bisher haengt der Versand an drei Dingen: dem 16-Punkte-Preflight, dem
-- Status der Rechnung und (beim Automaten) an RECHNUNGSVERSAND_AUTOMATISCH.
-- Was fehlte, ist eine Freigabe, die sich auf GENAU DIESE EINE Rechnung
-- bezieht und die sich nicht wiederholen laesst.
--
-- ── DAS TOKEN ──────────────────────────────────────────────────────────────
-- Eine Zeile in `pilot_send_gate` IST das Token; ihre `id` ist der Wert, den
-- der Aufrufer mitbringen muss. Die Zeile traegt zusaetzlich Rechnung,
-- Mandant, Empfaenger und Betrag — der Versandweg prueft jedes dieser Felder
-- gegen das, was er tatsaechlich zu senden im Begriff ist. Ein Token, das
-- fuer Rechnung A ausgestellt wurde, kann Rechnung B nicht versenden, auch
-- wenn es gueltig ist.
--
-- ── DIE ZWEI TEILINDIZES SIND DER EIGENTLICHE RIEGEL ────────────────────────
-- Anwendungscode kann man umgehen, vergessen oder parallel ausfuehren. Die
-- beiden UNIQUE-Teilindizes unten koennen das nicht:
--
--   `pilot_send_gate_offen_je_rechnung`  — hoechstens EIN offenes Token je
--       Rechnung. Zwei Freigaben nebeneinander waeren zwei Erlaubnisse fuer
--       denselben Vorgang.
--   `pilot_send_gate_einmal_verbraucht`  — hoechstens EIN verbrauchtes Token
--       je Rechnung. Das ist die Doppelversand-Sperre auf Datenbankebene:
--       ein zweiter erfolgreicher Versand derselben Rechnung kann nicht
--       protokolliert werden, also findet er nicht statt.
--
-- Der CHECK auf `preflight_status` gehoert in dieselbe Reihe: ein Token fuer
-- eine Rechnung, die den Preflight nicht bestanden hat, laesst sich gar nicht
-- erst anlegen. Die Regel steht damit nicht nur in TypeScript.
--
-- ── DIE SPERRE ─────────────────────────────────────────────────────────────
-- `pilot_versand_sperre` ist das Gegenstueck: findet die Nachpruefung nach
-- einem Versand irgendeine Abweichung (kein Protokolleintrag, zwei
-- Protokolleintraege, falscher Empfaenger, fehlender Audit-Eintrag), wird
-- hier eine Zeile gesetzt und der naechste Versand faellt aus. Fail-closed:
-- ist die Tabelle nicht lesbar, gilt das als gesperrt — nicht als frei.
--
-- Rollback: 20261005000001_rollback_pilot_send_gate.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Einmal-Freigabe ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pilot_send_gate (
  -- Die id IST das Token. Kein zweites Geheimnis-Feld: ein zufaelliges
  -- UUIDv4 aus gen_random_uuid() ist genau so unraetbar wie ein separater
  -- Schluessel, und zwei Felder waeren zwei Gelegenheiten, das falsche zu
  -- vergleichen.
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  invoice_id        uuid NOT NULL REFERENCES public.invoices(id),

  -- Wogegen der Versandweg abgleicht. Weicht auch nur eines ab, gilt das
  -- Token fuer diesen Vorgang nicht.
  empfaenger        text NOT NULL,
  betrag_cents      bigint NOT NULL CHECK (betrag_cents > 0),

  -- Nur READY_FOR_SEND. NEEDS_REVIEW darf ein Mensch im normalen Versandweg
  -- verantworten — fuer den ERSTEN echten Versand ist das zu wenig.
  preflight_status  text NOT NULL CHECK (preflight_status = 'READY_FOR_SEND'),

  erstellt_von      uuid NOT NULL,
  erstellt_am       timestamptz NOT NULL DEFAULT now(),
  gueltig_bis       timestamptz NOT NULL,

  verbraucht_am     timestamptz,
  verbraucht_von    uuid,

  entwertet_am      timestamptz,
  entwertungsgrund  text,

  -- Ein Token ist entweder verbraucht oder entwertet, nie beides: sonst
  -- laesst sich nachtraeglich nicht mehr sagen, ob die Mail rausging.
  CONSTRAINT pilot_send_gate_nicht_beides
    CHECK (verbraucht_am IS NULL OR entwertet_am IS NULL),

  -- Eine Gueltigkeit, die vor der Ausstellung endet, ist ein Tippfehler.
  CONSTRAINT pilot_send_gate_gueltigkeit
    CHECK (gueltig_bis > erstellt_am)
);

-- Hoechstens EIN offenes Token je Rechnung.
CREATE UNIQUE INDEX IF NOT EXISTS pilot_send_gate_offen_je_rechnung
  ON public.pilot_send_gate (invoice_id)
  WHERE verbraucht_am IS NULL AND entwertet_am IS NULL;

-- Hoechstens EIN verbrauchtes Token je Rechnung — die Doppelversand-Sperre.
CREATE UNIQUE INDEX IF NOT EXISTS pilot_send_gate_einmal_verbraucht
  ON public.pilot_send_gate (invoice_id)
  WHERE verbraucht_am IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pilot_send_gate_org
  ON public.pilot_send_gate (organization_id);

ALTER TABLE public.pilot_send_gate ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pilot_send_gate' AND policyname = 'pilot_send_gate_admin'
  ) THEN
    CREATE POLICY pilot_send_gate_admin ON public.pilot_send_gate
      FOR ALL USING (public.is_admin());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pilot_send_gate' AND policyname = 'org_fence_pilot_send_gate'
  ) THEN
    CREATE POLICY org_fence_pilot_send_gate
      ON public.pilot_send_gate
      AS RESTRICTIVE
      FOR ALL
      USING (organization_id = current_org_id());
  END IF;
END;
$$;

-- ── 2) Versandsperre nach abweichender Nachpruefung ─────────────────────────
CREATE TABLE IF NOT EXISTS public.pilot_versand_sperre (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id),
  -- NULL = mandantenweite Sperre (z. B. fremder Mandant betroffen).
  invoice_id        uuid REFERENCES public.invoices(id),
  schwere           text NOT NULL CHECK (schwere IN ('P0', 'P1')),
  grund             text NOT NULL,
  -- Die Einzelbefunde der Nachpruefung, damit die Sperre begruendbar bleibt.
  befunde           jsonb NOT NULL DEFAULT '[]'::jsonb,
  gesetzt_am        timestamptz NOT NULL DEFAULT now(),
  gesetzt_von       uuid,
  aufgehoben_am     timestamptz,
  aufgehoben_von    uuid,
  aufhebungsgrund   text,

  -- Aufheben ohne Begruendung waere ein stiller Freischalter.
  CONSTRAINT pilot_versand_sperre_aufhebung
    CHECK (aufgehoben_am IS NULL OR aufhebungsgrund IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_pilot_versand_sperre_offen
  ON public.pilot_versand_sperre (organization_id)
  WHERE aufgehoben_am IS NULL;

ALTER TABLE public.pilot_versand_sperre ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pilot_versand_sperre' AND policyname = 'pilot_versand_sperre_admin'
  ) THEN
    CREATE POLICY pilot_versand_sperre_admin ON public.pilot_versand_sperre
      FOR ALL USING (public.is_admin());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pilot_versand_sperre' AND policyname = 'org_fence_pilot_versand_sperre'
  ) THEN
    CREATE POLICY org_fence_pilot_versand_sperre
      ON public.pilot_versand_sperre
      AS RESTRICTIVE
      FOR ALL
      USING (organization_id = current_org_id());
  END IF;
END;
$$;

COMMIT;
