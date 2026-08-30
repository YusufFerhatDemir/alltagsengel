-- ═══════════════════════════════════════════════════════════════════════
-- Rollenmatrix: neue Berechtigung 'marketing.verwalten'
--
-- WARUM
-- Die Marketing-/CRM-Schicht (20261019000000) entscheidet ueber die
-- AUSSENWIRKUNG gegenueber der gesamten Kundschaft: wer eine Kampagne
-- freigibt, schreibt in einem Zug jeden Empfaenger im Segment an, und
-- eine rausgegangene Mail holt niemand zurueck. Wer zusaetzlich die
-- Einwilligungen pflegen kann, kann die Grundlage erzeugen, auf die er
-- sich beim Versand beruft.
--
-- Das ist derselbe Zuschnitt wie bei 'bonus.verwalten' (20261014000000)
-- und aus demselben Grund ein Vorbehalt der Administration: die
-- marketing_*- und email_*-Policies stehen live auf is_admin(), also
-- admin|superadmin. Ohne eigene Berechtigung liefe die Schnittstelle der
-- Datenbank voraus — Lesewege gaeben eine LEERE Liste ohne Fehler
-- zurueck, Schreibwege einen 'Internen Serverfehler' statt eines
-- ehrlichen 403.
--
-- WAS DIESE MIGRATION TUT
-- Sie ergaenzt ausschliesslich den SQL-Spiegel der Rollenmatrix, damit
-- public.darf('marketing.verwalten') dieselbe Antwort gibt wie
-- hatBerechtigung() in lib/auth/rollen.ts.
--
-- KEINE VERHALTENSAENDERUNG AN DEN POLICIES. Die Policies aus
-- 20261019000000 sagen mit is_admin() bereits dasselbe.
--
-- ── ACHTUNG: DIESE FUNKTION WIRD VON MEHREREN MIGRATIONEN ERSETZT ─────
-- CREATE OR REPLACE ersetzt die GANZE Funktion, nicht eine Zeile darin.
-- Die zuletzt angewendete Fassung gewinnt. Diese hier fuehrt deshalb
-- auch 'sicherheit.lesen' mit (Migration 20261018000000) — sonst naehme
-- eine Anwendung in der Reihenfolge 20261018 → 20261019 der
-- Sicherheitsspur ihre Berechtigung wieder weg. Wer kuenftig eine
-- Berechtigung ergaenzt, uebernimmt die VOLLSTAENDIGE Liste aus
-- lib/auth/rollen.ts und verlaesst sich nicht auf die letzte Migration,
-- die er zufaellig gelesen hat.
--
-- Rollback: 20261019000003_rollback_rollenmatrix_marketing_verwalten.sql
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
      'sicherheit.lesen',
      'marketing.verwalten'
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
      'sicherheit.lesen',
      'marketing.verwalten'
    ]
    -- Pflegedienstleitung: fuehrt den Betrieb. Werbepost gehoert nicht
    -- dazu — sie richtet sich an Menschen, die (noch) keine Klienten
    -- sind, und ihre Grenzen sind wettbewerbs- und datenschutzrechtlich,
    -- nicht pflegefachlich.
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
    -- Buchhaltung: Geld ja, Werbung nein.
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
  'aendert, aendert es dort mit. bonus.verwalten und marketing.verwalten '
  'stehen unter dem Vorbehalt der Administration (NUR_ADMINISTRATION).';
