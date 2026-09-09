-- ═══════════════════════════════════════════════════════════════════════
-- Kunden-Warteliste  (Phase 1)
-- ═══════════════════════════════════════════════════════════════════════
--
-- WOZU
-- Solange die Anerkennung nach § 45a SGB XI aussteht, darf gegenueber
-- Interessenten keine Abrechnung ueber den Entlastungsbetrag zugesagt
-- werden. Was geht, ist eine Vormerkung: wer sich jetzt eintraegt, wird
-- benachrichtigt, sobald der Bescheid da ist. Diese Tabelle traegt genau
-- diese Vormerkungen.
--
-- WARUM NICHT `lead_inquiries`
-- Die CRM-Tabelle fuehrt bereits zwei Vorgaenge (`art` = anfrage |
-- bewerbung) und hat einen CHECK darauf. Ein dritter Wert waere moeglich,
-- aber die Warteliste braucht eigene Felder (Pflegegrad, gewuenschte
-- Leistungen als Mehrfachauswahl, drei UTM-Spalten) und einen eigenen
-- Statuslauf. Die haetten in `lead_inquiries` bei jeder Anfrage und jeder
-- Bewerbung als NULL mitgeschleppt werden muessen.
--
-- ── ZU DEN RECHTEN: KEINE anon-INSERT-POLICY ──────────────────────────
-- Der Auftrag nannte „insert fuer anon". Das wird hier BEWUSST NICHT
-- gemacht, und der Grund steht im Repository selbst: Migration
-- 20260828180000 hat die Policy „Anyone can submit lead inquiry"
-- entfernt — es war die einzige offene INSERT-Tuer des gesamten Schemas.
-- Eine neue aufzumachen wuerde diese Entscheidung stillschweigend
-- zurueckdrehen.
--
-- Funktional wird sie auch nicht gebraucht: das Formular schreibt ueber
-- POST /api/waitlist mit dem Dienstschluessel, genau wie
-- /api/lead-inquiry es seit dem 28.08.2026 tut. Dort sitzen Rate-Limit,
-- Honeypot und Laengenpruefung — an einer offenen Tabellentuer sitzt
-- nichts davon.
--
-- Gelesen und geaendert wird ueber is_admin(); dieselbe Grenze wie bei
-- `lead_inquiries` („Admin full access"). Wer die Seite fuer weitere
-- Rollen oeffnen will, braucht vorher eine rk_-Policy — sonst sieht die
-- Rolle eine leere Liste ohne Fehlermeldung (siehe lint:rls-sicht).
--
-- Rollback: 20261031000001_rollback_waitlist_customers.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.waitlist_customers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Mandantenspalte wie ueberall sonst. Der Default ist der Rueckfall;
  -- die Route setzt ihn trotzdem ausdruecklich, weil current_org_id()
  -- unter dem Dienstschluessel (ohne auth.uid()) fail-open ist.
  organization_id         uuid NOT NULL DEFAULT public.current_org_id(),

  name                    text NOT NULL,
  email                   text,
  phone                   text,
  region                  text,

  -- Freiwillige Angabe. '0' = kein Pflegegrad, 'unbekannt' = weiss nicht.
  -- Beides sind echte Antworten und keine fehlenden Werte, deshalb im
  -- Wortschatz und nicht als NULL.
  pflegegrad              text,

  -- Mehrfachauswahl. Als Array statt als sieben Boolean-Spalten: der
  -- Leistungskatalog aendert sich, die Spaltenliste soll es nicht.
  gewuenschte_leistungen  text[] NOT NULL DEFAULT '{}',

  nachricht               text,

  utm_source              text,
  utm_medium              text,
  utm_campaign            text,

  status                  text NOT NULL DEFAULT 'neu',

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ── Wortschatz an der Datenbank festhalten ────────────────────────────
-- Ohne CHECK erzeugt ein freier Wert eine Zeile, welche die Oberflaeche
-- nicht kennt: der Eintrag ist dann unsichtbar, ohne geloescht zu sein.
-- Dieselbe Ueberlegung wie bei lead_inquiries_status_check.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_customers_status_check') THEN
    ALTER TABLE public.waitlist_customers
      ADD CONSTRAINT waitlist_customers_status_check
      CHECK (status IN ('neu', 'kontaktiert', 'vorgemerkt', 'aktiviert', 'abgemeldet'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_customers_pflegegrad_check') THEN
    ALTER TABLE public.waitlist_customers
      ADD CONSTRAINT waitlist_customers_pflegegrad_check
      CHECK (pflegegrad IS NULL OR pflegegrad IN ('0', '1', '2', '3', '4', '5', 'unbekannt'));
  END IF;

  -- Ein Eintrag ohne Rueckweg ist kein Eintrag: Wer sich vormerken laesst,
  -- muss auch benachrichtigt werden koennen. Genau die Luecke, die bei den
  -- Bewerbungen in lead_inquiries besteht (dort fragt das Formular keine
  -- E-Mail ab, und keine der 34 Zeilen traegt eine).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_customers_rueckweg_check') THEN
    ALTER TABLE public.waitlist_customers
      ADD CONSTRAINT waitlist_customers_rueckweg_check
      CHECK (COALESCE(NULLIF(TRIM(email), ''), NULLIF(TRIM(phone), '')) IS NOT NULL);
  END IF;
END;
$$;

-- ── Doppelte Vormerkungen ─────────────────────────────────────────────
-- Ein Doppelklick auf „Absenden", ein wiederholter Request oder ein
-- zweiter Browsertab wuerden sonst zwei Eintraege derselben Person
-- erzeugen — und die Verwaltung ruft zweimal an. Eine Vorabpruefung im
-- Anwendungscode kann das bei parallelen Aufrufen prinzipiell nicht; ein
-- Index kann es. Teil-Index, weil E-Mail freiwillig ist.
CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_customers_email
  ON public.waitlist_customers (organization_id, lower(TRIM(email)))
  WHERE email IS NOT NULL AND TRIM(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_customers_phone
  ON public.waitlist_customers (organization_id, regexp_replace(phone, '\D', '', 'g'))
  WHERE phone IS NOT NULL AND TRIM(phone) <> '';

-- Posteingang der Verwaltung: neueste zuerst, je Mandant.
CREATE INDEX IF NOT EXISTS idx_waitlist_customers_eingang
  ON public.waitlist_customers (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_waitlist_customers_status
  ON public.waitlist_customers (status);

-- ── updated_at ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_waitlist_customers_updated_at()
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

DROP TRIGGER IF EXISTS trg_waitlist_customers_updated_at ON public.waitlist_customers;
CREATE TRIGGER trg_waitlist_customers_updated_at
  BEFORE UPDATE ON public.waitlist_customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_waitlist_customers_updated_at();

-- ── Rechte ────────────────────────────────────────────────────────────
ALTER TABLE public.waitlist_customers ENABLE ROW LEVEL SECURITY;

-- Kein GRANT an anon: die oeffentliche Seite schreibt ueber den
-- Dienstschluessel (POST /api/waitlist), nicht direkt in die Tabelle.
REVOKE ALL ON public.waitlist_customers FROM PUBLIC;
REVOKE ALL ON public.waitlist_customers FROM anon;

GRANT SELECT, INSERT, UPDATE ON public.waitlist_customers TO authenticated;

DROP POLICY IF EXISTS "Admin full access waitlist_customers" ON public.waitlist_customers;
CREATE POLICY "Admin full access waitlist_customers"
  ON public.waitlist_customers FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.waitlist_customers IS
  'Vormerkungen von Interessenten waehrend des §45a-Anerkennungsverfahrens. '
  'Schreibweg ausschliesslich POST /api/waitlist mit dem Dienstschluessel — '
  'bewusst KEINE anon-INSERT-Policy (siehe 20260828180000).';

COMMENT ON COLUMN public.waitlist_customers.gewuenschte_leistungen IS
  'Mehrfachauswahl aus WARTELISTE_LEISTUNGEN (lib/warteliste/katalog.ts). '
  'Array statt Spalten, weil sich der Katalog aendert.';

COMMENT ON CONSTRAINT waitlist_customers_rueckweg_check ON public.waitlist_customers IS
  'E-Mail ODER Telefon muss gesetzt sein — ohne Rueckweg ist eine Vormerkung wertlos.';

COMMIT;
