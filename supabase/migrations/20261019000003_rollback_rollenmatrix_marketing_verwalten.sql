-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261019000002_rollenmatrix_marketing_verwalten.sql
--
-- Setzt public.rollen_matrix auf den Stand von 20261018000000 zurueck:
-- MIT 'sicherheit.lesen' und 'bonus.verwalten', OHNE 'marketing.verwalten'.
--
-- Der Stand von 20261018000000 ist hier der richtige Bezugspunkt, NICHT
-- der von 20261014000000: die Funktion wird von mehreren Migrationen
-- ganz ersetzt, und ein Rollback auf eine zu alte Fassung naehme der
-- Sicherheitsspur ihre Berechtigung mit weg.
--
-- FOLGE: public.darf('marketing.verwalten') liefert danach fuer JEDE Rolle
-- false. Der Anwendungscode entscheidet weiter ueber lib/auth/rollen.ts —
-- der Spiegel ist dann unvollstaendig. Die marketing_*/email_*-Policies
-- aus 20261019000000 stehen auf is_admin() und sind davon NICHT betroffen.
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
      'bonus.verwalten',
      'sicherheit.lesen'
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
      'bonus.verwalten',
      'sicherheit.lesen'
    ]
    -- Pflegedienstleitung: fuehrt den Betrieb. Rechnungen nur lesen,
    -- Bankdaten/Tarifpflege/Benutzerverwaltung gar nicht.
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
    -- nicht — sonst pruefte es die eigene Korrektur.
    WHEN 'qm' THEN ARRAY[
      'stammdaten.lesen',
      'personal.lesen',
      'einsatz.lesen',
      'pflege.lesen',
      'qm.lesen','qm.schreiben',
      'audit.lesen','berichte.lesen'
    ]
    -- Buchhaltung: Geld ja, Gesundheitsdaten nein.
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
