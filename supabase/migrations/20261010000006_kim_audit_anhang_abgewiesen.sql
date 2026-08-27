-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: KIM-Audit-Aktion 'anhang_abgewiesen' zulassen
-- Datum:     2026-10-10
-- Projekt:   Alltagsengel UG
-- ═══════════════════════════════════════════════════════════════════════════
-- BEFUND: lib/kim/inbox-service.ts brach den gesamten Postfach-Abruf ab,
-- sobald EIN eingehender Anhang die Pruefung in lib/kim/attachment-service.ts
-- nicht bestand (unzulaessiger MIME-Typ, leer, zu gross, Inhalt passt nicht
-- zum angegebenen Typ). Inhalt und Typ bestimmt dabei das absendende
-- Fremdsystem — ein einziger praeparierter Anhang legte damit das KIM-
-- Postfach dauerhaft still: die Nachricht wurde beim naechsten Lauf erneut
-- geholt und riss den Abruf erneut mit.
--
-- Der Empfangsweg verwirft einen solchen Anhang jetzt und verarbeitet die
-- Nachricht weiter. Damit dieser Verwurf nachvollziehbar bleibt (und nicht
-- still passiert), schreibt er einen Audit-Eintrag — dessen Aktion der
-- CHECK-Constraint aus 20260919000000_kim_ti_messaging.sql bisher nicht
-- kennt. writeKimAuditLog() ist fail-soft: ohne diese Migration wird der
-- Verwurf also nicht blockiert, aber auch NICHT protokolliert.
--
-- IDEMPOTENT: DROP CONSTRAINT IF EXISTS + ADD, keine Datenaenderung.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.kim_audit_log
  DROP CONSTRAINT IF EXISTS kim_audit_log_aktion_check;

ALTER TABLE public.kim_audit_log
  ADD CONSTRAINT kim_audit_log_aktion_check
  CHECK (aktion IN (
    'erstellt', 'bearbeitet', 'gesendet', 'sendefehler',
    'zugestellt', 'gelesen', 'storniert', 'wiederholt',
    'empfangen', 'anhang_hochgeladen', 'anhang_heruntergeladen',
    'adresse_angelegt', 'adresse_geaendert', 'adresse_verifiziert',
    'provider_konfiguriert',
    -- neu: eingehender Anhang wurde bei der Pruefung verworfen
    'anhang_abgewiesen'
  ));
