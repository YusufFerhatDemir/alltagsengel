-- ═══════════════════════════════════════════════════════════════════════
-- Rollenmatrix: neue Berechtigung 'bonus.verwalten'
-- ═══════════════════════════════════════════════════════════════════════
--
-- WARUM
-- Das Bonusmodul (Block 19, Tabellen bonus_regeln / bonus_berechnungen /
-- bonus_freigaben) entscheidet ueber die VERGUETUNG von Mitarbeitenden:
-- wer die Regel schreibt, bestimmt wer eine Praemie bekommt, und wer
-- freigibt, loest die Zahlung aus.
--
-- Bis hierher gaben drei Stellen drei verschiedene Antworten auf die
-- Frage, wer das darf:
--
--   1. Oberflaeche  /admin/bonuses            -> personal.lesen/.schreiben
--                                                (admin + pdl)
--   2. Schnittstelle /api/admin/analytics/... -> berichte.lesen
--                                                (admin + pdl + qm + buchhaltung)
--   3. Datenbank     bonus_*-Policies         -> is_admin()
--                                                (admin + superadmin)
--
-- Die Datenbank gilt. Fuer die Rollen dazwischen bedeutete der Unterschied
-- keinen zusaetzlichen Zugriff, aber eine falsche Auskunft: Lesewege gaben
-- eine LEERE Liste ohne Fehler zurueck (RLS filtert zeilenweise), Schreib-
-- wege einen 'Internen Serverfehler' (42501 durch den Sanitizer) — statt
-- eines ehrlichen 403. Dieselbe Klasse wie bei den QM/PDL-Dashboards
-- (d707cda) und beim Angehoerigenportal (48d6f3b).
--
-- WAS DIESE MIGRATION TUT
-- Sie ergaenzt ausschliesslich den SQL-Spiegel der Rollenmatrix, damit
-- public.darf('bonus.verwalten') dieselbe Antwort gibt wie
-- hatBerechtigung() in lib/auth/rollen.ts. Die Berechtigung geht nur an
-- admin und superadmin (Vorbehalt der Administration, NUR_ADMINISTRATION).
--
-- KEINE VERHALTENSAENDERUNG AN DEN POLICIES
-- Die bonus_*-Policies bleiben unangetastet auf is_admin(). Sie sagen
-- bereits dasselbe. Diese Migration ist deshalb NICHT Voraussetzung
-- fuer die Wirksamkeit der Haertung im Anwendungscode — sie haelt nur den
-- Spiegel vollstaendig, damit eine kuenftige Policy public.darf(...)
-- benutzen kann, ohne fail-closed ins Leere zu laufen.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rollen_matrix(p_rolle text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_rolle
    WHEN 'superadmin' THEN ARRAY[
      'stammdaten.lesen','stammdaten.schreiben',
      'personal.lesen','personal.schreiben',
      'einsatz.lesen','einsatz.schreiben',
      'pflege.lesen','pflege.schreiben',
      'qm.lesen','qm.schreiben',
      'abrechnung.lesen','abrechnung.schreiben',
      'bankdaten.lesen','bankdaten.schreiben',
      'tarife.lesen','tarife.schreiben',
      'audit.lesen','benutzer.verwalten','system.verwalten','berichte.lesen',
      'bonus.verwalten'
    ]
    WHEN 'admin' THEN ARRAY[
      'stammdaten.lesen','stammdaten.schreiben',
      'personal.lesen','personal.schreiben',
      'einsatz.lesen','einsatz.schreiben',
      'pflege.lesen','pflege.schreiben',
      'qm.lesen','qm.schreiben',
      'abrechnung.lesen','abrechnung.schreiben',
      'bankdaten.lesen','bankdaten.schreiben',
      'tarife.lesen','tarife.schreiben',
      'audit.lesen','benutzer.verwalten','system.verwalten','berichte.lesen',
      'bonus.verwalten'
    ]
    -- Pflegedienstleitung: fuehrt den Betrieb. Rechnungen nur lesen,
    -- Bankdaten/Tarifpflege/Benutzerverwaltung gar nicht. Boni ebenfalls
    -- nicht: die PDL beurteilt die Leistung, die Praemie darauf ist eine
    -- Verguetungsentscheidung der Geschaeftsfuehrung.
    WHEN 'pdl' THEN ARRAY[
      'stammdaten.lesen','stammdaten.schreiben',
      'personal.lesen','personal.schreiben',
      'einsatz.lesen','einsatz.schreiben',
      'pflege.lesen','pflege.schreiben',
      'qm.lesen','qm.schreiben',
      'abrechnung.lesen',
      'tarife.lesen',
      'audit.lesen','berichte.lesen'
    ]
    -- Qualitaetsmanagement: prueft, aendert die geprueften Daten aber
    -- nicht — sonst pruefte es die eigene Korrektur. Die Bonuskriterien
    -- speisen sich aus genau diesen Pruefdaten (review_errors); wer sie
    -- pflegt, darf ueber die Praemie darauf nicht entscheiden.
    WHEN 'qm' THEN ARRAY[
      'stammdaten.lesen',
      'personal.lesen',
      'einsatz.lesen',
      'pflege.lesen',
      'qm.lesen','qm.schreiben',
      'audit.lesen','berichte.lesen'
    ]
    -- Buchhaltung: Geld ja, Gesundheitsdaten nein. Praemien sind Lohn,
    -- keine Buchung — die Entscheidung faellt vor der Buchung.
    WHEN 'buchhaltung' THEN ARRAY[
      'stammdaten.lesen',
      'einsatz.lesen',
      'abrechnung.lesen','abrechnung.schreiben',
      'bankdaten.lesen','bankdaten.schreiben',
      'tarife.lesen',
      'audit.lesen','berichte.lesen'
    ]
    -- engel/fahrer/kunde/angehoerige und alles Unbekannte: nichts.
    ELSE ARRAY[]::text[]
  END;
$$;

COMMENT ON FUNCTION public.rollen_matrix(text) IS
  'Spiegel von ROLLEN_MATRIX in lib/auth/rollen.ts. Wer hier etwas '
  'aendert, aendert es dort mit. bonus.verwalten steht unter dem '
  'Vorbehalt der Administration (NUR_ADMINISTRATION).';
