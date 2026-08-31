-- ═══════════════════════════════════════════════════════════════════════
-- Kontoueberwachung: Frist und Zweck bekommen eigene Spalten
--
-- NICHT ANGEWENDET (Stand 31.08.2026). Rollback: 20261024000001.
-- Anwenden im Supabase-SQL-Editor als `postgres`.
--
-- ─────────────────────────────────────────────────────────────────────
-- BEFUND — eine Ueberwachung ohne Ende ist Dauerueberwachung
-- ─────────────────────────────────────────────────────────────────────
-- `security_watchlist` hatte am 31.08.2026 diese Spalten:
--
--   id, user_id, organization_id, aktiv, melde_email, grund,
--   angelegt_von, created_at, alle_ereignisse, ohne_sperrfrist,
--   email_kontrolle
--
-- Keine davon beschreibt einen ZEITRAUM. Ein einmal gesetzter Eintrag
-- zeichnet die Anmeldungen, Geraete und IP-Adressen einer namentlich
-- bekannten Person auf, bis jemand daran denkt, ihn abzuschalten. Live
-- stand genau ein solcher Eintrag, gesetzt am 30.08.2026.
--
-- Das ist der Unterschied zwischen einer anlassbezogenen Massnahme und
-- einer dauerhaften Beobachtung eines Beschaeftigten. Art. 5 Abs. 1
-- lit. e DSGVO (Speicherbegrenzung) und § 26 BDSG verlangen den Anlass
-- UND seine zeitliche Begrenzung.
--
-- Ebenso wenig gab es Felder fuer Zweck, Rechtsgrundlage und
-- Transparenz. Es gab `grund` (Freitext, mindestens 40 Zeichen) — ein
-- Fliesstext ueber 40 Zeichen erfuellte die Huerde, ohne zu sagen,
-- WOZU beobachtet wird und WORAUF sich das stuetzt.
--
-- ─────────────────────────────────────────────────────────────────────
-- WAS SEIT DEM 31.08.2026 SCHON GILT — OHNE DIESE MIGRATION
-- ─────────────────────────────────────────────────────────────────────
-- Die Wirkung ist bereits da, im Anwendungscode:
--
--   lib/security/befristung.ts   leitet die Frist aus `created_at` +
--                                HOECHSTDAUER_TAGE (90) ab und verlangt
--                                die vier Angaben als Textmarken im
--                                Begruendungsfeld.
--   lib/security/watchlist.ts    nimmt abgelaufene Eintraege gar nicht
--                                erst in die aktive Menge auf
--                                (ladeAktive) und weist eine Begruendung
--                                ohne die vier Angaben ab
--                                (setzeUeberwachung).
--
-- Das war Absicht und keine Zwischenloesung aus Bequemlichkeit: DDL ist
-- ueber den Dienstschluessel gesperrt (42501), diese Datei wartet also
-- auf einen Menschen. Waere die Frist erst mit ihr gekommen, gaebe es
-- bis dahin gar keine — und genau das sollte abgestellt werden.
--
-- ─────────────────────────────────────────────────────────────────────
-- WAS DIESE MIGRATION HINZUFUEGT
-- ─────────────────────────────────────────────────────────────────────
--  1. `befristet_bis` — das ausdrueckliche Ende. Damit laesst sich eine
--     Massnahme KUERZER anordnen als die Hoechstdauer, was heute nicht
--     geht: aus `created_at` folgt immer dieselbe Spanne.
--  2. `zweck`, `rechtsgrundlage`, `person_informiert_am` — die drei
--     Angaben, die bisher als Textmarken im Freitext stehen.
--  3. Ein CHECK, der einen AKTIVEN Eintrag ohne `befristet_bis` gar
--     nicht erst entstehen laesst.
--
-- Die 90-Tage-Regel aus dem Anwendungscode bleibt danach als
-- OBERGRENZE bestehen: `befristet_bis` darf frueher liegen, nie
-- spaeter. So kann eine Migration die Frist nicht versehentlich
-- verlaengern.
--
-- ─────────────────────────────────────────────────────────────────────
-- WIRKUNG AUF DEN BESTAND
-- ─────────────────────────────────────────────────────────────────────
-- Der eine aktive Eintrag bekommt `befristet_bis` auf
-- created_at + 90 Tage — also genau das Datum, das der Anwendungscode
-- heute schon annimmt. Nichts wird dadurch laenger oder kuerzer
-- ueberwacht; die Regel wird nur explizit.
--
-- `zweck` und `rechtsgrundlage` bleiben beim Bestand NULL. Sie
-- nachzutragen waere eine Erfindung — was damals gemeint war, steht
-- allein im Freitext, und niemand kann es hinterher zuordnen.
--
-- NACHWEIS NACH DEM ANWENDEN
--     npm run verify:ueberwachung   → U3 und U4 muessen auf OK springen
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.security_watchlist
  ADD COLUMN IF NOT EXISTS befristet_bis        timestamptz,
  ADD COLUMN IF NOT EXISTS zweck                text,
  ADD COLUMN IF NOT EXISTS rechtsgrundlage      text,
  ADD COLUMN IF NOT EXISTS person_informiert_am date;

COMMENT ON COLUMN public.security_watchlist.befristet_bis IS
  'Ende der Massnahme. Ein aktiver Eintrag ohne dieses Datum ist nicht '
  'zulaessig (CHECK security_watchlist_aktiv_braucht_frist). Die Anwendung '
  'setzt zusaetzlich eine Obergrenze von 90 Tagen ab created_at.';
COMMENT ON COLUMN public.security_watchlist.zweck IS
  'Der konkrete Anlass — was genau geklaert werden soll.';
COMMENT ON COLUMN public.security_watchlist.rechtsgrundlage IS
  'Worauf sich die Massnahme stuetzt, z. B. Art. 6 Abs. 1 lit. f DSGVO, § 26 BDSG.';
COMMENT ON COLUMN public.security_watchlist.person_informiert_am IS
  'Wann die betroffene Person informiert wurde. NULL heisst NICHT „verdeckt", '
  'sondern „nicht dokumentiert" — und ist damit selbst ein Befund.';

-- Bestand: die Frist explizit machen, ohne sie zu veraendern.
UPDATE public.security_watchlist
   SET befristet_bis = created_at + INTERVAL '90 days'
 WHERE befristet_bis IS NULL;

-- Der Riegel. NOT VALID waere hier falsch: es gibt nur eine Handvoll
-- Zeilen, und ein Constraint, der den Bestand nicht prueft, ist an einer
-- Stelle wie dieser eine Beruhigung ohne Deckung.
ALTER TABLE public.security_watchlist
  DROP CONSTRAINT IF EXISTS security_watchlist_aktiv_braucht_frist;
ALTER TABLE public.security_watchlist
  ADD CONSTRAINT security_watchlist_aktiv_braucht_frist
  CHECK (aktiv IS NOT TRUE OR befristet_bis IS NOT NULL);
