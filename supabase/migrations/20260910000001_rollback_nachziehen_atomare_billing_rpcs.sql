-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20260910000000_nachziehen_atomare_billing_rpcs.sql
-- ════════════════════════════════════════════════════════════════════
-- ACHTUNG: Danach sind parallele Korrekturen/Gutschriften wieder NICHT
-- serialisiert (nur noch App-Layer-CAS in lib/billing/core/invoice-engine.ts).
-- correctInvoice()/createCreditNote() fangen das fehlende Funktionsobjekt ab
-- und laufen weiter — der Weg bricht also nicht, verliert aber die Sperre.
--
-- Der Status 'abgeschrieben' wird ebenfalls wieder unzulaessig. Falls
-- zwischenzeitlich Rechnungen in diesem Status stehen, scheitert das
-- ADD CONSTRAINT — dann zuerst die Statuswerte bereinigen.
-- Nur ausfuehren, wenn die Migration nachweislich einen Produktionsweg bricht.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.validate_correction_atomic(UUID, UUID);
DROP FUNCTION IF EXISTS public.create_credit_note_atomic(UUID, INTEGER, TEXT, UUID, UUID);

-- Statusliste ohne 'abgeschrieben' (Stand vor 20260831010000, siehe
-- 20260806400000_add_strittig_status.sql)
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check CHECK (
  status IN (
    'draft', 'sent', 'paid', 'partial', 'rejected', 'disputed',
    'entwurf', 'geprueft', 'freigegeben', 'uebermittelt',
    'quittiert', 'abgelehnt', 'bezahlt', 'teilweise_bezahlt',
    'gekuerzt', 'korrektur_erforderlich', 'erneut_eingereicht',
    'akzeptiert', 'storniert', 'strittig'
  )
);

COMMIT;
