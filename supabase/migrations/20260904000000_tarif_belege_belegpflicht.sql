-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Tarif-Belege + Belegpflicht fuer die Freigabe
-- Datum:     2026-09-04  (Stream 3 — Tarif- und Abrechnungssicherheit)
--
-- BEFUND
--   Der Verifizierungsstatus (20260831040000 / 20260902000000) und die
--   Fail-Closed-Rechnungswege (20260831050000) sind vorhanden, aber die
--   FREIGABE SELBST war nicht belegt:
--
--   1) Es gab keinen Ort, an dem der Primaerbeleg (Verguetungsvereinbarung,
--      Anerkennungsbescheid, Rechtsverordnung) zu einem Tarif liegt.
--      verifizierungs_quelle ist ein FREITEXT — jemand kann "AOK Hessen vom
--      01.03.2026" eintippen, ohne dass ein solches Dokument existiert.
--
--   2) Der kontrollierte Freigabeweg PATCH /api/billing/tariffs/[id]/
--      verifizierung ist nur EINER der Schreibpfade. Die RLS auf
--      billing_tariffs und leistungspreise erlaubt jedem Admin ein direktes
--      UPDATE ueber PostgREST (leistungspreise: Policy admin_leistungspreise
--      FOR ALL USING is_admin(), 20260731020000). Ein direktes
--      UPDATE leistungspreise SET tarif_status='verified' haette die
--      Pflichtquelle der API-Route komplett umgangen — und damit die
--      Fail-Closed-Sperre des Monatsabschlusses geoeffnet.
--
--   3) leistungspreise hatte ueberhaupt keinen Audit-Trail. Wer wann welchen
--      Preis oder Status geaendert hat, war nicht rekonstruierbar
--      (billing_tariffs hat den Trail seit 20260831040000).
--
-- AENDERUNG
--   a) Privater Storage-Bucket 'tarif-belege' (keine Client-Policies —
--      Zugriff ausschliesslich ueber API-Routen mit service_role, gleiche
--      Konvention wie 'vertraege'/'kunden-dokumente' in 20260809010000).
--   b) Tabelle billing_tarif_belege: ein Beleg gehoert zu GENAU EINER Zeile
--      in billing_tariffs ODER leistungspreise, mit SHA-256 gegen stilles
--      Austauschen der Datei.
--   c) Spalte beleg_id auf beiden Preistabellen: welcher Beleg traegt die
--      aktuell gueltige Freigabe.
--   d) Trigger trg_verifizierung_belegpflicht auf BEIDEN Tabellen: der
--      UEBERGANG nach 'verified' verlangt Rechtsquelle, Bearbeiter und einen
--      Beleg, der zu genau dieser Zeile und Organisation gehoert. Das gilt
--      unabhaengig vom Schreibweg — auch fuer direktes PostgREST-UPDATE.
--   e) Audit-Trail auf leistungspreise (schreibt in billing_tariff_audit,
--      unterschieden ueber quell_tabelle).
--
-- BEWUSST NICHT TEIL DIESER MIGRATION
--   * KEIN Tarif wird verifiziert, gesperrt oder im Preis geaendert.
--   * KEIN Preis wird erfunden. Die PfluV-Hessen-Saetze fehlen weiterhin
--     bewusst (siehe 20260902000000).
--   * Die Belegpflicht greift nur beim UEBERGANG nach 'verified', nicht
--     rueckwirkend. Sonst wuerde jedes spaetere UPDATE auf den bereits
--     verifizierten Bestand (Privattarife, Entlastungsbetrag,
--     Alltagsbegleitung, Wegepauschalen — verifiziert per
--     'system/migration' in 20260831040000) fehlschlagen und die laufende
--     Abrechnung anhalten. Dieser Altbestand ist ueber die View
--     v_tarife_ohne_beleg sichtbar und in der Tarifuebersicht als
--     "Freigabe ohne hinterlegten Beleg" gekennzeichnet — er ist damit
--     nachdokumentierbar, aber nicht stillschweigend akzeptiert.
--
-- Rollback: 20260904000001_rollback_tarif_belege_belegpflicht.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Privater Bucket fuer Primaerbelege
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tarif-belege',
  'tarif-belege',
  false,
  20971520,  -- 20 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Belegtabelle
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.billing_tarif_belege (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL,
  quell_tabelle     TEXT NOT NULL CHECK (quell_tabelle IN ('billing_tariffs', 'leistungspreise')),
  tariff_id         UUID REFERENCES public.billing_tariffs(id) ON DELETE RESTRICT,
  leistungspreis_id UUID REFERENCES public.leistungspreise(id) ON DELETE RESTRICT,
  bucket            TEXT NOT NULL DEFAULT 'tarif-belege',
  dateipfad         TEXT NOT NULL UNIQUE,
  dateiname         TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  groesse_bytes     INTEGER NOT NULL CHECK (groesse_bytes > 0),
  sha256            TEXT NOT NULL,
  quelle            TEXT,
  hochgeladen_von   TEXT NOT NULL,
  hochgeladen_am    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Genau eine Zuordnung, passend zur angegebenen Quelltabelle.
  CONSTRAINT beleg_genau_eine_zuordnung
    CHECK (num_nonnulls(tariff_id, leistungspreis_id) = 1),
  CONSTRAINT beleg_zuordnung_passt_zur_quelltabelle
    CHECK (
      (quell_tabelle = 'billing_tariffs'  AND tariff_id IS NOT NULL)
      OR
      (quell_tabelle = 'leistungspreise'  AND leistungspreis_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_tarif_belege_tariff       ON public.billing_tarif_belege(tariff_id);
CREATE INDEX IF NOT EXISTS idx_tarif_belege_leistungspreis ON public.billing_tarif_belege(leistungspreis_id);
CREATE INDEX IF NOT EXISTS idx_tarif_belege_org          ON public.billing_tarif_belege(organization_id);

COMMENT ON TABLE public.billing_tarif_belege IS
  'Primaerbelege (Verguetungsvereinbarung, Anerkennungsbescheid, Rechtsverordnung) '
  'zu einem Tarif bzw. Leistungspreis. Datei liegt im privaten Bucket tarif-belege, '
  'Zugriff nur ueber API-Routen mit service_role. sha256 belegt, dass die Datei '
  'nach dem Upload nicht ausgetauscht wurde.';

ALTER TABLE public.billing_tarif_belege ENABLE ROW LEVEL SECURITY;

-- Lesen nur fuer Admins der eigenen Organisation; Schreiben laeuft ueber die
-- API mit service_role (die RLS umgeht), damit Upload, sha256 und Audit-Eintrag
-- nicht auseinanderfallen koennen.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'billing_tarif_belege'
      AND policyname = 'tarif_belege_admin_read'
  ) THEN
    CREATE POLICY tarif_belege_admin_read ON public.billing_tarif_belege
      FOR SELECT
      USING (
        public.is_admin()
        AND organization_id IN (
          SELECT om.organization_id FROM public.organization_members om
          WHERE om.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. beleg_id auf beiden Preistabellen
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.billing_tariffs
  ADD COLUMN IF NOT EXISTS beleg_id UUID REFERENCES public.billing_tarif_belege(id) ON DELETE RESTRICT;

ALTER TABLE public.leistungspreise
  ADD COLUMN IF NOT EXISTS beleg_id UUID REFERENCES public.billing_tarif_belege(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.billing_tariffs.beleg_id IS
  'Beleg, der die aktuell gueltige Freigabe traegt. Pflicht beim Uebergang nach '
  'tarif_status=''verified'' (Trigger trg_verifizierung_belegpflicht).';
COMMENT ON COLUMN public.leistungspreise.beleg_id IS
  'Beleg, der die aktuell gueltige Freigabe traegt. Pflicht beim Uebergang nach '
  'tarif_status=''verified'' (Trigger trg_verifizierung_belegpflicht).';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Audit-Tabelle fuer beide Quellen oeffnen
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.billing_tariff_audit
  ALTER COLUMN tariff_id DROP NOT NULL;

-- leistungspreise.organization_id ist nullable (Altbestand aus der Zeit vor
-- Phase 3 Multi-Mandant). Der Audit-Trail muss diese Zeilen protokollieren
-- koennen, statt das UPDATE mit einem NOT-NULL-Verstoss abzubrechen. Die
-- RLS-Policy org_fence_tariff_audit laesst NULL-Org-Zeilen ohnehin nicht
-- durch (fail-closed beim Lesen); die API liest mit explizitem Org-Filter.
ALTER TABLE public.billing_tariff_audit
  ALTER COLUMN organization_id DROP NOT NULL;

ALTER TABLE public.billing_tariff_audit
  ADD COLUMN IF NOT EXISTS quell_tabelle TEXT NOT NULL DEFAULT 'billing_tariffs',
  ADD COLUMN IF NOT EXISTS leistungspreis_id UUID REFERENCES public.leistungspreise(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS beleg_id UUID REFERENCES public.billing_tarif_belege(id) ON DELETE RESTRICT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'tariff_audit_quell_tabelle_check'
      AND conrelid = 'public.billing_tariff_audit'::regclass
  ) THEN
    ALTER TABLE public.billing_tariff_audit
      ADD CONSTRAINT tariff_audit_quell_tabelle_check
      CHECK (quell_tabelle IN ('billing_tariffs', 'leistungspreise'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tariff_audit_leistungspreis
  ON public.billing_tariff_audit(leistungspreis_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Belegpflicht beim Uebergang nach 'verified'
--
--    Wirkt auf JEDEN Schreibweg (API-Route, direktes PostgREST-UPDATE,
--    psql), nicht nur auf die Verifizierungs-Route. Genau das war die Luecke:
--    die Pflichtquelle lebte bisher ausschliesslich in der API-Schicht.
--
--    Geprueft wird nur der UEBERGANG (INSERT nach 'verified' oder
--    Statuswechsel). Bereits verifizierte Zeilen bleiben aenderbar — sonst
--    wuerde jede Preis- oder Stammdatenpflege am Altbestand fehlschlagen.
--    Ein Preiswechsel setzt den Status ohnehin per trg_verifizierung_verfaellt
--    (20260902000000) auf 'unverified' zurueck; die naechste Freigabe laeuft
--    dann wieder durch diese Pruefung.
--
--    SET search_path ist gesetzt: eine SECURITY-DEFINER-Funktion ohne festen
--    search_path ist ueber eine untergeschobene Suchreihenfolge angreifbar.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_verifizierung_belegpflicht()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_wechsel     BOOLEAN;
  v_beleg       RECORD;
  v_ist_kasse   BOOLEAN := TRUE;
BEGIN
  v_wechsel := (TG_OP = 'INSERT')
               OR (OLD.tarif_status IS DISTINCT FROM NEW.tarif_status);

  -- Nur der Weg NACH 'verified' ist pruefungspflichtig. 'unverified' und
  -- 'blocked' sind die sicheren Richtungen und bleiben jederzeit moeglich.
  IF NEW.tarif_status <> 'verified' OR NOT v_wechsel THEN
    RETURN NEW;
  END IF;

  IF NEW.verifizierungs_quelle IS NULL OR length(trim(NEW.verifizierungs_quelle)) < 5 THEN
    RAISE EXCEPTION
      'Freigabe abgelehnt: tarif_status=''verified'' verlangt eine Rechtsquelle '
      '(verifizierungs_quelle, mindestens 5 Zeichen).'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.verifiziert_von IS NULL OR length(trim(NEW.verifiziert_von)) = 0 THEN
    RAISE EXCEPTION
      'Freigabe abgelehnt: tarif_status=''verified'' verlangt einen Bearbeiter '
      '(verifiziert_von).'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Privattarife: der Preis ist frei waehlbar, es gibt keine Primaerquelle,
  -- gegen die ein Beleg gehalten werden koennte. Rechtsquelle und Bearbeiter
  -- bleiben Pflicht, ein Dokument nicht. Fuer leistungspreise existiert die
  -- Spalte rechtsgrundlage nicht — diese Tabelle speist ausschliesslich den
  -- Kassen-/Monatsabschlussweg und ist damit immer belegpflichtig.
  IF TG_TABLE_NAME = 'billing_tariffs' THEN
    v_ist_kasse := COALESCE(NEW.rechtsgrundlage, '') <> 'privat';
  END IF;

  IF NOT v_ist_kasse THEN
    RETURN NEW;
  END IF;

  IF NEW.beleg_id IS NULL THEN
    RAISE EXCEPTION
      'Freigabe abgelehnt: Fuer die Kassenabrechnung freigegebene Tarife brauchen '
      'einen hinterlegten Primaerbeleg (beleg_id). Beleg zuerst ueber '
      '/api/billing/tarif-belege hochladen.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_beleg
  FROM public.billing_tarif_belege
  WHERE id = NEW.beleg_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Freigabe abgelehnt: Beleg % existiert nicht.', NEW.beleg_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Bei NULL-Org-Zeilen (leistungspreise-Altbestand vor Phase 3) ist kein
  -- Abgleich moeglich; dort tragen Admin-Gate und der Org-Fence des Belegs.
  IF NEW.organization_id IS NOT NULL
     AND v_beleg.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION
      'Freigabe abgelehnt: Beleg gehoert zu einer anderen Organisation.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Der Beleg muss zu GENAU DIESER Zeile gehoeren. Ohne diese Pruefung koennte
  -- ein einziger hochgeladener Beleg jeden beliebigen Tarif freigeben.
  IF TG_TABLE_NAME = 'billing_tariffs' THEN
    IF v_beleg.quell_tabelle <> 'billing_tariffs' OR v_beleg.tariff_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION
        'Freigabe abgelehnt: Beleg % gehoert nicht zu Tarif %.', NEW.beleg_id, NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF v_beleg.quell_tabelle <> 'leistungspreise' OR v_beleg.leistungspreis_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION
        'Freigabe abgelehnt: Beleg % gehoert nicht zu Leistungspreis %.', NEW.beleg_id, NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_verifizierung_belegpflicht() IS
  'Fail-Closed-Gate fuer die Tarif-Freigabe: der Uebergang nach '
  'tarif_status=''verified'' verlangt Rechtsquelle, Bearbeiter und (ausser bei '
  'Privattarifen) einen Primaerbeleg, der zu genau dieser Zeile und Organisation '
  'gehoert. Wirkt auf jedem Schreibweg, auch bei direktem PostgREST-UPDATE.';

DROP TRIGGER IF EXISTS trg_belegpflicht_billing_tariffs ON public.billing_tariffs;
CREATE TRIGGER trg_belegpflicht_billing_tariffs
  BEFORE INSERT OR UPDATE ON public.billing_tariffs
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_verifizierung_belegpflicht();

DROP TRIGGER IF EXISTS trg_belegpflicht_leistungspreise ON public.leistungspreise;
CREATE TRIGGER trg_belegpflicht_leistungspreise
  BEFORE INSERT OR UPDATE ON public.leistungspreise
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_verifizierung_belegpflicht();

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Audit-Trigger fuer billing_tariffs nachziehen (beleg_id + search_path)
--    Sonst steht im Audit-Trail zwar der Statuswechsel, aber nicht, WELCHER
--    Beleg ihn getragen hat.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_billing_tariff_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.billing_tariff_audit (
    tariff_id, organization_id, quell_tabelle, aktion,
    alter_betrag_cent, neuer_betrag_cent,
    alter_status, neuer_status,
    benutzer, quelle, beleg_id
  ) VALUES (
    NEW.id,
    NEW.organization_id,
    'billing_tariffs',
    CASE
      WHEN TG_OP = 'INSERT' THEN 'erstellt'
      WHEN OLD.tarif_status IS DISTINCT FROM NEW.tarif_status THEN 'status_geaendert'
      WHEN OLD.preis_cent IS DISTINCT FROM NEW.preis_cent THEN 'preis_geaendert'
      ELSE 'aktualisiert'
    END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.preis_cent ELSE NULL END,
    NEW.preis_cent,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.tarif_status ELSE NULL END,
    NEW.tarif_status,
    COALESCE(NEW.verifiziert_von, current_setting('request.jwt.claims', true)::json->>'sub'),
    NEW.verifizierungs_quelle,
    NEW.beleg_id
  );
  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Audit-Trigger fuer leistungspreise (bisher komplett ohne Trail)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_leistungspreis_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.billing_tariff_audit (
    leistungspreis_id, organization_id, quell_tabelle, aktion,
    alter_betrag_cent, neuer_betrag_cent,
    alter_status, neuer_status,
    benutzer, quelle, beleg_id
  ) VALUES (
    NEW.id,
    NEW.organization_id,
    'leistungspreise',
    CASE
      WHEN TG_OP = 'INSERT' THEN 'erstellt'
      WHEN OLD.tarif_status IS DISTINCT FROM NEW.tarif_status THEN 'status_geaendert'
      WHEN OLD.preis_cent IS DISTINCT FROM NEW.preis_cent THEN 'preis_geaendert'
      ELSE 'aktualisiert'
    END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.preis_cent ELSE NULL END,
    NEW.preis_cent,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.tarif_status ELSE NULL END,
    NEW.tarif_status,
    COALESCE(NEW.verifiziert_von, current_setting('request.jwt.claims', true)::json->>'sub'),
    NEW.verifizierungs_quelle,
    NEW.beleg_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leistungspreis_audit ON public.leistungspreise;
CREATE TRIGGER trg_leistungspreis_audit
  AFTER INSERT OR UPDATE ON public.leistungspreise
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_leistungspreis_audit();

-- ────────────────────────────────────────────────────────────────────────────
-- 8. Sichtbarkeit des Altbestands: verifiziert, aber ohne Beleg
--    Diese Zeilen sind vor der Belegpflicht entstanden (Stand 20260831040000:
--    per 'system/migration' verifiziert). Sie bleiben abrechenbar, sind aber
--    als nachzudokumentieren ausgewiesen — nicht stillschweigend akzeptiert.
-- ────────────────────────────────────────────────────────────────────────────

-- security_invoker: ohne dieses Setting laeuft eine View mit den Rechten ihres
-- Eigentuemers (postgres) und wuerde die RLS der Basistabellen aushebeln.
CREATE OR REPLACE VIEW public.v_tarife_ohne_beleg
WITH (security_invoker = true) AS
  SELECT
    'billing_tariffs'::TEXT      AS quell_tabelle,
    t.id,
    t.organization_id,
    t.leistungsart,
    t.rechtsgrundlage,
    t.bundesland,
    t.preis_cent,
    t.verifiziert_am,
    t.verifiziert_von,
    t.verifizierungs_quelle
  FROM public.billing_tariffs t
  WHERE t.tarif_status = 'verified'
    AND t.beleg_id IS NULL
    AND COALESCE(t.rechtsgrundlage, '') <> 'privat'
    AND t.deleted_at IS NULL
  UNION ALL
  SELECT
    'leistungspreise'::TEXT      AS quell_tabelle,
    p.id,
    p.organization_id,
    p.leistungsart,
    NULL::TEXT                   AS rechtsgrundlage,
    p.bundesland,
    p.preis_cent,
    p.verifiziert_am,
    p.verifiziert_von,
    p.verifizierungs_quelle
  FROM public.leistungspreise p
  WHERE p.tarif_status = 'verified'
    AND p.beleg_id IS NULL;

COMMENT ON VIEW public.v_tarife_ohne_beleg IS
  'Kassenrelevante Tarife/Preise mit Freigabe, aber ohne hinterlegten Primaerbeleg. '
  'Altbestand aus der Zeit vor der Belegpflicht (20260904000000) — nachzudokumentieren.';

-- ────────────────────────────────────────────────────────────────────────────
-- 9. Rechte explizit setzen
--    In diesem Projekt vergeben die Default-Privileges auf public grosszuegig
--    an anon. Belege sind Vertragsunterlagen — anon bekommt hier nichts, auch
--    nicht lesend. Geschrieben wird ausschliesslich mit service_role ueber die
--    API-Routen; es gibt bewusst keine INSERT/UPDATE/DELETE-Policy.
-- ────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON public.billing_tarif_belege FROM anon;
REVOKE ALL ON public.v_tarife_ohne_beleg  FROM anon;
GRANT SELECT ON public.billing_tarif_belege TO authenticated;
GRANT SELECT ON public.v_tarife_ohne_beleg  TO authenticated;

-- Trigger-Funktionen sind ueber PostgREST ohnehin nicht aufrufbar
-- (RETURNS TRIGGER). Der Entzug steht trotzdem hier, damit eine spaetere
-- Aenderung der Signatur nicht versehentlich eine SECURITY-DEFINER-Funktion
-- fuer anon oeffnet.
REVOKE ALL ON FUNCTION public.trg_verifizierung_belegpflicht() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trg_leistungspreis_audit()       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.trg_billing_tariff_audit()       FROM PUBLIC, anon;

COMMIT;
