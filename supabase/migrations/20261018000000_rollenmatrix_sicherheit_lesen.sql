-- ════════════════════════════════════════════════════════════════════
-- Rollenmatrix: neue Berechtigung 'sicherheit.lesen'
-- ════════════════════════════════════════════════════════════════════
--
-- Eigene Migration, obwohl sie nur zwei Zeilen aendert. Grund: die
-- Berechtigungsmatrix ist eine GETEILTE Funktion, und
-- __tests__/security/rollenkonzept-pglite.test.ts prueft sie Zelle fuer
-- Zelle gegen ROLLEN_MATRIX in lib/auth/rollen.ts. Diese Pruefung laeuft
-- in einer minimalen Umgebung ohne organizations- und auth.users-Tabelle
-- — eine Matrix-Aenderung, die in der grossen Tabellen-Migration
-- steckte, koennte dort nicht mitgefahren werden und der Gleichstand
-- SQL ↔ TypeScript bliebe ungeprueft.
--
-- Gleiche Bauart wie 20261014000000_rollenmatrix_bonus_verwalten.sql.
--
-- Die Tabelle security_audit_log und alles Weitere liegt in
-- 20261018000002_security_audit_log.sql.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1) Rollenmatrix: neue Berechtigung 'sicherheit.lesen'
-- ─────────────────────────────────────────────────────────────────────
-- Die Aufgabe verlangt „nur service_role und eine explizite
-- Security-Admin-Rolle". Statt einer neunten Kontorolle bekommt das
-- Rollenkonzept eine neue BERECHTIGUNG — das ist dieselbe Aussage, ohne
-- eine zweite Rollenhierarchie neben der bestehenden aufzumachen:
--
--   'audit.lesen'      — die fachliche Revisionsspur (pdl, qm,
--                        buchhaltung sehen sie, sie brauchen sie fuer
--                        ihre Arbeit).
--   'sicherheit.lesen' — die Sicherheitsspur. NUR Administration.
--                        Hier stehen IP-Adressen, Geraete und
--                        Anmeldeverhalten von Kolleginnen und Kollegen;
--                        das ist Mitarbeiterueberwachungs-Material und
--                        gehoert nicht in die Fachrollen.
--
-- Spiegel von NUR_ADMINISTRATION in lib/auth/rollen.ts. Der Gleichstand
-- SQL ↔ TypeScript wird in __tests__/security/rollenkonzept-pglite.test.ts
-- Zelle fuer Zelle geprueft.
--
-- ACHTUNG, GETEILTE FUNKTION: public.rollen_matrix wird von jeder
-- Migration, die eine Berechtigung ergaenzt, VOLLSTAENDIG neu gesetzt.
-- Die zuletzt angewendete Fassung gewinnt. Diese hier fuehrt deshalb
-- auch 'marketing.verwalten' mit (Block 20, Migration 20261019000002) —
-- sonst naehme eine Anwendung in der Reihenfolge 20261019 → 20261018 dem
-- Marketing-Modul seine Berechtigung wieder weg. Wer kuenftig eine
-- Berechtigung ergaenzt, uebernimmt die vollstaendige Liste aus
-- lib/auth/rollen.ts und verlaesst sich nicht auf die letzte Migration,
-- die er zufaellig gelesen hat.
--
-- Die Policies dieser Migration haengen NICHT allein an rollen_matrix,
-- sondern an public.ist_sicherheitsadmin() (Abschnitt 2a). Damit bleibt
-- die Sicherheitsspur auch dann lesbar, wenn eine spaetere Migration die
-- Matrix versehentlich ohne 'sicherheit.lesen' neu setzt.
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
      'marketing.verwalten',
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
      'marketing.verwalten',
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

COMMIT;
