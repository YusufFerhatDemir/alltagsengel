-- ═══════════════════════════════════════════════════════════════════════
-- Track 12 / Restposten R2 — anon-Riegel als Policy statt als Funktionsrecht
--
-- Rollback: 20260828200001.
--
-- ─────────────────────────────────────────────────────────────────────
-- BEFUND (live nachgemessen 28.08.2026)
-- ─────────────────────────────────────────────────────────────────────
-- Neun Geldtabellen wurden mit dem oeffentlichen Schluessel abgefragt und
-- antworteten alle mit HTTP 401. Das ist das richtige Ergebnis — aber es
-- kommt bei fuenf von ihnen aus dem falschen Grund.
--
--   has_table_privilege('anon', …, 'SELECT')  →  TRUE  auf
--     client_budgets, service_records, payments,
--     billing_tariffs, leistungspreise
--
-- anon DARF diese Tabellen also lesen. Die 401 entsteht erst weiter innen:
-- die org_fence-Policy dieser Tabellen ruft public.current_org_id(), und
-- anon hat auf DIESE FUNKTION kein EXECUTE. Die Abfrage scheitert mit
-- „permission denied for function current_org_id" — nicht daran, dass
-- jemand den Zugriff verboten haette.
--
-- invoices und invoice_items sind die Gegenprobe: sie tragen seit
-- 20260819020000 zusaetzlich eine RESTRICTIVE anon_deny-Policy und
-- scheitern damit an einer AUSSAGE, nicht an einer Nebenwirkung.
--
-- WARUM DAS ZAEHLT: wer EXECUTE auf current_org_id() an anon zurueckgibt —
-- versehentlich, oder weil eine kuenftige Policy es braucht — oeffnet diese
-- fuenf Tabellen in EINEM Zug, ohne dass irgendwo „GRANT auf eine
-- Geldtabelle" im Migrationsverlauf steht. Der Schutz haengt heute an einer
-- Bedingung, die niemand als Schutz hingeschrieben hat.
--
-- ABHILFE: dieselbe RESTRICTIVE anon_deny-Policy wie auf invoices. Sie
-- ersetzt den bestehenden Riegel nicht, sie legt sich davor —
-- RESTRICTIVE-Policies werden UND-verknuepft, `USING (false)` kann durch
-- keine permissive Policy mehr aufgehoben werden.
--
-- BEWUSST NICHT GETAN: `REVOKE SELECT … FROM anon`. Das waere die
-- gruendlichere Antwort, braucht aber Owner-Rechte, die der Dienstschluessel
-- nicht hat (REVOKE meldet dann HTTP 204 ohne jede Wirkung — ein stiller
-- Fehlschlag, der schlimmer ist als kein Versuch). Die Policy wirkt
-- unabhaengig vom Tabellenrecht und ist deshalb hier die belastbarere Wahl.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS "client_budgets_anon_deny" ON public.client_budgets;
CREATE POLICY "client_budgets_anon_deny" ON public.client_budgets
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "service_records_anon_deny" ON public.service_records;
CREATE POLICY "service_records_anon_deny" ON public.service_records
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "payments_anon_deny" ON public.payments;
CREATE POLICY "payments_anon_deny" ON public.payments
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "billing_tariffs_anon_deny" ON public.billing_tariffs;
CREATE POLICY "billing_tariffs_anon_deny" ON public.billing_tariffs
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "leistungspreise_anon_deny" ON public.leistungspreise;
CREATE POLICY "leistungspreise_anon_deny" ON public.leistungspreise
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

COMMIT;
