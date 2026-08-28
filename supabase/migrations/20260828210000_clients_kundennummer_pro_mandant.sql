-- ═══════════════════════════════════════════════════════════════════════
-- Kundennummer ist pro MANDANT eindeutig, nicht global
--
-- Rollback: 20260828210001.
--
-- ─────────────────────────────────────────────────────────────────────
-- BEFUND (live nachgemessen 28.08.2026, beim Schreiben des E2E-Prueflaufs
-- fuer die Kundenverwaltung aufgefallen)
-- ─────────────────────────────────────────────────────────────────────
-- Auf `clients` liegt live genau EIN eindeutiger Index neben dem
-- Primaerschluessel:
--
--   clients_customer_number_key UNIQUE (customer_number)
--
-- Also GLOBAL ueber alle Mandanten. `app/api/admin/clients` (POST) prueft
-- dagegen mandantenweise:
--
--   .eq('customer_number', …).eq('organization_id', auth.organizationId)
--
-- Die Vorpruefung und der Index beantworten damit VERSCHIEDENE Fragen.
-- Drei Folgen:
--
--   1. Ein Mandant kann eine Kundennummer nicht vergeben, wenn ein ANDERER
--      Mandant sie schon fuehrt. Fuer ihn sieht das aus wie ein Fehler ohne
--      Ursache — seine eigene Liste ist leer.
--   2. Die Vorpruefung meldet „frei", der INSERT scheitert danach mit
--      23505. Die Route reicht `insertError.message` als 500 durch; darin
--      steht der Constraint-Name UND die Nummer. Damit laesst sich von
--      aussen feststellen, dass eine bestimmte Kundennummer irgendwo im
--      System existiert — ueber die Mandantengrenze hinweg.
--   3. `generateCustomerNumber()` haengt vier Zufallsziffern an
--      `KD-JJMM-`. Der Raum ist 9000 Nummern PRO MONAT ueber ALLE
--      Mandanten zusammen. Mit wachsender Mandantenzahl wird die
--      Kollision zum Normalfall — und sie trifft die automatische
--      Anlage, nicht nur die manuell vergebene Nummer.
--
-- Live sind es heute 4 Klienten in 1 Organisation mit 4 verschiedenen
-- Nummern, also 0 verletzte Zeilen — die Umstellung ist gefahrlos, und
-- genau deshalb gehoert sie jetzt gemacht und nicht erst beim zweiten
-- Mandanten mit Bestand.
--
-- Die Kundennummer ist ein Ordnungsmerkmal DES MANDANTEN, so wie die
-- Rechnungsnummer. Dass zwei Betriebe unabhaengig voneinander bei KD-001
-- anfangen, ist der Normalfall und kein Konflikt.
--
-- HINWEIS zur Route: der Anwendungscode ist im selben Zug gegen 23505
-- abgesichert worden und faengt den Fall auch OHNE diese Migration
-- kontrolliert ab (neutrale 409 statt roher 500, und eine automatisch
-- erzeugte Nummer wird neu gezogen). Die Migration beseitigt die Ursache,
-- der Code die Wirkung — beides, weil eins allein hier zu wenig ist.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- Sicherung: bricht ab, falls es doch eine Kollision ueber Mandanten gibt.
-- Lieber ein lauter Abbruch als ein stiller Teilerfolg.
DO $$
DECLARE v_kollisionen INTEGER;
BEGIN
  SELECT count(*) INTO v_kollisionen FROM (
    SELECT customer_number
      FROM public.clients
     WHERE customer_number IS NOT NULL
     GROUP BY organization_id, customer_number
    HAVING count(*) > 1
  ) t;
  IF v_kollisionen > 0 THEN
    RAISE EXCEPTION
      'Abbruch: % Kundennummern kommen innerhalb EINES Mandanten mehrfach vor. '
      'Der neue Index waere nicht anlegbar; bitte zuerst bereinigen.', v_kollisionen;
  END IF;
END $$;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_customer_number_key;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_kundennummer_pro_mandant
  UNIQUE (organization_id, customer_number);

COMMENT ON CONSTRAINT clients_kundennummer_pro_mandant ON public.clients IS
  'Die Kundennummer ist ein Ordnungsmerkmal des Mandanten. Der frueher hier '
  'liegende globale Index clients_customer_number_key liess zwei Betriebe '
  'nicht unabhaengig voneinander nummerieren und verriet ueber die '
  'Fehlermeldung, dass eine Nummer anderswo existiert.';

COMMIT;
