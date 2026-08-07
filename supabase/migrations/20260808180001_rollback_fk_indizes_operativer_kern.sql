-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: Fremdschlüssel-Indizes operativer Kern (20260808180000)
--
-- Entfernt reine Leseoptimierungen. Kein Datenverlust, aber danach
-- scannt jedes DELETE am Elternsatz wieder die volle Kindtabelle.
-- ════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS public.idx_clients_user;
DROP INDEX IF EXISTS public.idx_caregivers_user;
DROP INDEX IF EXISTS public.idx_absences_caregiver;
DROP INDEX IF EXISTS public.idx_cg_bonuses_caregiver;
DROP INDEX IF EXISTS public.idx_cg_documents_caregiver;
DROP INDEX IF EXISTS public.idx_cg_qualif_caregiver;
DROP INDEX IF EXISTS public.idx_assignments_caregiver;
DROP INDEX IF EXISTS public.idx_assignments_client;
DROP INDEX IF EXISTS public.idx_vertretung_caregiver;
DROP INDEX IF EXISTS public.idx_vertretung_client;
DROP INDEX IF EXISTS public.idx_client_budgets_client;
DROP INDEX IF EXISTS public.idx_budget_tx_budget;
DROP INDEX IF EXISTS public.idx_budget_tx_client;
DROP INDEX IF EXISTS public.idx_budget_tx_record;
DROP INDEX IF EXISTS public.idx_service_records_cg;
DROP INDEX IF EXISTS public.idx_invoices_client;
DROP INDEX IF EXISTS public.idx_invoices_korrektur_von;
DROP INDEX IF EXISTS public.idx_invoice_items_record;
DROP INDEX IF EXISTS public.idx_invoice_items_tarif;
DROP INDEX IF EXISTS public.idx_invoice_disputes_rg;
