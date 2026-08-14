-- Rollback: stellt create_invoice_draft_atomic v8 wieder her
-- (d.h. RETURNS create_invoice_draft_result, RAISE statt RETURN bei MISSING_SIGNATURE)
-- ACHTUNG: Dadurch wird der Audit-Persistenz-Bug wieder eingefuehrt!

BEGIN;

DROP FUNCTION IF EXISTS public.create_invoice_draft_atomic(UUID, UUID, TEXT, TEXT, UUID, TEXT, TEXT);

-- v8 wird aus 20260911010000_rechnung_unterschriftspflicht.sql wiederhergestellt.
-- Diese Rollback-Migration ist nur ein Platzhalter — fuer den vollstaendigen
-- Rollback muss 20260911010000 erneut angewendet werden.

COMMIT;
