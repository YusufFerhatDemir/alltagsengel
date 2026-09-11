-- ═══════════════════════════════════════════════════════════════════════
-- Bearbeitungsstand der Content-Stücke  (Block 5)
-- ═══════════════════════════════════════════════════════════════════════
--
-- WOZU
-- Die Marketing-Seite (/admin/marketing-content) zeigt die fertigen
-- Beitraege aus docs/marketing/. Was dort fehlte, ist die Antwort auf
-- „ist das schon raus?". Ohne sie postet jemand denselben Beitrag zweimal
-- oder laesst ihn liegen, weil er meint, ein anderer habe ihn genommen.
--
-- ── WARUM EINE TABELLE UND NICHT DER BROWSER ──────────────────────────
-- Ein Stand, den nur der eigene Browser kennt, sieht wie eine geteilte
-- Wahrheit aus, ist aber keine: zwei Personen sehen dann verschiedene
-- Listen und halten beide ihre fuer richtig. Genau dieser Irrtum ist
-- schaedlicher als eine fehlende Anzeige.
--
-- ── WAS HIER NICHT STEHT: DER INHALT ──────────────────────────────────
-- Text, Hashtags, CTA und Briefing bleiben im Markdown unter
-- docs/marketing/ — das ist die EINE Quelle, von Menschen gepflegt. Diese
-- Tabelle haelt ausschliesslich den Bearbeitungsstand. Sie zu fuellen
-- heisst nicht, den Plan zu duplizieren.
--
-- Deshalb auch KEIN Fremdschluessel: content_id zeigt auf eine Stelle in
-- einer Datei (`DATEI.md#Post-01`), nicht auf eine Zeile. Verschwindet ein
-- Abschnitt aus dem Plan, bleibt hier eine Waise stehen. Das ist
-- hingenommen — die Alternative waere, den Plan in die Datenbank zu
-- spiegeln und zwei Quellen zu pflegen.
--
-- ── RECHTE ────────────────────────────────────────────────────────────
-- Kein anon-Recht. Gelesen und geschrieben nur von der Verwaltung ueber
-- is_admin() — dieselbe Grenze wie bei email_entwuerfe und lead_inquiries.
-- Es sind unveroeffentlichte Werbetexte und die Information, was davon
-- noch kommt.
--
-- Rollback: 20261103000001_rollback_marketing_content_status.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.marketing_content_status (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL DEFAULT public.current_org_id(),

  -- Stelle im Plan: `CONTENTPLAN_30_TAGE_09_10_2026_V2.md#Post-01`.
  -- Aufgebaut in lib/marketing/contentplan.ts als `quelle#art-nummer`.
  content_id        text NOT NULL,

  status            text NOT NULL DEFAULT 'offen',

  -- Wo es veroeffentlicht wurde. Freitext, weil die Plattformen im Plan
  -- stehen und sich dort aendern ('Instagram Feed + Facebook').
  kanal             text,
  veroeffentlicht_am timestamptz,

  -- Platz fuer das, was die Anzeige nicht weiss: „Bild fehlt noch",
  -- „auf Oktober geschoben".
  notiz             text,

  geaendert_von     uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'marketing_content_status_status_check') THEN
    ALTER TABLE public.marketing_content_status
      ADD CONSTRAINT marketing_content_status_status_check
      CHECK (status IN ('offen', 'geplant', 'veroeffentlicht', 'verworfen'));
  END IF;

  -- „Veroeffentlicht" ohne Zeitpunkt ist eine Behauptung ohne Beleg.
  -- Dieselbe Regel wie beim Mailversand: ein Endzustand braucht seinen
  -- Nachweis in derselben Zeile, sonst ist spaeter nicht unterscheidbar,
  -- ob etwas raus ist oder nur so markiert wurde.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'marketing_content_status_beleg_check') THEN
    ALTER TABLE public.marketing_content_status
      ADD CONSTRAINT marketing_content_status_beleg_check
      CHECK (status <> 'veroeffentlicht' OR veroeffentlicht_am IS NOT NULL);
  END IF;
END;
$$;

-- Ein Stand je Stueck und Mandant. Ohne diesen Index entstehen bei zwei
-- gleichzeitigen Klicks zwei Zeilen, und die Anzeige zeigt zufaellig eine.
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketing_content_status
  ON public.marketing_content_status (organization_id, content_id);

CREATE OR REPLACE FUNCTION public.tg_marketing_content_status_updated_at()
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

DROP TRIGGER IF EXISTS trg_marketing_content_status_updated_at
  ON public.marketing_content_status;
CREATE TRIGGER trg_marketing_content_status_updated_at
  BEFORE UPDATE ON public.marketing_content_status
  FOR EACH ROW EXECUTE FUNCTION public.tg_marketing_content_status_updated_at();

ALTER TABLE public.marketing_content_status ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.marketing_content_status FROM PUBLIC;
REVOKE ALL ON public.marketing_content_status FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_content_status TO authenticated;

DROP POLICY IF EXISTS "Admin full access marketing_content_status"
  ON public.marketing_content_status;
CREATE POLICY "Admin full access marketing_content_status"
  ON public.marketing_content_status FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.marketing_content_status IS
  'Bearbeitungsstand der Content-Stuecke aus docs/marketing/. Haelt NUR den '
  'Stand — Text, Hashtags und Briefing bleiben im Markdown, das die eine '
  'Quelle ist.';

COMMENT ON COLUMN public.marketing_content_status.content_id IS
  'Stelle im Plan (`DATEI.md#Art-Nummer`), gebildet in '
  'lib/marketing/contentplan.ts. Kein Fremdschluessel: zeigt auf einen '
  'Abschnitt in einer Datei, nicht auf eine Zeile.';

COMMIT;
