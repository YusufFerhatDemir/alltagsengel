-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261017000002_obergrenze_angebotstyp.sql
--
-- Stellt `enforce_tariff_obergrenze` in exakt der Fassung wieder her, die
-- live am 28.08.2026 in pg_proc stand — inklusive ihres Befundes: ohne
-- Angebotstyp-Filter zieht sie fuer jede §45b-Zeitstunden-Leistungsart die
-- 30-EUR-Zeile, auch fuer hauswirtschaft und einkaufsservice (Soll: 25 EUR).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_tariff_obergrenze()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE v_grenze RECORD;
BEGIN
  IF NEW.rechtsgrundlage = 'privat' THEN RETURN NEW; END IF;
  SELECT o.obergrenze_cent, o.quelle, o.quelle_paragraf, o.bundesland, o.hinweis INTO v_grenze
    FROM public.billing_gesetzliche_obergrenzen o
   WHERE o.ist_aktiv AND o.bestaetigt = TRUE AND o.rechtsgrundlage = NEW.rechtsgrundlage
     AND o.verguetungsart = NEW.verguetungsart
     AND (o.bundesland IS NULL OR o.bundesland = NEW.bundesland)
     AND (o.leistungsart IS NULL OR o.leistungsart = NEW.leistungsart)
     AND o.gueltig_ab <= NEW.gueltig_ab AND (o.gueltig_bis IS NULL OR o.gueltig_bis >= NEW.gueltig_ab)
   ORDER BY (o.bundesland IS NOT NULL) DESC, (o.leistungsart IS NOT NULL) DESC, o.gueltig_ab DESC LIMIT 1;
  IF FOUND AND NEW.preis_cent > v_grenze.obergrenze_cent THEN
    RAISE EXCEPTION 'OBERGRENZE_UEBERSCHRITTEN: % Cent > % Cent. Rechtsgrundlage: %, Bundesland: %, Quelle: % %.',
      NEW.preis_cent, v_grenze.obergrenze_cent, NEW.rechtsgrundlage,
      COALESCE(v_grenze.bundesland, 'bundesweit'), v_grenze.quelle, COALESCE(v_grenze.quelle_paragraf, '');
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.angebotstyp_von_leistungsart(TEXT);

COMMIT;
