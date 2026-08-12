-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Fremdschlüssel-Indizes für den operativen Kern
-- Datum:     2026-08-08
-- Branch:    staging/expansion-abnahme
--
-- BEFUND (tests/audit-rls-vollstaendig.sql, Abschnitt A6)
--   123 Fremdschluessel in `public` haben keinen Index auf der Kindspalte.
--   Postgres legt fuer FKs KEINEN Index an; jedes DELETE oder Schluessel-
--   UPDATE am Elternsatz erzwingt dann einen Sequential Scan ueber die
--   gesamte Kindtabelle — und zwar unter einem Lock. Dazu kommen die
--   ganz normalen Joins der Abrechnung, die ohne Index ebenfalls scannen.
--
--   Diese Migration deckt die 20 Spalten des operativen Kerns ab:
--   Klienten, Betreuungskraefte, Einsaetze, Budgets, Leistungen,
--   Rechnungen. Die restlichen ~100 liegen auf Randtabellen (Marketing,
--   Chat, Krankenfahrt-Partner) und werden bewusst NICHT pauschal
--   indiziert — jeder Index kostet bei jedem Schreibvorgang. Sie stehen
--   im Bericht, damit sie bei Bedarf einzeln nachgezogen werden koennen.
--
--   Die Indizes des Abrechnungspfads (invoice_items.invoice_id,
--   service_records-Abrechnungsfilter) kamen bereits mit 20260808150000.
--
-- CREATE INDEX IF NOT EXISTS — wiederholbar, keine Datenaenderung.
-- Hinweis fuer Production: auf einer Datenbank unter Last stattdessen
-- CREATE INDEX CONCURRENTLY einzeln fahren (siehe Migrationsplan Phase I).
-- Rollback: 20260808180001_rollback_fk_indizes_operativer_kern.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ── Klienten und Betreuungskräfte ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clients_user            ON public.clients (user_id);
CREATE INDEX IF NOT EXISTS idx_caregivers_user         ON public.caregivers (user_id);
CREATE INDEX IF NOT EXISTS idx_absences_caregiver      ON public.absences (caregiver_id);
CREATE INDEX IF NOT EXISTS idx_cg_bonuses_caregiver    ON public.caregiver_bonuses (caregiver_id);
CREATE INDEX IF NOT EXISTS idx_cg_documents_caregiver  ON public.caregiver_documents (caregiver_id);
CREATE INDEX IF NOT EXISTS idx_cg_qualif_caregiver     ON public.caregiver_qualifications (caregiver_id);

-- ── Einsatzplanung ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assignments_caregiver   ON public.assignments (caregiver_id);
CREATE INDEX IF NOT EXISTS idx_assignments_client      ON public.assignments (client_id);
CREATE INDEX IF NOT EXISTS idx_vertretung_caregiver    ON public.client_preferred_substitutes (caregiver_id);
CREATE INDEX IF NOT EXISTS idx_vertretung_client       ON public.client_preferred_substitutes (client_id);

-- ── Budgets ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_client_budgets_client   ON public.client_budgets (client_id);
CREATE INDEX IF NOT EXISTS idx_budget_tx_budget        ON public.budget_transactions (budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_tx_client        ON public.budget_transactions (client_id);
CREATE INDEX IF NOT EXISTS idx_budget_tx_record        ON public.budget_transactions (service_record_id);

-- ── Leistungen und Rechnungen ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_service_records_cg      ON public.service_records (caregiver_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client         ON public.invoices (client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_korrektur_von  ON public.invoices (correction_of);
CREATE INDEX IF NOT EXISTS idx_invoice_items_record    ON public.invoice_items (service_record_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_tarif     ON public.invoice_items (tariff_id);
CREATE INDEX IF NOT EXISTS idx_invoice_disputes_rg     ON public.invoice_disputes (invoice_id);
