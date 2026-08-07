-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Tarifschichten bundeslandfähig (5-Schichten-Modell)
-- Datum:     2026-08-08
-- Branch:    feature/expansion-deutschland
-- Voraussetzung: 20260808100000_expansion_deutschland.sql
--
-- ZWECK
--   Saubere Trennung der fünf Preis-Ebenen — jede davon bundeslandabhängig:
--
--     1. GESETZLICHE OBERGRENZEN   billing_gesetzliche_obergrenzen
--        Was das Land maximal erlaubt (z. B. Landesverordnung nach §45a SGB XI).
--        KEIN Abrechnungspreis — nur die Deckelung.
--
--     2. ANBIETERPREISE            billing_tariffs  (rechtsgrundlage ≠ 'privat')
--        Was Alltagsengel gegenüber der Kasse abrechnet. Muss ≤ Obergrenze sein.
--
--     3. PRIVATPREISE              billing_tariffs  (rechtsgrundlage = 'privat')
--        Frei kalkulierbar, keine gesetzliche Deckelung.
--
--     4. WEGEPAUSCHALEN            billing_wegepauschalen
--        Eigene Schicht, weil Modell (pro Einsatz / pro km / Zone) und
--        Deckelung je Bundesland unterschiedlich sind.
--
--     5. LANDESSPEZIFISCHE REGELN  billing_landesregeln (+ Key-Katalog)
--        Mindesteinsatzdauer, Taktung, Qualifikationsanforderungen,
--        Nachweispflichten — alles, was kein Preis ist, aber die
--        Abrechnung steuert.
--
-- HARTE GUARDS
--   • Anbieterpreise können die gesetzliche Obergrenze ihres Bundeslands
--     nicht überschreiten (Trigger, nicht nur UI).
--   • Kassentarife können nur angelegt/aktiviert werden, wenn das Bundesland
--     kassentarife_enabled = TRUE hat.
--   • Kassen-Rechnungspositionen können nur entstehen, wenn das Bundesland
--     kassenrechnung_enabled = TRUE hat.
--
-- KEINE erfundenen Preise. Werte aus Verordnungen werden mit
-- bestaetigt = FALSE eingetragen und müssen gegen das Original geprüft werden.
-- Rollback: 20260808110001_rollback_tarifschichten_bundesland.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 0. Bundesland-Normalisierung (Schreibweisen vereinheitlichen)
--    'Baden-Württemberg' / 'BW' / 'DE-BW' / 'baden_wuerttemberg' → 'baden_wuerttemberg'
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_bundesland(p_input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE PARALLEL SAFE
SET search_path = public
AS $fn$
DECLARE
  v_norm TEXT;
  v_code TEXT;
BEGIN
  IF p_input IS NULL OR btrim(p_input) = '' THEN
    RETURN NULL;
  END IF;

  -- Kleinbuchstaben, Umlaute auflösen, alles Nicht-Alphanumerische zu '_'
  v_norm := lower(btrim(p_input));
  v_norm := replace(v_norm, 'ä', 'ae');
  v_norm := replace(v_norm, 'ö', 'oe');
  v_norm := replace(v_norm, 'ü', 'ue');
  v_norm := replace(v_norm, 'ß', 'ss');
  v_norm := regexp_replace(v_norm, '[^a-z0-9]+', '_', 'g');
  v_norm := btrim(v_norm, '_');

  -- Direkter Treffer auf den Katalog
  SELECT code INTO v_code FROM public.bundeslaender WHERE code = v_norm;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  -- ISO-Code (DE-HE) oder Kurzform (HE / BW)
  SELECT code INTO v_code
    FROM public.bundeslaender
   WHERE lower(iso_code) = lower(btrim(p_input))
      OR lower(replace(iso_code, 'DE-', '')) = lower(btrim(p_input));
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  -- Bezeichnung, ebenfalls normalisiert
  SELECT code INTO v_code
    FROM public.bundeslaender
   WHERE regexp_replace(
           btrim(replace(replace(replace(replace(lower(bezeichnung),
             'ä','ae'), 'ö','oe'), 'ü','ue'), 'ß','ss')),
           '[^a-z0-9]+', '_', 'g') = v_norm;

  RETURN v_code;   -- NULL, wenn nicht zuordenbar
END;
$fn$;

COMMENT ON FUNCTION public.normalize_bundesland IS
  'Bildet beliebige Schreibweisen eines Bundeslands auf den Katalog-Code ab. '
  'NULL, wenn nicht zuordenbar (fail-safe).';

GRANT EXECUTE ON FUNCTION public.normalize_bundesland(TEXT)
  TO anon, authenticated, service_role;

-- Bestandsdaten angleichen (organizations.bundesland war Freitext: "Hessen")
UPDATE public.organizations
   SET bundesland = public.normalize_bundesland(bundesland)
 WHERE bundesland IS NOT NULL
   AND public.normalize_bundesland(bundesland) IS NOT NULL
   AND bundesland <> public.normalize_bundesland(bundesland);

UPDATE public.billing_tariffs
   SET bundesland = public.normalize_bundesland(bundesland)
 WHERE bundesland IS NOT NULL
   AND public.normalize_bundesland(bundesland) IS NOT NULL
   AND bundesland <> public.normalize_bundesland(bundesland);

-- organizations.address->>'bundesland' ebenfalls angleichen
UPDATE public.organizations
   SET address = jsonb_set(address, '{bundesland}',
                 to_jsonb(public.normalize_bundesland(address->>'bundesland')))
 WHERE address ? 'bundesland'
   AND public.normalize_bundesland(address->>'bundesland') IS NOT NULL
   AND address->>'bundesland' <> public.normalize_bundesland(address->>'bundesland');

-- Ab jetzt nur noch Katalog-Codes in billing_tariffs.bundesland
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tariff_bundesland') THEN
    ALTER TABLE public.billing_tariffs
      ADD CONSTRAINT fk_tariff_bundesland
      FOREIGN KEY (bundesland) REFERENCES public.bundeslaender(code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_org_bundesland') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT fk_org_bundesland
      FOREIGN KEY (bundesland) REFERENCES public.bundeslaender(code);
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- SCHICHT 1 — GESETZLICHE OBERGRENZEN
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.billing_gesetzliche_obergrenzen (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL = bundesweit geltende Obergrenze (z. B. Bundesrecht)
  bundesland       TEXT REFERENCES public.bundeslaender(code),
  rechtsgrundlage  TEXT NOT NULL REFERENCES public.billing_rechtsgrundlagen(code),
  -- NULL = gilt für alle Leistungsarten dieser Rechtsgrundlage
  leistungsart     TEXT REFERENCES public.billing_leistungsarten(code),
  -- Grobe Kategorie, wenn die Verordnung nicht nach Leistungsart, sondern nach
  -- Angebotstyp differenziert (typisch für Landesverordnungen nach §45a SGB XI)
  angebotstyp      TEXT CHECK (angebotstyp IS NULL OR angebotstyp IN (
                     'betreuungsangebot', 'entlastungsangebot',
                     'angebot_ehrenamt', 'pflegedienst', 'sonstiges'
                   )),

  verguetungsart   TEXT NOT NULL CHECK (verguetungsart IN (
                     'zeit_stunde','zeit_minute','leistungskomplex',
                     'pauschale','wegepauschale','zuschlag'
                   )),
  obergrenze_cent  INTEGER NOT NULL CHECK (obergrenze_cent > 0),

  -- Herkunft — Pflichtfeld. Keine Obergrenze ohne belegbare Quelle.
  quelle           TEXT NOT NULL,
  quelle_paragraf  TEXT,
  quelle_url       TEXT,
  quelle_stand     DATE,

  -- FALSE, solange der Wert nicht 1:1 gegen die Originalverordnung
  -- geprueft wurde. Nur bestaetigte Obergrenzen wirken als harte Sperre.
  bestaetigt       BOOLEAN NOT NULL DEFAULT FALSE,
  bestaetigt_von   UUID REFERENCES auth.users(id),
  bestaetigt_am    TIMESTAMPTZ,

  gueltig_ab       DATE NOT NULL,
  gueltig_bis      DATE,
  ist_aktiv        BOOLEAN NOT NULL DEFAULT TRUE,
  hinweis          TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES auth.users(id),

  CONSTRAINT chk_obergrenze_zeitraum CHECK (gueltig_bis IS NULL OR gueltig_bis >= gueltig_ab),
  CONSTRAINT chk_obergrenze_bestaetigt CHECK (
    bestaetigt = FALSE OR (bestaetigt_von IS NOT NULL AND bestaetigt_am IS NOT NULL)
  )
);

COMMENT ON TABLE public.billing_gesetzliche_obergrenzen IS
  'SCHICHT 1: Gesetzliche Preisobergrenzen je Bundesland. KEINE Abrechnungstarife — '
  'nur die Deckelung, die ein Anbieterpreis (billing_tariffs) nicht ueberschreiten darf. '
  'Wirkt als harte Sperre erst, wenn bestaetigt = TRUE.';
COMMENT ON COLUMN public.billing_gesetzliche_obergrenzen.bestaetigt IS
  'TRUE erst nach 1:1-Abgleich mit der Originalverordnung. Nur dann greift die Trigger-Sperre.';
COMMENT ON COLUMN public.billing_gesetzliche_obergrenzen.bundesland IS
  'NULL = bundesweit geltende Obergrenze.';

CREATE INDEX IF NOT EXISTS idx_obergrenzen_lookup
  ON public.billing_gesetzliche_obergrenzen
     (rechtsgrundlage, bundesland, leistungsart, gueltig_ab DESC)
  WHERE ist_aktiv;

DROP TRIGGER IF EXISTS trg_obergrenzen_updated_at ON public.billing_gesetzliche_obergrenzen;
CREATE TRIGGER trg_obergrenzen_updated_at
  BEFORE UPDATE ON public.billing_gesetzliche_obergrenzen
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Seed Hessen: PfluV-Werte als UNBESTÄTIGTE Obergrenzen ───────────────────
-- Quelle: §3 PfluV Hessen (Preisobergrenzen), belegt durch die Quellenpruefung
--   billing/QUELLENPRUEFUNG_30-25-5_EUR.md vom 07.08.2026 mit drei uebereinstimmenden
--   Fundstellen im Repo (§45a-Checkliste-Unterlagen, Recherche pflege-in-hessen.de,
--   ausgefuellter Erhebungsbogen).
--
-- bestaetigt = FALSE ist BEWUSST gesetzt:
--   • Die Fundstellen sind Sekundaerquellen; der Verordnungstext selbst wurde
--     noch nicht 1:1 gegengelesen.
--   • Die PfluV-Novelle befindet sich in der Verbaendeanhoerung — starre
--     Obergrenzen koennten entfallen.
-- Solange bestaetigt = FALSE ist, dokumentiert die Zeile nur; der Trigger
-- enforce_tariff_obergrenze sperrt NICHT.
INSERT INTO public.billing_gesetzliche_obergrenzen (
  bundesland, rechtsgrundlage, leistungsart, angebotstyp, verguetungsart,
  obergrenze_cent, quelle, quelle_paragraf, gueltig_ab, bestaetigt, hinweis
) VALUES
  ('hessen', '§45b SGB XI', NULL, 'betreuungsangebot', 'zeit_stunde',
   3000, 'PfluV Hessen', '§3 PfluV Hessen — Nr. 1 und Nr. 2', DATE '2026-01-01', FALSE,
   'PREISOBERGRENZE 30,00 EUR/Std. inkl. USt. fuer Betreuungsangebote (§45a Abs. 1 '
   'S. 2 Nr. 1) und Entlastung von Pflegenden (Nr. 2). KEIN Abrechnungstarif und kein '
   'Erstattungsbetrag — der Anbieter waehlt seinen Preis bis zu dieser Grenze. '
   'Beleg: billing/QUELLENPRUEFUNG_30-25-5_EUR.md. Vor bestaetigt=TRUE den '
   'Verordnungstext gegenlesen und den Stand der PfluV-Novelle pruefen.'),
  ('hessen', '§45b SGB XI', NULL, 'entlastungsangebot', 'zeit_stunde',
   2500, 'PfluV Hessen', '§3 PfluV Hessen — Nr. 3', DATE '2026-01-01', FALSE,
   'PREISOBERGRENZE 25,00 EUR/Std. inkl. USt. fuer Entlastung im Alltag '
   '(§45a Abs. 1 S. 2 Nr. 3, u. a. hauswirtschaftliche Versorgung). '
   'KEIN Abrechnungstarif. Beleg: billing/QUELLENPRUEFUNG_30-25-5_EUR.md. '
   'Vor bestaetigt=TRUE den Verordnungstext gegenlesen und den Stand der '
   'PfluV-Novelle pruefen.')
ON CONFLICT DO NOTHING;

-- Bewusst NICHT geseedet: die 5-EUR-Fahrtkostenpauschale.
-- Sie ist laut Quellenpruefung ein selbst beantragter Wert ohne PfluV-Grundlage
-- und ohne Genehmigung — also weder Obergrenze noch belegte Wegepauschale.

-- ════════════════════════════════════════════════════════════════════════════
-- SCHICHT 4 — WEGEPAUSCHALEN
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.billing_wegepauschalen (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL DEFAULT public.current_org_id()
                     REFERENCES public.organizations(id) ON DELETE CASCADE,
  bundesland       TEXT REFERENCES public.bundeslaender(code),  -- NULL = alle Länder der Org
  rechtsgrundlage  TEXT NOT NULL REFERENCES public.billing_rechtsgrundlagen(code),
  kostentraeger_ik TEXT,

  modell           TEXT NOT NULL CHECK (modell IN (
                     'keine',        -- Wegekosten sind im Leistungspreis enthalten
                     'pro_einsatz',  -- fester Betrag je Einsatz
                     'pro_km',       -- Betrag je gefahrenem Kilometer
                     'zone'          -- Betrag je Entfernungszone
                   )),
  betrag_cent      INTEGER NOT NULL DEFAULT 0 CHECK (betrag_cent >= 0),
  zone_von_km      NUMERIC(6,2) CHECK (zone_von_km IS NULL OR zone_von_km >= 0),
  zone_bis_km      NUMERIC(6,2) CHECK (zone_bis_km IS NULL OR zone_bis_km >= 0),
  frei_km          NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (frei_km >= 0),
  max_betrag_cent  INTEGER CHECK (max_betrag_cent IS NULL OR max_betrag_cent >= 0),

  quelle           TEXT,
  gueltig_ab       DATE NOT NULL,
  gueltig_bis      DATE,
  ist_aktiv        BOOLEAN NOT NULL DEFAULT TRUE,
  notes            TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES auth.users(id),
  deleted_at       TIMESTAMPTZ,

  CONSTRAINT chk_wege_zeitraum CHECK (gueltig_bis IS NULL OR gueltig_bis >= gueltig_ab),
  CONSTRAINT chk_wege_zone CHECK (
    modell <> 'zone' OR (zone_von_km IS NOT NULL AND zone_bis_km IS NOT NULL
                         AND zone_bis_km > zone_von_km)
  ),
  CONSTRAINT chk_wege_ik CHECK (
    kostentraeger_ik IS NULL OR public.validate_ik_nummer(kostentraeger_ik)
  )
);

COMMENT ON TABLE public.billing_wegepauschalen IS
  'SCHICHT 4: Wegepauschalen je Bundesland und Rechtsgrundlage. Eigene Schicht, weil '
  'Modell (pro Einsatz / pro km / Zone) und Deckelung landesspezifisch abweichen. '
  'KEINE Seed-Werte — Betraege sind vertraglich zu belegen.';

CREATE INDEX IF NOT EXISTS idx_wegepauschalen_lookup
  ON public.billing_wegepauschalen
     (organization_id, bundesland, rechtsgrundlage, gueltig_ab DESC)
  WHERE ist_aktiv AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_wegepauschalen_updated_at ON public.billing_wegepauschalen;
CREATE TRIGGER trg_wegepauschalen_updated_at
  BEFORE UPDATE ON public.billing_wegepauschalen
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- SCHICHT 5 — LANDESSPEZIFISCHE REGELN
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.billing_landesregel_keys (
  code        TEXT PRIMARY KEY,
  bezeichnung TEXT NOT NULL,
  wert_typ    TEXT NOT NULL CHECK (wert_typ IN ('integer','numeric','boolean','text','array')),
  einheit     TEXT,
  beschreibung TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_landesregel_keys IS
  'Kontrollierter Katalog der Regel-Schluessel fuer billing_landesregeln. '
  'Struktur ohne Werte — die konkreten Landeswerte kommen aus der jeweiligen Verordnung.';

INSERT INTO public.billing_landesregel_keys (code, bezeichnung, wert_typ, einheit, beschreibung, sort_order) VALUES
  ('min_einsatzdauer_minuten',   'Mindesteinsatzdauer',                   'integer', 'Minuten',
   'Kuerzeste abrechenbare Einsatzdauer.', 1),
  ('taktung_minuten',            'Abrechnungstaktung',                    'integer', 'Minuten',
   'Zeitraster, in dem nach der Mindestdauer weiter abgerechnet wird.', 2),
  ('max_stunden_pro_einsatz',    'Maximale Einsatzdauer',                 'numeric', 'Stunden',
   'Obergrenze abrechenbarer Stunden je Einsatz.', 3),
  ('max_stunden_pro_monat',      'Maximale Stunden pro Monat',            'numeric', 'Stunden',
   'Obergrenze abrechenbarer Stunden je Klient und Monat.', 4),
  ('qualifikation_erforderlich', 'Erforderliche Qualifikation',           'array',   NULL,
   'Zulaessige Qualifikationsnachweise der Betreuungskraft.', 5),
  ('schulungsstunden_minimum',   'Mindest-Schulungsumfang',               'integer', 'Stunden',
   'Vorgeschriebener Schulungsumfang vor Einsatzbeginn.', 6),
  ('fuehrungszeugnis_pflicht',   'Erweitertes Fuehrungszeugnis Pflicht',  'boolean', NULL,
   'Erweitertes Fuehrungszeugnis vor Einsatz erforderlich.', 7),
  ('unterschrift_pflicht',       'Unterschrift des Klienten Pflicht',     'boolean', NULL,
   'Leistungsnachweis muss vom Klienten unterschrieben sein.', 8),
  ('nachweis_aufbewahrung_jahre','Aufbewahrungsfrist Leistungsnachweise', 'integer', 'Jahre',
   'Dauer der Aufbewahrungspflicht fuer Leistungsnachweise.', 9),
  ('abrechnung_frist_monate',    'Abrechnungsfrist',                      'integer', 'Monate',
   'Frist, innerhalb derer gegenueber der Kasse abgerechnet werden muss.', 10),
  ('elektronische_abrechnung',   'Elektronische Abrechnung zulaessig',    'boolean', NULL,
   'Datenaustausch nach §105/§302 SGB (Dakota) zulaessig bzw. verpflichtend.', 11),
  ('wegekosten_erstattungsfaehig','Wegekosten erstattungsfaehig',         'boolean', NULL,
   'Ob Wegekosten neben der Leistung abgerechnet werden duerfen.', 12),
  ('zuschlag_wochenende_zulaessig','Wochenendzuschlag zulaessig',         'boolean', NULL,
   'Ob ein Wochenendzuschlag gegenueber der Kasse zulaessig ist.', 13),
  ('zuschlag_feiertag_zulaessig','Feiertagszuschlag zulaessig',           'boolean', NULL,
   'Ob ein Feiertagszuschlag gegenueber der Kasse zulaessig ist.', 14),
  ('zuschlag_nacht_zulaessig',   'Nachtzuschlag zulaessig',               'boolean', NULL,
   'Ob ein Nachtzuschlag gegenueber der Kasse zulaessig ist.', 15),
  ('anerkennung_rechtsgrundlage','Landesrechtliche Grundlage',            'text',    NULL,
   'Bezeichnung der Landesverordnung nach §45a SGB XI.', 16)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.billing_landesregeln (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundesland      TEXT NOT NULL REFERENCES public.bundeslaender(code),
  regel_key       TEXT NOT NULL REFERENCES public.billing_landesregel_keys(code),
  regel_wert      JSONB NOT NULL,
  rechtsgrundlage TEXT REFERENCES public.billing_rechtsgrundlagen(code),

  quelle          TEXT,
  quelle_url      TEXT,
  bestaetigt      BOOLEAN NOT NULL DEFAULT FALSE,
  beschreibung    TEXT,

  gueltig_ab      DATE NOT NULL,
  gueltig_bis     DATE,
  ist_aktiv       BOOLEAN NOT NULL DEFAULT TRUE,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),

  CONSTRAINT uq_landesregel UNIQUE (bundesland, regel_key, rechtsgrundlage, gueltig_ab),
  CONSTRAINT chk_landesregel_zeitraum CHECK (gueltig_bis IS NULL OR gueltig_bis >= gueltig_ab)
);

COMMENT ON TABLE public.billing_landesregeln IS
  'SCHICHT 5: Landesspezifische Abrechnungsregeln (Mindestdauer, Taktung, Qualifikation, '
  'Nachweispflichten). Werte kommen aus der jeweiligen Landesverordnung — keine Vorbelegung.';

CREATE INDEX IF NOT EXISTS idx_landesregeln_lookup
  ON public.billing_landesregeln (bundesland, regel_key, gueltig_ab DESC)
  WHERE ist_aktiv;

DROP TRIGGER IF EXISTS trg_landesregeln_updated_at ON public.billing_landesregeln;
CREATE TRIGGER trg_landesregeln_updated_at
  BEFORE UPDATE ON public.billing_landesregeln
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Nur die landesrechtliche Grundlage Hessens ist belegt (Repo-Unterlagen §45a).
INSERT INTO public.billing_landesregeln
  (bundesland, regel_key, regel_wert, rechtsgrundlage, quelle, bestaetigt, gueltig_ab, beschreibung)
VALUES
  ('hessen', 'anerkennung_rechtsgrundlage', '"PfluV Hessen"'::jsonb, '§45b SGB XI',
   'Angabe Geschaeftsfuehrung, Stand 08.08.2026', FALSE, DATE '2026-01-01',
   'Landesverordnung, auf deren Grundlage die Anerkennung nach §45a SGB XI erfolgt. '
   'Novelle in der Verbaendeanhoerung — Rechtsstand vor Scharfschaltung pruefen.')
ON CONFLICT (bundesland, regel_key, rechtsgrundlage, gueltig_ab) DO NOTHING;

-- Lese-Helper: Regelwert mit Fallback
CREATE OR REPLACE FUNCTION public.landesregel(
  p_bundesland      TEXT,
  p_regel_key       TEXT,
  p_datum           DATE DEFAULT CURRENT_DATE,
  p_rechtsgrundlage TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT r.regel_wert
    FROM public.billing_landesregeln r
   WHERE r.bundesland = public.normalize_bundesland(p_bundesland)
     AND r.regel_key = p_regel_key
     AND r.ist_aktiv
     AND r.gueltig_ab <= p_datum
     AND (r.gueltig_bis IS NULL OR r.gueltig_bis >= p_datum)
     AND (p_rechtsgrundlage IS NULL
          OR r.rechtsgrundlage IS NULL
          OR r.rechtsgrundlage = p_rechtsgrundlage)
   ORDER BY (r.rechtsgrundlage IS NOT NULL) DESC, r.gueltig_ab DESC
   LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.landesregel IS
  'Liest einen landesspezifischen Regelwert (JSONB) fuer Bundesland/Key/Datum. '
  'Spezifischere Regel (mit Rechtsgrundlage) gewinnt. NULL, wenn nichts hinterlegt ist.';

GRANT EXECUTE ON FUNCTION public.landesregel(TEXT, TEXT, DATE, TEXT)
  TO anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- GUARD 1 — Anbieterpreis darf die bestätigte Obergrenze nicht überschreiten
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.enforce_tariff_obergrenze()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_grenze RECORD;
BEGIN
  -- Privatpreise unterliegen keiner gesetzlichen Deckelung.
  IF NEW.rechtsgrundlage = 'privat' THEN
    RETURN NEW;
  END IF;

  -- Spezifischste bestaetigte Obergrenze suchen:
  --   exaktes Bundesland vor bundesweit, exakte Leistungsart vor "alle".
  SELECT o.obergrenze_cent, o.quelle, o.quelle_paragraf, o.bundesland, o.hinweis
    INTO v_grenze
    FROM public.billing_gesetzliche_obergrenzen o
   WHERE o.ist_aktiv
     AND o.bestaetigt = TRUE
     AND o.rechtsgrundlage = NEW.rechtsgrundlage
     AND o.verguetungsart  = NEW.verguetungsart
     AND (o.bundesland IS NULL OR o.bundesland = NEW.bundesland)
     AND (o.leistungsart IS NULL OR o.leistungsart = NEW.leistungsart)
     AND o.gueltig_ab <= NEW.gueltig_ab
     AND (o.gueltig_bis IS NULL OR o.gueltig_bis >= NEW.gueltig_ab)
   ORDER BY (o.bundesland IS NOT NULL) DESC,
            (o.leistungsart IS NOT NULL) DESC,
            o.gueltig_ab DESC
   LIMIT 1;

  IF FOUND AND NEW.preis_cent > v_grenze.obergrenze_cent THEN
    RAISE EXCEPTION
      'OBERGRENZE_UEBERSCHRITTEN: Tarifpreis % Cent liegt ueber der gesetzlichen '
      'Obergrenze von % Cent. Rechtsgrundlage: %, Bundesland: %, Quelle: % %.',
      NEW.preis_cent, v_grenze.obergrenze_cent, NEW.rechtsgrundlage,
      COALESCE(v_grenze.bundesland, 'bundesweit'),
      v_grenze.quelle, COALESCE(v_grenze.quelle_paragraf, '');
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_tariff_obergrenze ON public.billing_tariffs;
CREATE TRIGGER trg_tariff_obergrenze
  BEFORE INSERT OR UPDATE OF preis_cent, rechtsgrundlage, verguetungsart, bundesland, leistungsart, gueltig_ab
  ON public.billing_tariffs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tariff_obergrenze();

COMMENT ON FUNCTION public.enforce_tariff_obergrenze IS
  'GUARD: Kassentarife duerfen die bestaetigte gesetzliche Obergrenze ihres Bundeslands '
  'nicht ueberschreiten. Privattarife sind ausgenommen. Unbestaetigte Obergrenzen sperren nicht.';

-- ════════════════════════════════════════════════════════════════════════════
-- GUARD 2 — Kein Tarif darf sich auf einen Bescheid berufen, den es nicht gibt
--
-- BEWUSSTE ABGRENZUNG:
--   Kassentarife DUERFEN in jedem Bundesland vorbereitet und aktiv gehalten
--   werden — sonst waere die Tarifpflege bis zur Anerkennung blockiert und
--   Entwurfs-/Vorschaurechnungen wuerden mit MISSING_VALID_TARIFF scheitern.
--   Gesperrt ist nur die inhaltlich falsche Aussage: tarifquelle
--   'ANERKENNUNGSBESCHEID' setzt voraus, dass fuer dieses Bundesland
--   tatsaechlich ein Bescheid hinterlegt und die Kasse freigeschaltet ist.
--   Die eigentliche Abrechnungssperre sitzt in GUARD 3.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.enforce_kassentarif_freigeschaltet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_land TEXT;
BEGIN
  -- Nur Tarife, die sich ausdruecklich auf einen Anerkennungsbescheid berufen.
  IF NEW.tarifquelle IS DISTINCT FROM 'ANERKENNUNGSBESCHEID' THEN
    RETURN NEW;
  END IF;

  -- Inaktive Tarife duerfen als Vorbereitung angelegt werden.
  IF NEW.ist_aktiv IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  -- Bundesland des Tarifs, sonst das der Organisation.
  v_land := COALESCE(
    NEW.bundesland,
    (SELECT bundesland FROM public.organizations WHERE id = NEW.organization_id)
  );

  IF v_land IS NULL THEN
    RAISE EXCEPTION
      'KASSENTARIF_OHNE_BUNDESLAND: Ein Tarif mit tarifquelle=ANERKENNUNGSBESCHEID '
      'braucht ein Bundesland (Tarif-Feld oder Organisation). Rechtsgrundlage: %.',
      NEW.rechtsgrundlage;
  END IF;

  IF NOT public.state_flag(NEW.organization_id, v_land, 'kassentarife') THEN
    RAISE EXCEPTION
      'BESCHEID_FEHLT: Fuer Bundesland "%" liegt kein Anerkennungsbescheid vor, '
      'daher ist tarifquelle=ANERKENNUNGSBESCHEID unzulaessig. Bis zur Anerkennung '
      'bitte eine andere Tarifquelle waehlen (z. B. MANUELL_FREIGEGEBEN) oder den '
      'Tarif inaktiv (ist_aktiv = FALSE) vorbereiten.', v_land;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_kassentarif_freigeschaltet ON public.billing_tariffs;
CREATE TRIGGER trg_kassentarif_freigeschaltet
  BEFORE INSERT OR UPDATE OF ist_aktiv, tarifquelle, rechtsgrundlage, bundesland, organization_id
  ON public.billing_tariffs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_kassentarif_freigeschaltet();

COMMENT ON FUNCTION public.enforce_kassentarif_freigeschaltet IS
  'GUARD: tarifquelle=ANERKENNUNGSBESCHEID nur in Bundeslaendern mit hinterlegtem '
  'Bescheid (kassentarife_enabled = TRUE). Tarifpflege und Entwurfsrechnungen bleiben '
  'in allen Bundeslaendern uneingeschraenkt moeglich.';

-- ════════════════════════════════════════════════════════════════════════════
-- GUARD 3 — Kassenrechnung darf den Entwurfsstatus nur verlassen, wenn das
--            Bundesland freigeschaltet ist.
--
-- BEWUSSTE ABGRENZUNG (Vorgabe: „blockiere keine Features"):
--   • ENTWURF bleibt IMMER erlaubt. Rechnungen berechnen, Vorschau ansehen,
--     Tarife testen, Monatsabschluss simulieren — alles laeuft weiter.
--   • Erst der Uebergang in einen Status, der eine Forderung gegenueber der
--     Pflegekasse begruendet (geprueft/freigegeben/uebermittelt/…), verlangt
--     kassenrechnung_enabled = TRUE.
--   • 'storniert' ist immer erlaubt (Aufraeumen muss moeglich bleiben).
--   • Reine Privatrechnungen sind vollstaendig ausgenommen.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.enforce_kassenrechnung_freigeschaltet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_land        TEXT;
  v_kassen_pos  INTEGER;
BEGIN
  -- Nur beim Verlassen des Entwurfsstatus pruefen.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status IN ('entwurf', 'storniert') THEN
    RETURN NEW;
  END IF;

  -- Enthaelt die Rechnung ueberhaupt Kassenpositionen?
  SELECT COUNT(*) INTO v_kassen_pos
    FROM public.invoice_items i
   WHERE i.invoice_id = NEW.id
     AND i.budget_type IS NOT NULL
     AND i.budget_type <> 'private';

  IF v_kassen_pos = 0 THEN
    RETURN NEW;   -- reine Privatrechnung
  END IF;

  v_land := (SELECT bundesland FROM public.organizations WHERE id = NEW.organization_id);

  IF v_land IS NULL THEN
    RAISE EXCEPTION
      'KASSENRECHNUNG_OHNE_BUNDESLAND: Die Organisation hat kein Bundesland gesetzt. '
      'Die Freigabe einer Kassenrechnung kann nicht geprueft werden.';
  END IF;

  IF NOT public.state_flag(NEW.organization_id, v_land, 'kassenrechnung') THEN
    RAISE EXCEPTION
      'KASSENRECHNUNG_NICHT_FREIGESCHALTET: Fuer Bundesland "%" ist die Kassenabrechnung '
      'noch nicht freigeschaltet. Die Rechnung bleibt als Entwurf erhalten und kann nach '
      'der Anerkennung ohne Neuberechnung freigegeben werden. Privatabrechnung ist '
      'unabhaengig davon moeglich. (% Kassenposition(en), Zielstatus: %)',
      v_land, v_kassen_pos, NEW.status;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_kassenrechnung_freigeschaltet ON public.invoice_items;
DROP TRIGGER IF EXISTS trg_kassenrechnung_freigeschaltet ON public.invoices;
CREATE TRIGGER trg_kassenrechnung_freigeschaltet
  BEFORE UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_kassenrechnung_freigeschaltet();

COMMENT ON FUNCTION public.enforce_kassenrechnung_freigeschaltet IS
  'GUARD: Eine Rechnung mit Kassenpositionen darf den Entwurfsstatus nur verlassen, wenn '
  'das Bundesland kassenrechnung_enabled = TRUE hat. Entwuerfe, Vorschau und '
  'Privatrechnungen bleiben uneingeschraenkt moeglich.';

-- ════════════════════════════════════════════════════════════════════════════
-- GUARD 4 — Kassen-Buchungen nur in freigeschalteten Bundesländern
--
-- Die Buchungsstrecke setzt payment_method im Browser. Ein manipulierter
-- Client könnte 'kasse' senden, obwohl die Oberfläche nur 'privat' anbietet.
-- Dieser Trigger ist die serverseitige Absicherung: er setzt die Zahlungsart
-- still auf 'privat' zurueck, statt die Buchung zu verlieren.
-- (Kunde bekommt seine Leistung — nur eben privat abgerechnet.)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.enforce_booking_zahlungsart()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_org  UUID;
  v_land TEXT;
BEGIN
  IF NEW.payment_method IS NULL OR NEW.payment_method = 'privat' THEN
    RETURN NEW;
  END IF;

  v_org := COALESCE(NEW.organization_id, public.current_org_id());
  IF v_org IS NULL THEN
    NEW.payment_method := 'privat';
    RETURN NEW;
  END IF;

  SELECT bundesland INTO v_land FROM public.organizations WHERE id = v_org;

  IF v_land IS NULL OR NOT public.state_flag(v_org, v_land, 'insurance') THEN
    -- Kein Abbruch: die Buchung bleibt bestehen, aber als Privatleistung.
    NEW.payment_method := 'privat';
  END IF;

  RETURN NEW;
END;
$fn$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'bookings'
       AND column_name = 'payment_method'
  ) THEN
    DROP TRIGGER IF EXISTS trg_booking_zahlungsart ON public.bookings;
    CREATE TRIGGER trg_booking_zahlungsart
      BEFORE INSERT OR UPDATE OF payment_method ON public.bookings
      FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_zahlungsart();
  ELSE
    RAISE NOTICE 'bookings.payment_method existiert nicht — GUARD 4 uebersprungen.';
  END IF;
END $$;

COMMENT ON FUNCTION public.enforce_booking_zahlungsart IS
  'GUARD: setzt payment_method auf "privat" zurueck, wenn die Kassenabrechnung im '
  'Bundesland der Organisation nicht freigeschaltet ist. Verwirft die Buchung NICHT.';

-- ════════════════════════════════════════════════════════════════════════════
-- RLS + Berechtigungen für die neuen Tarifschichten
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.billing_gesetzliche_obergrenzen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_wegepauschalen          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_landesregeln            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_landesregel_keys        ENABLE ROW LEVEL SECURITY;

-- Obergrenzen und Landesregeln sind Rechtsstand — für alle Angemeldeten lesbar,
-- schreiben nur Admins.
DROP POLICY IF EXISTS obergrenzen_read ON public.billing_gesetzliche_obergrenzen;
CREATE POLICY obergrenzen_read ON public.billing_gesetzliche_obergrenzen
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS obergrenzen_admin_write ON public.billing_gesetzliche_obergrenzen;
CREATE POLICY obergrenzen_admin_write ON public.billing_gesetzliche_obergrenzen
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS landesregeln_read ON public.billing_landesregeln;
CREATE POLICY landesregeln_read ON public.billing_landesregeln
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS landesregeln_admin_write ON public.billing_landesregeln;
CREATE POLICY landesregeln_admin_write ON public.billing_landesregeln
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS landesregel_keys_read ON public.billing_landesregel_keys;
CREATE POLICY landesregel_keys_read ON public.billing_landesregel_keys
  FOR SELECT TO authenticated USING (TRUE);

-- Wegepauschalen sind Geschäftsdaten der Organisation → Org-Fence.
DROP POLICY IF EXISTS wegepauschalen_org_fence ON public.billing_wegepauschalen;
CREATE POLICY wegepauschalen_org_fence ON public.billing_wegepauschalen
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (organization_id = public.current_org_id())
  WITH CHECK (organization_id = public.current_org_id());

DROP POLICY IF EXISTS wegepauschalen_admin ON public.billing_wegepauschalen;
CREATE POLICY wegepauschalen_admin ON public.billing_wegepauschalen
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.billing_gesetzliche_obergrenzen TO authenticated;
GRANT SELECT ON public.billing_landesregeln            TO authenticated;
GRANT SELECT ON public.billing_landesregel_keys        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_wegepauschalen TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_gesetzliche_obergrenzen TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_landesregeln TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- Übersicht: welche Preisschicht liefert welchen Wert (Diagnose-View)
-- ════════════════════════════════════════════════════════════════════════════
DROP VIEW IF EXISTS public.billing_preisschichten_uebersicht;
CREATE VIEW public.billing_preisschichten_uebersicht AS
SELECT
  1                                    AS schicht,
  'Gesetzliche Obergrenze'             AS schicht_name,
  o.bundesland,
  o.rechtsgrundlage,
  o.leistungsart,
  o.verguetungsart,
  o.obergrenze_cent                    AS betrag_cent,
  o.quelle,
  o.bestaetigt,
  o.gueltig_ab,
  o.gueltig_bis,
  o.ist_aktiv,
  NULL::UUID                           AS organization_id
FROM public.billing_gesetzliche_obergrenzen o
UNION ALL
SELECT
  CASE WHEN t.rechtsgrundlage = 'privat' THEN 3 ELSE 2 END,
  CASE WHEN t.rechtsgrundlage = 'privat' THEN 'Privatpreis' ELSE 'Anbieterpreis' END,
  t.bundesland,
  t.rechtsgrundlage,
  t.leistungsart,
  t.verguetungsart,
  t.preis_cent,
  t.tarifquelle,
  TRUE,
  t.gueltig_ab,
  t.gueltig_bis,
  t.ist_aktiv,
  t.organization_id
FROM public.billing_tariffs t
WHERE t.deleted_at IS NULL
UNION ALL
SELECT
  4,
  'Wegepauschale',
  w.bundesland,
  w.rechtsgrundlage,
  'wegepauschale',
  'wegepauschale',
  w.betrag_cent,
  w.quelle,
  TRUE,
  w.gueltig_ab,
  w.gueltig_bis,
  w.ist_aktiv,
  w.organization_id
FROM public.billing_wegepauschalen w
WHERE w.deleted_at IS NULL;

COMMENT ON VIEW public.billing_preisschichten_uebersicht IS
  'Diagnose-Sicht ueber die Preisschichten 1-4 je Bundesland. Zeigt sofort, ob ein '
  'Anbieterpreis eine Obergrenze verletzt oder eine Schicht fuer ein Land fehlt.';

GRANT SELECT ON public.billing_preisschichten_uebersicht TO authenticated;
