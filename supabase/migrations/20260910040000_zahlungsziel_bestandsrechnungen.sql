-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Zahlungsziel offener Bestandsrechnungen auf 14 Tage
-- Datum:     2026-08-14  (M-6 aus dem Abschlussbericht)
--
-- BEFUND (live per PostgREST verifiziert, 14.08.2026):
--   Alle 5 Bestandsrechnungen tragen payment_terms_days = 30. Der fachliche
--   Standard ist 14 (ZAHLUNGSZIEL_STANDARD_TAGE in
--   lib/billing/core/zahlungsziel.ts). Die 30 stammen aus dem Spalten-Default
--   der Erweiterungsmigration 20260808210000 und waren nie eine Entscheidung.
--
--   Kein aktiver Bug: neu erstellte Rechnungen bekommen 14 Tage — die
--   Anwendung schreibt payment_terms_days und due_date gemeinsam
--   (zahlungszielFelder()), und der Spalten-Default steht seit 20260901020000
--   auf 14. set_invoice_due_date() greift nur beim INSERT und nur bei leerem
--   due_date, heilt Bestandszeilen also nicht.
--
-- ── WELCHE ZEILEN ANGEFASST WERDEN ─────────────────────────────────────────
--   Nur offene Rechnungen. Konkret ausgeschlossen:
--
--   1) Endstatus (bezahlt/paid, storniert, akzeptiert, abgeschrieben,
--      rejected, entwurf/geprueft/draft — letztere waren nie beim Kunden).
--   2) Jede Rechnung mit bereits eingegangener Zahlung (paid_amount > 0).
--      Bei einer teilbezahlten Rechnung ist ueber das Zahlungsziel faktisch
--      schon verhandelt worden; es nachtraeglich zu verkuerzen erzeugt nur
--      eine kuenstliche Ueberfaelligkeit.
--   3) Strittige/abgelehnte Rechnungen (strittig, disputed, abgelehnt).
--      Diese Faelle sind fachlich ungeklaert und sind in dunning.ts
--      ausdruecklich NICHT mahnfaehig (NICHT_MAHNFAEHIG). Ihnen ein
--      frueheres Faelligkeitsdatum zu geben, waere ein Widerspruch zu
--      genau dieser Regel.
--
--   Live trifft das 3 von 5 Zeilen:
--     RE-2026-0001      sent, keine Zahlung          → 30 → 14
--     RG-2026-TEST-001  sent, keine Zahlung          → 30 → 14
--     RG-2026-TEST-002  sent, keine Zahlung          → 30 → 14
--     RE-2026-0002      disputed, 912,00 EUR bezahlt → unveraendert (Regel 2+3)
--     RE-2026-0003      paid                         → unveraendert (Regel 1)
--
-- ── HINWEIS ZUR RUECKWIRKUNG (bewusst so entschieden) ──────────────────────
--   Auf einer bereits versandten Rechnung steht das damals gedruckte
--   Zahlungsziel. Diese Migration aendert den Datenbankwert, nicht das
--   zugestellte Dokument. Fuer die drei betroffenen Zeilen ist das
--   unkritisch — sie sind ohnehin laengst ueber beide Ziele hinaus
--   (Rechnungsdatum 02.07. bzw. 31.07.2026). Bei einer frisch versandten
--   Rechnung waere die Verkuerzung dagegen NICHT in Ordnung; deshalb ist
--   diese Migration eine einmalige Bereinigung des Altbestands und kein
--   wiederholbarer Bereinigungslauf.
--
--   due_date wird konsistent mitgezogen: Rechnungsdatum + 14, exakt so, wie
--   set_invoice_due_date() und berechneFaelligkeit() rechnen. Sonst behauptet
--   payment_terms_days 14 und due_date weiterhin 30 Tage.
--
-- IDEMPOTENT: die WHERE-Klausel trifft beim zweiten Lauf 0 Zeilen.
-- Rollback: 20260910040001_rollback_zahlungsziel_bestandsrechnungen.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.invoices
   SET payment_terms_days = 14,
       due_date           = COALESCE(created_at::date, current_date) + 14
 WHERE payment_terms_days IS DISTINCT FROM 14
   -- offen: kein Endstatus, nicht strittig, nie nur ein Entwurf
   AND status NOT IN (
     'bezahlt', 'paid', 'teilweise_bezahlt', 'partial',
     'storniert', 'akzeptiert', 'abgeschrieben',
     'strittig', 'disputed', 'abgelehnt', 'rejected',
     'entwurf', 'geprueft', 'draft', 'korrektur_erforderlich'
   )
   -- und ohne jeden Zahlungseingang
   AND COALESCE(paid_amount, 0) = 0;

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFIKATION nach dem Apply (manuell):
--
--   SELECT invoice_number, status, payment_terms_days, due_date,
--          created_at::date AS rechnungsdatum, paid_amount
--     FROM invoices ORDER BY created_at;
--
--   erwartet:
--     RE-2026-0001      sent      14  2026-07-16
--     RE-2026-0002      disputed  30  2026-08-01   (unveraendert)
--     RE-2026-0003      paid      30  2026-08-01   (unveraendert)
--     RG-2026-TEST-001  sent      14  2026-08-14
--     RG-2026-TEST-002  sent      14  2026-08-14
--
--   Gegenprobe Konsistenz (muss 0 liefern):
--     SELECT count(*) FROM invoices
--      WHERE due_date IS DISTINCT FROM created_at::date + payment_terms_days;
-- ════════════════════════════════════════════════════════════════════
