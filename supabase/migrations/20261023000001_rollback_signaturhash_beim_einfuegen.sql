-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261023000000_signaturhash_beim_einfuegen.sql
--
-- Stellt den Stand vom 31.08.2026 wieder her: der Trigger feuert nur bei
-- UPDATE, und ein beim Einfuegen mitgelieferter signature_hash bleibt
-- unangetastet stehen.
--
-- ACHTUNG: Zeilen, die WAEHREND der Gueltigkeit der Migration per INSERT
-- versiegelt wurden, behalten ihren Hash und ihre Sperre. Das ist richtig
-- so — das Siegel wurde damals korrekt berechnet, und ein Rollback der
-- Regel macht eine vergangene Unterschrift nicht ungueltig.
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.compute_signature_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.proof_status = 'UNTERSCHRIEBEN' AND NEW.client_signed_at IS NOT NULL THEN
    NEW.signature_hash := encode(
      extensions.digest(
        COALESCE(NEW.id::text, '') || '|' ||
        COALESCE(NEW.client_id::text, '') || '|' ||
        COALESCE(NEW.date::text, '') || '|' ||
        COALESCE(NEW.start_time::text, '') || '|' ||
        COALESCE(NEW.end_time::text, '') || '|' ||
        COALESCE(NEW.amount::text, '') || '|' ||
        COALESCE(NEW.client_signed_at::text, ''),
        'sha256'
      ),
      'hex'
    );
    NEW.is_locked := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_signature_hash ON public.service_records;

CREATE TRIGGER trg_compute_signature_hash
  BEFORE UPDATE ON public.service_records
  FOR EACH ROW
  EXECUTE FUNCTION public.compute_signature_hash();
