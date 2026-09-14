-- Rollback zu 20261205000000_mandanten_eindeutigkeit.sql
--
-- ACHTUNG: danach sind die acht Werte wieder GLOBAL eindeutig. Der zweite
-- Mandant kann dann keine Rechnung stellen, keine Pflegekraft mit einem
-- schon vergebenen Handzeichen anlegen und keinen eigenen Leistungspreis
-- fuehren.
--
-- Das Zurueckdrehen kann SCHEITERN, sobald ein zweiter Mandant Daten
-- angelegt hat: der alte, engere Schluessel findet dann Doppelte. Das ist
-- kein Fehler dieser Datei, sondern der Beweis, dass die Vorwaerts-
-- Migration gebraucht wurde.

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_org_key;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);

ALTER TABLE public.caregivers DROP CONSTRAINT IF EXISTS caregivers_initials_org_key;
ALTER TABLE public.caregivers ADD CONSTRAINT caregivers_initials_key UNIQUE (initials);

ALTER TABLE public.leistungspreise
  DROP CONSTRAINT IF EXISTS leistungspreise_org_bundesland_leistungsart_gueltig_ab_key;
ALTER TABLE public.leistungspreise
  ADD CONSTRAINT leistungspreise_bundesland_leistungsart_gueltig_ab_key
  UNIQUE (bundesland, leistungsart, gueltig_ab);

ALTER TABLE public.abrechnungslaeufe
  ADD CONSTRAINT abrechnungslaeufe_abrechnungsmonat_kostentraeger_ik_key
  UNIQUE (abrechnungsmonat, kostentraeger_ik);

ALTER TABLE public.abrechnung_zertifikate
  DROP CONSTRAINT IF EXISTS abrechnung_zertifikate_org_ik_typ_key;
ALTER TABLE public.abrechnung_zertifikate
  ADD CONSTRAINT abrechnung_zertifikate_ik_nummer_typ_key UNIQUE (ik_nummer, typ);

ALTER TABLE public.security_watchlist DROP CONSTRAINT IF EXISTS security_watchlist_org_user_key;
ALTER TABLE public.security_watchlist ADD CONSTRAINT security_watchlist_user_id_key UNIQUE (user_id);

ALTER TABLE public.mis_purchase_orders DROP CONSTRAINT IF EXISTS mis_purchase_orders_org_po_number_key;
ALTER TABLE public.mis_purchase_orders ADD CONSTRAINT mis_purchase_orders_po_number_key UNIQUE (po_number);

ALTER TABLE public.mis_quality_processes DROP CONSTRAINT IF EXISTS mis_quality_processes_org_process_id_key;
ALTER TABLE public.mis_quality_processes ADD CONSTRAINT mis_quality_processes_process_id_key UNIQUE (process_id);
