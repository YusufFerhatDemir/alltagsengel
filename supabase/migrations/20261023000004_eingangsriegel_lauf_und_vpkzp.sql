-- ═══════════════════════════════════════════════════════════════════════
-- Zwei weitere Riegel bekommen einen EINGANG
--
-- NICHT ANGEWENDET (Stand 31.08.2026). Rollback: 20261023000005.
-- Anwenden im Supabase-SQL-Editor als `postgres`.
--
-- ─────────────────────────────────────────────────────────────────────
-- HERKUNFT: dieselbe Frage wie bei U11 und R1
-- ─────────────────────────────────────────────────────────────────────
-- „Feuert der Riegel auch beim EINFUEGEN?" Ein Sweep ueber alle Trigger
-- des Schemas mit `pg_get_triggerdef(oid) LIKE '%BEFORE UPDATE%' AND NOT
-- LIKE '%INSERT%'` ergab 90 Treffer. Der ganz ueberwiegende Teil sind
-- `set_updated_at`-Helfer und Audit-Unveraenderlichkeit — dort ist
-- UPDATE-only richtig. Fuenf waren echte Fachriegel und wurden am
-- 31.08.2026 live geprobt (INSERT in einer Transaktion, die zurueckrollt):
--
--   billing_tariffs   tarif_status='verified'   ABGEWIESEN (Belegpflicht
--                                               greift auch beim INSERT)
--   state_settings    kassenrechnung an         ABGEWIESEN (CHECK
--                                               chk_insurance_requires_-
--                                               anerkennung — CHECKs
--                                               gelten beim INSERT)
--   abrechnungslaeufe status='uebermittelt'     DURCHGELASSEN  ← hier
--   client_vpkzp_usage Verbrauch vorbelegt      DURCHGELASSEN  ← hier
--   bookings          status='completed'        DURCHGELASSEN  (bewusst
--                                               NICHT in dieser Migration,
--                                               Begruendung unten)
--
-- ═══════════════════════════════════════════════════════════════════════
-- TEIL 1 — Abrechnungslauf: Eingangsstatus 'erstellt'
-- ═══════════════════════════════════════════════════════════════════════
-- `validate_lauf_status_transition` beschreibt einen langen Weg:
-- erstellt → validierung_laeuft → geprueft → freigegeben → export_laeuft
-- → exportiert → bereit_zur_uebermittlung → uebermittlung_laeuft →
-- uebermittelt → quittiert → angenommen → abgeschlossen. Der Trigger ist
-- `BEFORE UPDATE`; ein INSERT mit `status='uebermittelt'` ueberspringt
-- den gesamten Weg und ging live durch.
--
-- Was daran zaehlt: ein Lauf im Status 'uebermittelt' behauptet eine
-- Uebermittlung nach § 105 SGB XI an eine Datenannahmestelle. Ohne den
-- Weg dorthin gab es weder Validierung noch Freigabe noch Export noch
-- Uebertragung — nur die Behauptung. Dieselbe Klasse Unwahrheit, gegen
-- die bei den Rechnungen `frozen_at` als zweites Merkmal eingefuehrt
-- wurde.
--
-- Der Eingang ist eindeutig belegt und nicht geraten: der Spalten-DEFAULT
-- ist 'erstellt', und die Statusmaschine kennt genau diesen Anfang.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enforce_lauf_eingangsstatus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'erstellt' THEN
    RETURN NEW;
  END IF;

  -- NULL wird abgewiesen: ein weggelassener Status traegt hier bereits
  -- den DEFAULT 'erstellt' (Spalten-DEFAULTs greifen VOR den
  -- BEFORE-Triggern). NULL kommt nur an, wenn jemand ihn ausdruecklich
  -- schreibt — und ein Lauf ohne Status faellt aus jeder Uebersicht.
  IF NEW.status IS NULL THEN
    RAISE EXCEPTION
      'LAUF_EINGANGSSTATUS: Ein Abrechnungslauf ohne Status ist nicht zulaessig.'
      USING HINT = 'Feld weglassen (DEFAULT ''erstellt'') oder ausdruecklich ''erstellt'' setzen.';
  END IF;

  RAISE EXCEPTION
    'LAUF_EINGANGSSTATUS: Ein Abrechnungslauf kann nur als ''erstellt'' angelegt werden, nicht als ''%''.',
    NEW.status
    USING HINT = 'Jeder weitere Status entsteht durch ein UPDATE — nur dort greift validate_lauf_status_transition.';
END;
$$;

DROP TRIGGER IF EXISTS trg_a_lauf_eingangsstatus ON public.abrechnungslaeufe;

CREATE TRIGGER trg_a_lauf_eingangsstatus
  BEFORE INSERT ON public.abrechnungslaeufe
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_lauf_eingangsstatus();

COMMENT ON FUNCTION public.enforce_lauf_eingangsstatus() IS
  'Laesst einen Abrechnungslauf nur als ''erstellt'' entstehen. Ohne diesen '
  'Riegel ueberspringt ein INSERT die gesamte Statusmaschine — ein Lauf '
  'koennte ''uebermittelt'' sein, ohne je validiert, freigegeben, exportiert '
  'oder uebertragen worden zu sein (Befund vom 31.08.2026).';

-- ═══════════════════════════════════════════════════════════════════════
-- TEIL 2 — VP/KZP-Verbrauch: abgeleitet heisst auch beim Anlegen abgeleitet
-- ═══════════════════════════════════════════════════════════════════════
-- `trg_vpkzp_usage_abgeleitet` sagt woertlich: „Verbrauchswerte werden
-- aus vpkzp_buchungen fortgeschrieben und nicht direkt gesetzt." Der
-- Trigger ist `BEFORE UPDATE` — beim ANLEGEN liessen sich dieselben
-- Werte frei setzen, live nachgewiesen mit vp_days_used = 56 und
-- kzp_days_used = 56.
--
-- Beide Richtungen sind falsch, und beide sind erreichbar:
--   * zu hoch angelegt: die Kontingente (je 56 Tage, § 39/§ 42 SGB XI)
--     erscheinen erschoepft, obwohl nichts gebucht wurde — Leistungen
--     werden zu Unrecht abgelehnt.
--   * zu niedrig angelegt: es erscheint Budget, das es nicht gibt.
--
-- Der Trigger wird deshalb auf INSERT ausgeweitet. Beim INSERT gibt es
-- kein OLD, der Vergleich muss also anders lauten: alle vier
-- Verbrauchsfelder muessen leer oder null sein. Ein frisch angelegter
-- Jahressatz hat noch keinen Verbrauch — er entsteht durch die
-- Fortschreibung aus `vpkzp_buchungen`.
--
-- `pg_trigger_depth() > 1` bleibt unangetastet: genau darueber schreibt
-- die Fortschreibung selbst, und die muss weiterhin durchkommen.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_vpkzp_usage_abgeleitet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Die Fortschreibung aus vpkzp_buchungen laeuft ueber einen anderen
  -- Trigger und damit in Tiefe > 1. Sie DARF schreiben.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.vp_days_used, 0)    <> 0
    OR COALESCE(NEW.kzp_days_used, 0)   <> 0
    OR COALESCE(NEW.vp_amount_used, 0)  <> 0
    OR COALESCE(NEW.kzp_amount_used, 0) <> 0 THEN
      RAISE EXCEPTION
        'VPKZP_STAND_ABGELEITET: Ein neuer Jahressatz wird ohne Verbrauch angelegt — die Werte werden aus vpkzp_buchungen fortgeschrieben und nicht direkt gesetzt.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NEW.vp_days_used    IS DISTINCT FROM OLD.vp_days_used
  OR NEW.kzp_days_used   IS DISTINCT FROM OLD.kzp_days_used
  OR NEW.vp_amount_used  IS DISTINCT FROM OLD.vp_amount_used
  OR NEW.kzp_amount_used IS DISTINCT FROM OLD.kzp_amount_used THEN
    RAISE EXCEPTION 'VPKZP_STAND_ABGELEITET: Verbrauchswerte werden aus vpkzp_buchungen fortgeschrieben und nicht direkt gesetzt.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vpkzp_usage_abgeleitet ON public.client_vpkzp_usage;

CREATE TRIGGER trg_vpkzp_usage_abgeleitet
  BEFORE INSERT OR UPDATE ON public.client_vpkzp_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_vpkzp_usage_abgeleitet();

-- ═══════════════════════════════════════════════════════════════════════
-- WARUM `bookings` HIER NICHT STEHT
-- ═══════════════════════════════════════════════════════════════════════
-- `enforce_booking_status_transition` ist ebenfalls BEFORE UPDATE, und
-- ein INSERT mit status='completed' ging live durch. Der Fall ist aber
-- fachlich NICHT eindeutig: eine nachtraeglich erfasste Buchung, die
-- bereits stattgefunden hat, ist ein plausibler Vorgang — anders als ein
-- Abrechnungslauf, der ohne Uebertragung „uebermittelt" ist. Ob die
-- Nacherfassung erlaubt sein soll und in welchem Status, ist eine
-- fachliche Entscheidung und keine, die eine Migration nebenbei trifft.
--
-- Der Befund ist deshalb festgehalten, nicht zugenagelt:
-- docs/MIGRATIONEN_OFFEN_2026-08-31.md, Abschnitt 11.
--
-- NACHWEIS NACH DEM ANWENDEN
--     npm run verify:trigger-eingang   → beide Zeilen muessen OK melden
-- ═══════════════════════════════════════════════════════════════════════
