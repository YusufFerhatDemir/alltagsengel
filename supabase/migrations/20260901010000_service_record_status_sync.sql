-- ═══════════════════════════════════════════════════════════════════
-- Leistungsnachweis: status ↔ proof_status synchron halten
-- ═══════════════════════════════════════════════════════════════════
--
-- BEFUND
-- service_records führt zwei Statusfelder nebeneinander:
--
--   status        ('draft','incomplete','complete','signed','invoiced')
--                 — das Feld, auf das der Rest des Systems hört:
--                   • create_invoice_draft_atomic() nimmt ausschliesslich
--                     Nachweise mit status IN ('signed','complete') auf
--                   • der used_amount-Trigger auf client_budgets zählt nur
--                     Einsätze mit status <> 'draft'
--                   • die Admin-Oberflächen rendern RECORD_STATUS[status]
--
--   proof_status  ('ENTWURF','ABGESCHLOSSEN','UNTERSCHRIEBEN','ABGERECHNET',
--                  'STORNIERT')
--                 — das Nachweis-Feld aus Migration 20260808200000
--
-- Der Signatur-Flow schrieb nur proof_status. Ein unterschriebener Nachweis
-- blieb dadurch auf status='draft' stehen: er wirkte offen, wurde nie in eine
-- Rechnung aufgenommen und belastete kein Budget.
--
-- FIX
-- Ein BEFORE-INSERT/UPDATE-Trigger leitet status aus proof_status ab —
-- MONOTON VORWÄRTS. Ein bereits abgerechneter Nachweis (status='invoiced')
-- fällt durch einen nachlaufenden proof_status-Schreibvorgang nicht auf
-- 'signed' zurück, ein manuell auf 'incomplete' gesetzter Entwurf nicht auf
-- 'draft'.
--
--   ENTWURF        → draft
--   ABGESCHLOSSEN  → complete
--   UNTERSCHRIEBEN → signed
--   ABGERECHNET    → invoiced
--   STORNIERT      → kein Gegenstück; status bleibt unverändert
--                    (service_records_status_check kennt keinen Storno-Wert,
--                     die Stornierung läuft über billing_status)
--
-- Die Anwendung setzt status zusätzlich selbst
-- (lib/leistungsnachweis/status-sync.ts) — der Trigger ist die Absicherung
-- für Schreibpfade ausserhalb der Anwendung (RPCs, Backfills, SQL-Editor).
--
-- TRIGGER-REIHENFOLGE: BEFORE-Trigger feuern alphabetisch nach Triggernamen.
-- trg_sync_record_status läuft damit NACH trg_compute_signature_hash und
-- trg_prevent_locked_record — es wird also nur noch NEW.status gesetzt,
-- nachdem der Sperrschutz entschieden hat.
--
-- Rollback: 20260901010001_rollback_service_record_status_sync.sql
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_service_record_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ziel      text;
  v_rang_ziel int;
  v_rang_ist  int;
BEGIN
  v_ziel := CASE NEW.proof_status
    WHEN 'ENTWURF'        THEN 'draft'
    WHEN 'ABGESCHLOSSEN'  THEN 'complete'
    WHEN 'UNTERSCHRIEBEN' THEN 'signed'
    WHEN 'ABGERECHNET'    THEN 'invoiced'
    ELSE NULL   -- 'STORNIERT', NULL, unbekannt → status unverändert lassen
  END;

  IF v_ziel IS NULL THEN
    RETURN NEW;
  END IF;

  v_rang_ziel := CASE v_ziel
    WHEN 'draft' THEN 0 WHEN 'incomplete' THEN 1 WHEN 'complete' THEN 2
    WHEN 'signed' THEN 3 WHEN 'invoiced' THEN 4 END;

  v_rang_ist := CASE NEW.status
    WHEN 'draft' THEN 0 WHEN 'incomplete' THEN 1 WHEN 'complete' THEN 2
    WHEN 'signed' THEN 3 WHEN 'invoiced' THEN 4
    ELSE -1   -- NULL oder Altwert ausserhalb des Wertesets → immer vorsetzen
  END;

  -- Nur echt vorwärts. Nie zurück.
  IF v_rang_ziel > v_rang_ist THEN
    NEW.status := v_ziel;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_service_record_status() IS
  'Leitet service_records.status monoton vorwärts aus proof_status ab. '
  'STORNIERT bleibt ohne status-Gegenstück (läuft über billing_status).';

DROP TRIGGER IF EXISTS trg_sync_record_status ON public.service_records;
CREATE TRIGGER trg_sync_record_status
  BEFORE INSERT OR UPDATE ON public.service_records
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_service_record_status();

-- ═══════════════════════════════════════════════════════════════════
-- BESTANDSDATEN: bereits desynchronisierte Nachweise nachziehen
-- ═══════════════════════════════════════════════════════════════════
-- Nur vorwärts (dieselbe Rangregel wie im Trigger). is_locked-Zeilen sind
-- eingeschlossen: prevent_locked_record_change() ist ein BEFORE-UPDATE-
-- Trigger, der hier greifen würde — deshalb wird er für diese eine
-- Bestandskorrektur kurz deaktiviert und danach wieder aktiviert.
-- (Der Nachweis-Inhalt bleibt unberührt; korrigiert wird ausschliesslich das
--  abgeleitete status-Feld, nicht Betrag, Zeit oder Signatur-Hash.)

ALTER TABLE public.service_records DISABLE TRIGGER trg_prevent_locked_record;

UPDATE public.service_records
   SET status = 'complete'
 WHERE proof_status = 'ABGESCHLOSSEN'
   AND (status IS NULL OR status IN ('draft', 'incomplete'));

UPDATE public.service_records
   SET status = 'signed'
 WHERE proof_status = 'UNTERSCHRIEBEN'
   AND (status IS NULL OR status IN ('draft', 'incomplete', 'complete'));

UPDATE public.service_records
   SET status = 'invoiced'
 WHERE proof_status = 'ABGERECHNET'
   AND (status IS NULL OR status IN ('draft', 'incomplete', 'complete', 'signed'));

ALTER TABLE public.service_records ENABLE TRIGGER trg_prevent_locked_record;

COMMIT;
