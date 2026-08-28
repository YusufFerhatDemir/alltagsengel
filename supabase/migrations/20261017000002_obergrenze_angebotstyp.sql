-- ═══════════════════════════════════════════════════════════════════════
-- Track 12: Abrechnung & Finanzfluesse — PfluV-Obergrenze nach Angebotstyp
--
-- ANGEWENDET — live nachgemessen am 28.08.2026. Rollback: 20261017000003.
--
-- Nachweis: der Quelltext von enforce_tariff_obergrenze und
-- angebotstyp_von_leistungsart wurde aus pg_proc gezogen und gegen DIESE
-- Datei gehalten — bis auf die SQL-Kommentare (die die Live-Fassung nicht
-- traegt) identisch. Die Auswahl liefert live:
--
--   betreuung_45a    → 3000   demenzbetreuung  → 3000
--   hauswirtschaft   → 2500   einkaufsservice  → 2500
--
-- also genau die Trennung, die der Befund B3 vermisst hat.
--
-- ACHTUNG fuer den naechsten Leser: `npm run verify:abrechnung` meldete
-- diese Migration trotzdem monatelang als OFFEN. Der Grund lag nicht an
-- der Datenbank, sondern an der Pruefung — TRIGGER_AUSWAHL im Skript bildete
-- noch die Auswahl VOR dieser Migration nach und stellte damit eine Frage,
-- die der Trigger gar nicht mehr stellt. Beides ist nachgezogen, und E2
-- liest jetzt zusaetzlich den Trigger-Quelltext selbst, damit derselbe
-- Drift nicht wieder unbemerkt bleibt.
--
-- ─────────────────────────────────────────────────────────────────────
-- BEFUND B3 (P2, LIVE_VERIFIZIERT)
-- ─────────────────────────────────────────────────────────────────────
-- `billing_gesetzliche_obergrenzen` traegt zwei hessische §45b-Zeilen:
--
--   hessen | §45b SGB XI | betreuungsangebot  | leistungsart NULL | zeit_stunde | 3000
--   hessen | §45b SGB XI | entlastungsangebot | leistungsart NULL | zeit_stunde | 2500
--
-- Beide stehen live auf bestaetigt = TRUE und ist_aktiv = TRUE. Der Trigger
-- `enforce_tariff_obergrenze` greift also. Seine Auswahl lautet:
--
--   WHERE ist_aktiv AND bestaetigt AND rechtsgrundlage = NEW.rechtsgrundlage
--     AND verguetungsart = NEW.verguetungsart
--     AND (bundesland IS NULL OR bundesland = NEW.bundesland)
--     AND (leistungsart IS NULL OR leistungsart = NEW.leistungsart)
--     ...
--   ORDER BY (bundesland IS NOT NULL) DESC, (leistungsart IS NOT NULL) DESC,
--            gueltig_ab DESC
--   LIMIT 1
--
-- Der `angebotstyp` kommt darin nicht vor — `billing_tariffs` hat die Spalte
-- gar nicht. Die beiden Zeilen unterscheiden sich AUSSCHLIESSLICH in diesem
-- Feld. Sie sind fuer den Filter also gleichwertig, das ORDER BY bricht den
-- Gleichstand nicht auf, und welche Zeile LIMIT 1 zieht, entscheidet der
-- Planer.
--
-- Live nachgestellt (28.08.2026), die Auswahl liefert:
--
--   betreuung_45a    → 3000   (Soll 3000, Nr. 1 §45a Abs. 1 S. 2)  richtig
--   demenzbetreuung  → 3000   (Soll 3000)                          richtig
--   hauswirtschaft   → 3000   (Soll 2500, Nr. 3)                   ZU HOCH
--   einkaufsservice  → 3000   (Soll 2500, Nr. 3)                   ZU HOCH
--
-- Zwei Wirkungen, beide falsch:
--   * Entlastungsleistungen duerfen 20 % teurer sein, als die Verordnung
--     erlaubt — die Sperre laesst durch, was sie sperren soll.
--   * Zoege der Planer die andere Zeile, wuerde umgekehrt ein
--     rechtmaessiger 30-EUR-Betreuungstarif abgewiesen. Eine Sperre auf
--     einem Gleichstand ist keine verlaessliche Sperre.
--
-- ABHILFE: dem Trigger dieselbe Zuordnung geben, die der Anwendungscode
-- schon fuehrt (lib/billing/obergrenzen.ts::ANGEBOTSTYP_VON_LEISTUNGSART).
-- Sie ist eine fachliche Auslegung von §45a Abs. 1 S. 2 SGB XI und wird
-- hier ALS SOLCHE abgebildet — inklusive der Faelle, die bewusst NICHT
-- zugeordnet sind:
--
--   alltagsbegleitung  passt auf Nr. 1 ("Betreuung im Alltag") wie auf
--                      Nr. 3 ("Entlastung im Alltag"). 5 EUR je Stunde auf
--                      eine Wortaehnlichkeit zu stuetzen waere geraten.
--   begleitservice     je nach Ausgestaltung Nr. 1 oder Nr. 3.
--   wegepauschale      keine Zeitleistung.
--   sonstige           Sammelposten ohne fachliche Aussage.
--
-- Fuer diese wird gegen die HOECHSTE einschlaegige Grenze geprueft, und der
-- Trigger sagt das in seiner Fehlermeldung dazu. Lieber eine Sperre
-- weniger als eine falsche Sperre: eine Warnung, der niemand mehr glaubt,
-- ist keine Kontrolle. Dieselbe Entscheidung wie im Anwendungscode.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- Angebotstyp zu einer Tarif-Leistungsart, oder NULL wenn nicht eindeutig.
-- Bewusst IMMUTABLE und ohne Tabellenzugriff: die Zuordnung ist eine
-- Auslegung des Gesetzestextes, kein Stammdatum. Sie gehoert damit an EINE
-- Stelle im Repo und an eine im SQL — und beide muessen dieselbe sein.
CREATE OR REPLACE FUNCTION public.angebotstyp_von_leistungsart(p_leistungsart TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE LOWER(COALESCE(p_leistungsart, ''))
    WHEN 'betreuung_45a'      THEN 'betreuungsangebot'
    WHEN 'demenzbetreuung'    THEN 'betreuungsangebot'
    WHEN 'nachtbetreuung'     THEN 'betreuungsangebot'
    WHEN 'wochenendbetreuung' THEN 'betreuungsangebot'
    WHEN 'hauswirtschaft'     THEN 'entlastungsangebot'
    WHEN 'einkaufsservice'    THEN 'entlastungsangebot'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.angebotstyp_von_leistungsart(TEXT) IS
  'Track 12/B3: Zuordnung Leistungsart -> Angebotstyp nach §45a Abs. 1 S. 2 SGB XI. '
  'Spiegelt ANGEBOTSTYP_VON_LEISTUNGSART aus lib/billing/obergrenzen.ts. '
  'NULL heisst: nicht eindeutig — dann gilt die hoechste einschlaegige Grenze.';

CREATE OR REPLACE FUNCTION public.enforce_tariff_obergrenze()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_grenze  RECORD;
  v_typ     TEXT;
  v_zusatz  TEXT := '';
BEGIN
  IF NEW.rechtsgrundlage = 'privat' THEN RETURN NEW; END IF;

  v_typ := public.angebotstyp_von_leistungsart(NEW.leistungsart);

  SELECT o.obergrenze_cent, o.quelle, o.quelle_paragraf, o.bundesland, o.hinweis,
         o.angebotstyp
    INTO v_grenze
    FROM public.billing_gesetzliche_obergrenzen o
   WHERE o.ist_aktiv
     AND o.bestaetigt = TRUE
     AND o.rechtsgrundlage = NEW.rechtsgrundlage
     AND o.verguetungsart  = NEW.verguetungsart
     AND (o.bundesland  IS NULL OR o.bundesland  = NEW.bundesland)
     AND (o.leistungsart IS NULL OR o.leistungsart = NEW.leistungsart)
     AND o.gueltig_ab <= NEW.gueltig_ab
     AND (o.gueltig_bis IS NULL OR o.gueltig_bis >= NEW.gueltig_ab)
     -- DIE EINE neue Bedingung: ist der Angebotstyp der Leistungsart
     -- bekannt, muss die Regel dazu passen (oder fuer alle Typen gelten).
     -- Ist er unbekannt, bleiben alle Typ-Regeln im Rennen — die
     -- Entscheidung faellt dann ueber die Sortierung nach der HOECHSTEN
     -- Grenze weiter unten.
     AND (v_typ IS NULL OR o.angebotstyp IS NULL OR o.angebotstyp = v_typ)
   ORDER BY (o.bundesland  IS NOT NULL) DESC,
            (o.leistungsart IS NOT NULL) DESC,
            (o.angebotstyp  IS NOT NULL) DESC,
            -- Gleichstand-Aufloesung: bei unbekanntem Angebotstyp gewinnt
            -- die mildeste Grenze. Ohne diese Zeile entschiede weiterhin
            -- der Planer, und genau das war der Befund.
            CASE WHEN v_typ IS NULL THEN o.obergrenze_cent ELSE 0 END DESC,
            o.gueltig_ab DESC
   LIMIT 1;

  IF FOUND AND NEW.preis_cent > v_grenze.obergrenze_cent THEN
    IF v_typ IS NULL AND v_grenze.angebotstyp IS NOT NULL THEN
      v_zusatz := format(
        ' Hinweis: fuer die Leistungsart "%s" ist der Angebotstyp nach '
        '§45a Abs. 1 S. 2 SGB XI nicht eindeutig; geprueft wurde gegen die '
        'hoechste einschlaegige Grenze (%s). Eine strengere Grenze kann zutreffen.',
        COALESCE(NEW.leistungsart, '(keine)'), v_grenze.angebotstyp);
    END IF;

    RAISE EXCEPTION
      'OBERGRENZE_UEBERSCHRITTEN: % Cent > % Cent. Rechtsgrundlage: %, Bundesland: %, '
      'Angebotstyp: %, Quelle: % %.%',
      NEW.preis_cent, v_grenze.obergrenze_cent, NEW.rechtsgrundlage,
      COALESCE(v_grenze.bundesland, 'bundesweit'),
      COALESCE(v_grenze.angebotstyp, 'alle'),
      v_grenze.quelle, COALESCE(v_grenze.quelle_paragraf, ''), v_zusatz;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_tariff_obergrenze() IS
  'Track 12/B3: prueft Tarifpreise gegen die PfluV-Obergrenzen — jetzt nach '
  'Angebotstyp getrennt. Vorher konnte der Trigger die 30-EUR- und die '
  '25-EUR-Zeile nicht auseinanderhalten und zog fuer jede §45b-Zeitstunden-'
  'Leistungsart die 30-EUR-Zeile.';

COMMIT;
