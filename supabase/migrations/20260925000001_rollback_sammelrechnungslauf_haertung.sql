-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK: Sammelrechnungslauf-Haertung (20260925000000)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Nimmt Batch-Tabellen und Funktionen zurueck. NICHT zurueckgenommen
-- wird der entity_type-CHECK: er stellt Werte wieder her, die eine
-- fruehere Migration versehentlich entfernt hat ('invoice_draft',
-- 'tariff_lookup'). Sie erneut zu entfernen hiesse, den Fehler zu
-- wiederholen — und wuerde den Audit-Trail des Sammelrechnungslaufs und
-- die Tarif-Fehlermeldungen der RPC erneut stillegen.
--
-- billing_audit_trail.batch_id bleibt ebenfalls stehen. Die Spalte ist
-- nullable und stoert niemanden; sie zu loeschen wuerde bestehende
-- Nachweise entwerten.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.sammelrechnung_lauf_abschliessen(uuid, text, text);
DROP FUNCTION IF EXISTS public.sammelrechnung_lauf_heartbeat(uuid);
DROP FUNCTION IF EXISTS public.sammelrechnung_lauf_beanspruchen(uuid, text, uuid, jsonb, boolean, boolean, integer);

DROP TABLE IF EXISTS public.sammelrechnungslauf_gruppen;
DROP TABLE IF EXISTS public.sammelrechnungslaeufe;

COMMIT;
