-- ════════════════════════════════════════════════════════════════════
-- RUECKNAHME zu 20260829200000
-- ════════════════════════════════════════════════════════════════════
--
-- Stellt den Stand von 20260829011500 wieder her: der Vergleich nimmt
-- generierte Spalten wieder mit.
--
-- WARNUNG: mit diesem Stand ist der Weg Unterschrift -> Rechnung ZU.
-- `service_records.duration_minutes` ist generiert und steht im
-- BEFORE-Trigger in NEW auf NULL; der Vergleich findet daher immer einen
-- Unterschied und `create_invoice_draft_atomic` rollt zurueck. Diese
-- Ruecknahme gehoert nur ausgefuehrt, wenn 20260829200000 selbst einen
-- Schaden anrichtet — nicht, um „auf den alten Stand" zu kommen.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_locked_record_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_alt jsonb;
  v_neu jsonb;
BEGIN
  IF OLD.is_locked = true THEN
    IF NEW.proof_status = 'STORNIERT' THEN
      RETURN NEW;
    END IF;

    IF NEW.is_locked IS DISTINCT FROM OLD.is_locked AND NEW.is_locked = false THEN
      IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')) THEN
        RETURN NEW;
      END IF;
    END IF;

    IF NEW.status = 'invoiced' AND OLD.status IN ('signed', 'complete') THEN
      v_alt := to_jsonb(OLD) - 'status' - 'updated_at';
      v_neu := to_jsonb(NEW) - 'status' - 'updated_at';
      IF v_alt = v_neu THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION
        'Ein gesperrter Leistungsnachweis darf beim Abrechnen NUR den Status erhalten.'
        USING HINT = 'Es wurde neben status noch mindestens ein weiteres Feld geaendert.';
    END IF;

    RAISE EXCEPTION 'Leistungsnachweis ist gesperrt -- Aenderungen sind nicht mehr moeglich.'
      USING HINT = 'Manipulationsschutz aktiv';
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
