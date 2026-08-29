-- ════════════════════════════════════════════════════════════════════
-- Abschreiben hob die Unveränderlichkeit der Rechnung auf
-- ════════════════════════════════════════════════════════════════════
--
-- BEFUND (29.08.2026, live aus `pg_get_functiondef` gelesen, nicht aus der
-- Migrationsdatei geschlossen):
--
-- `prevent_finalized_invoice_mutation` schützt die fachlichen Felder einer
-- Rechnung — Betrag, Zeitraum, Kunde, Kostenträger, Rechnungsnummer — sobald
-- ihr Status festgeschrieben ist. Die Liste dieser Status stammt aus der
-- Statusmaschine und zählt zwölf deutsche plus fünf Alt-Werte auf.
--
-- `abgeschrieben` fehlt darin. Und `abgeschrieben` ist die einzige Ausnahme,
-- die nicht bloß eine Lücke ist, sondern eine RÜCKNAHME:
--
--     IF OLD.status NOT IN (…) THEN
--       RETURN NEW;      -- ← keine Prüfung
--     END IF;
--
-- Eine Rechnung, die als `freigegeben` geschützt war, verliert diesen Schutz
-- in dem Augenblick, in dem sie abgeschrieben wird. Danach lassen sich
-- `total_amount`, `invoice_number` oder `client_id` an ihr ändern, ohne dass
-- irgendetwas hält. Bei jedem anderen Endstatus — `bezahlt`, `akzeptiert`,
-- `storniert` — steht der Schutz; nur beim Abschreiben fällt er weg.
--
-- WARUM ES NIE AUFGEFALLEN IST: `writeOffInvoice` war bis heute von keiner
-- Stelle der Oberfläche erreichbar (Route `/api/billing/invoices/[id]/
-- abschreiben` ohne Aufrufer). Live trägt keine Rechnung den Status
-- `abgeschrieben`. Der Weg wird mit dieser Arbeit erst geöffnet — die Lücke
-- gehört deshalb davor geschlossen und nicht danach.
--
-- ABGRENZUNG: `invoices_status_check` erlaubt `abgeschrieben` bereits
-- (20260831010000, live geprüft), und `validate_invoice_status_transition`
-- kennt den Wert ebenfalls. Es fehlt ausschließlich in dieser einen Liste.
--
-- WIRKUNG: keine bestehende Zeile ändert sich. Was sich ändert, ist, was mit
-- einer künftigen abgeschriebenen Rechnung noch getan werden darf — nämlich
-- dasselbe wie mit einer stornierten: der Status bleibt anfassbar, der Inhalt
-- nicht.
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.prevent_finalized_invoice_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status NOT IN (
    'freigegeben', 'uebermittelt', 'quittiert',
    'teilweise_bezahlt', 'bezahlt', 'gekuerzt', 'strittig',
    'abgelehnt', 'korrektur_erforderlich', 'erneut_eingereicht',
    'akzeptiert', 'storniert', 'abgeschrieben',
    'sent', 'paid', 'partial', 'rejected', 'disputed'
  ) THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
    NEW.budget_amount IS DISTINCT FROM OLD.budget_amount OR
    NEW.private_amount IS DISTINCT FROM OLD.private_amount OR
    NEW.soll_betrag_cent IS DISTINCT FROM OLD.soll_betrag_cent OR
    NEW.period_start IS DISTINCT FROM OLD.period_start OR
    NEW.period_end IS DISTINCT FROM OLD.period_end OR
    NEW.organization_id IS DISTINCT FROM OLD.organization_id OR
    NEW.client_id IS DISTINCT FROM OLD.client_id OR
    NEW.insurance_name IS DISTINCT FROM OLD.insurance_name OR
    NEW.insurance_number IS DISTINCT FROM OLD.insurance_number OR
    NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR
    NEW.invoice_number_formatted IS DISTINCT FROM OLD.invoice_number_formatted OR
    NEW.correction_of IS DISTINCT FROM OLD.correction_of OR
    NEW.correction_type IS DISTINCT FROM OLD.correction_type OR
    NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
  ) THEN
    RAISE EXCEPTION
      'Festgeschriebene Rechnung (Status: %) darf inhaltlich nicht veraendert werden. '
      'Aenderungen an Betrag, Zeitraum, Kunde, Kostentraeger oder Rechnungsnummer '
      'erfordern eine Korrekturrechnung.',
      OLD.status;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.prevent_finalized_invoice_mutation() IS
  'Schuetzt die fachlichen Felder festgeschriebener Rechnungen. Seit '
  '20260829213000 zaehlt auch der Endstatus abgeschrieben dazu — vorher hob '
  'das Abschreiben den Schutz auf, statt ihn zu erhalten.';
