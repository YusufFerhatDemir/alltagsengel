-- Rollback zu 20261010000006_kim_audit_anhang_abgewiesen.sql
--
-- ACHTUNG: Bestandszeilen mit aktion = 'anhang_abgewiesen' verletzen den
-- wiederhergestellten Constraint. Sie werden deshalb zuvor entfernt — es
-- sind reine Protokollzeilen ueber verworfene Anhaenge, keine Nutzdaten.
DELETE FROM public.kim_audit_log WHERE aktion = 'anhang_abgewiesen';

ALTER TABLE public.kim_audit_log
  DROP CONSTRAINT IF EXISTS kim_audit_log_aktion_check;

ALTER TABLE public.kim_audit_log
  ADD CONSTRAINT kim_audit_log_aktion_check
  CHECK (aktion IN (
    'erstellt', 'bearbeitet', 'gesendet', 'sendefehler',
    'zugestellt', 'gelesen', 'storniert', 'wiederholt',
    'empfangen', 'anhang_hochgeladen', 'anhang_heruntergeladen',
    'adresse_angelegt', 'adresse_geaendert', 'adresse_verifiziert',
    'provider_konfiguriert'
  ));
