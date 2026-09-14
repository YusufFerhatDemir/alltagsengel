-- ═══════════════════════════════════════════════════════════════════════
-- service_records: ohne Einsatzdauer nicht abrechenbar
-- Block 44, 14.09.2026
-- ═══════════════════════════════════════════════════════════════════════
--
-- BEFUND
-- `duration_minutes` ist GENERATED aus (end_time - start_time) und bleibt
-- NULL, solange eine der beiden Zeiten fehlt. Der bestehende CHECK
-- `service_records_zeitfenster_gueltig` laesst das ausdruecklich zu:
--
--     CHECK (start_time IS NULL OR end_time IS NULL OR end_time > start_time)
--
-- Und genau so legt /admin/leistungsnachweis-upload Nachweise an: nur
-- Klient, Datum und Leistungsart, ohne Zeiten.
--
-- Der Rechnungslauf erfindet dafuer eine Stunde. In
-- `create_invoice_draft_atomic` steht (live am 14.09.2026 gelesen):
--
--     WHEN 'zeit_stunde' THEN
--       ROUND(preis_cent/100.0 * (COALESCE(duration_minutes, 60)/60.0), 2)
--     WHEN 'zeit_minute' THEN
--       ROUND(preis_cent/100.0 *  COALESCE(duration_minutes, 60),        2)
--
-- Ein Nachweis ohne erfasste Zeiten wird damit als eine Stunde in Rechnung
-- gestellt. Nicht als Fehler, nicht als 0,00 EUR — als ein voller
-- Stundensatz, den niemand erfasst hat. Dieselbe erfundene Stunde stand
-- bis Block 44 auch in der Kassenabrechnung (`duration_minutes || 60`) und
-- meldete sie einem Kostentraeger als Menge.
--
-- WARUM DIESER RIEGEL UND NICHT DIE RPC
-- Die saubere Antwort waere, das COALESCE aus der Geldfunktion zu nehmen.
-- Das hiesse, `create_invoice_draft_atomic` vollstaendig neu zu schreiben —
-- eine mehrere hundert Zeilen lange Funktion auf dem Geldweg, aus
-- rekonstruiertem Quelltext. Dieser CHECK erreicht dasselbe Ziel an der
-- schmalsten Stelle: was nie 'complete', 'signed' oder 'invoiced' wird,
-- kommt in der RPC-Schleife nie vor (sie liest `status IN ('signed',
-- 'complete')`). Das COALESCE bleibt als toter Zweig stehen und sollte
-- spaeter trotzdem fallen — dann als eigene, fuer sich pruefbare Aenderung.
--
-- BESTAND
-- Am 14.09.2026 live gezaehlt: 30 Nachweise, davon 0 ohne Zeiten und
-- 0 mit NULL-Dauer. Der Constraint validiert also auf einem sauberen
-- Bestand; NOT VALID ist nicht noetig.
--
-- ENTWUERFE BLEIBEN ERLAUBT
-- 'draft' und 'incomplete' sind ausdruecklich ausgenommen: der Upload-Weg
-- legt bewusst erst die Huelle an und traegt die Zeiten danach nach. Der
-- Riegel sitzt am Uebergang zur Abrechenbarkeit, nicht an der Anlage.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.service_records
  ADD CONSTRAINT service_records_dauer_vor_abrechnung
  CHECK (
    status NOT IN ('complete', 'signed', 'invoiced')
    OR duration_minutes IS NOT NULL
  );

COMMENT ON CONSTRAINT service_records_dauer_vor_abrechnung ON public.service_records IS
  'Block 44: ohne Einsatzdauer nicht abrechenbar. create_invoice_draft_atomic '
  'rechnet sonst mit COALESCE(duration_minutes, 60) eine volle Stunde, die '
  'niemand erfasst hat. Entwuerfe (draft/incomplete) bleiben ohne Zeiten erlaubt.';
