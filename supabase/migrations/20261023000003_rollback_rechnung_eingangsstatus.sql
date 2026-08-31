-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK zu 20261023000002_rechnung_eingangsstatus.sql
--
-- Nimmt den Eingangsriegel wieder weg. Danach ist jeder Status beim
-- Anlegen einer Rechnung wieder frei waehlbar — und die drei
-- BEFORE-UPDATE-Riegel auf `invoices` sehen eine so angelegte Zeile nie.
--
-- Das ist zugleich der vorgesehene Weg fuer eine einmalige Uebernahme
-- echter Altrechnungen aus einem Vorsystem: Rollback einspielen,
-- importieren, 20261023000002 wieder einspielen. Bewusst als zwei
-- ausdrueckliche Schritte statt als Ausnahmeschalter — eine Umgehung,
-- die dauerhaft im Schema steht, ist an einem Geldweg ein zweiter Weg
-- hinein.
-- ═══════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_a_invoice_eingangsstatus ON public.invoices;
DROP TRIGGER IF EXISTS trg_invoice_eingangsstatus ON public.invoices;
DROP FUNCTION IF EXISTS public.enforce_invoice_eingangsstatus();
