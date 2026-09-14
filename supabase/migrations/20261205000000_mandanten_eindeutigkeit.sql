-- ═══════════════════════════════════════════════════════════════════════
-- Eindeutigkeit je Mandant statt global
-- Block 46, 14.09.2026
-- ═══════════════════════════════════════════════════════════════════════
--
-- BEFUND
-- Acht UNIQUE-Constraints stehen live auf Tabellen, die `organization_id`
-- tragen, nennen sie aber nicht. Der Wert dahinter ist jeweils einer, den
-- JEDER Mandant fuer sich erzeugt. Der schwerste Fall ist die
-- Rechnungsnummer:
--
--     invoices_invoice_number_key  UNIQUE (invoice_number)
--
-- Die Nummer kommt aus `public.next_billing_number()`, und dieser Zaehler
-- ist ausdruecklich JE MANDANT gefuehrt:
--
--     INSERT INTO billing_number_sequences (organization_id, prefix, year, …)
--     ON CONFLICT (organization_id, prefix, year) DO UPDATE …
--     RETURN p_prefix || '-' || p_year || '-' || LPAD(v_next, 5, '0')
--
-- Die zurueckgegebene Nummer traegt den Mandanten NICHT. Der zweite
-- Mandant erzeugt als erste Rechnung erneut 'RE-2026-00001' und laeuft in
-- eine Unique-Verletzung. Das ist kein Einmalfehler: die RPC bricht ab,
-- der Zaehler faellt mit zurueck (er ist eine Tabelle, kein Sequence-
-- Objekt), der naechste Versuch erzeugt dieselbe Nummer. Der zweite
-- Mandant kann NIE eine Rechnung stellen.
--
-- Dasselbe Muster bei `caregivers_initials_key UNIQUE (initials)`: ein
-- Handzeichen wie 'M.S.' gehoert zu einer Person, nicht zum Schema.
--
-- WARUM DAS BISHER NIEMAND GEMERKT HAT
-- Live gibt es sechs Organisationen, aber nur EINE mit Daten (die
-- uebrigen fuenf sind E2E-Testmandanten ohne Rechnungen). Der Fehler
-- schlaegt erst beim zweiten echten Mandanten zu — und dann sofort.
--
-- KEIN VALIDIERUNGSRISIKO
-- Jeder Schritt ersetzt einen Schluessel durch einen WEITEREN (dieselben
-- Spalten plus organization_id). Ein weiterer Schluessel ist schwaecher:
-- was unter dem alten Constraint eindeutig war, ist es unter dem neuen
-- erst recht. Die ADD-Schritte koennen auf dem Bestand nicht scheitern.
--
-- NICHT GEAENDERT WERDEN DATEN. Kein Preis, keine Nummer, keine Zeile.
-- Nur die Frage, wer denselben Wert noch fuehren darf.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Rechnungsnummer ─────────────────────────────────────────────────
-- Der schwerste Fall: ohne diese Zeile stellt der zweite Mandant nie eine
-- Rechnung. Kein Anwendungscode sucht ueber `invoice_number` (gemessen:
-- 0 Treffer in app/ und lib/), die Umstellung bricht also keinen Lesepfad.
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_invoice_number_org_key UNIQUE (organization_id, invoice_number);

COMMENT ON CONSTRAINT invoices_invoice_number_org_key ON public.invoices IS
  'Block 46: Die Rechnungsnummer ist je Mandant eindeutig, weil '
  'next_billing_number() je Mandant zaehlt. Global eindeutig hiesse: der '
  'zweite Mandant kann keine Rechnung stellen.';

-- ── 2. Handzeichen der Pflegekraft ─────────────────────────────────────
ALTER TABLE public.caregivers
  DROP CONSTRAINT IF EXISTS caregivers_initials_key;
ALTER TABLE public.caregivers
  ADD CONSTRAINT caregivers_initials_org_key UNIQUE (organization_id, initials);

COMMENT ON CONSTRAINT caregivers_initials_org_key ON public.caregivers IS
  'Block 46: Ein Handzeichen gehoert zu einer Person in einem Haus, nicht '
  'zum Schema.';

-- ── 3. Leistungspreise ─────────────────────────────────────────────────
-- Ohne den Mandanten im Schluessel kann nur EIN Haus einen Preis je Land
-- und Leistungsart fuehren. Es werden KEINE Preise geaendert.
ALTER TABLE public.leistungspreise
  DROP CONSTRAINT IF EXISTS leistungspreise_bundesland_leistungsart_gueltig_ab_key;
ALTER TABLE public.leistungspreise
  ADD CONSTRAINT leistungspreise_org_bundesland_leistungsart_gueltig_ab_key
  UNIQUE (organization_id, bundesland, leistungsart, gueltig_ab);

-- ── 4. Abrechnungslaeufe: ersatzlos ────────────────────────────────────
-- Hier wird NICHT ersetzt, sondern gestrichen. Die Regel existiert
-- daneben bereits praeziser:
--
--   idx_lauf_dedup UNIQUE (organization_id, abrechnungsmonat,
--                          kostentraeger_ik, lauf_typ)
--   WHERE status NOT IN ('storniert','abgelehnt','korrigiert')
--     AND deleted_at IS NULL AND lauf_typ = 'erstabrechnung'
--
-- Der alte Constraint war zugleich zu breit (mandantenuebergreifend) und
-- zu streng: er verbot eine zweite Erstabrechnung fuer denselben Monat
-- auch dann, wenn die erste storniert worden war.
ALTER TABLE public.abrechnungslaeufe
  DROP CONSTRAINT IF EXISTS abrechnungslaeufe_abrechnungsmonat_kostentraeger_ik_key;

-- ── 5. Abrechnungs-Zertifikate ─────────────────────────────────────────
ALTER TABLE public.abrechnung_zertifikate
  DROP CONSTRAINT IF EXISTS abrechnung_zertifikate_ik_nummer_typ_key;
ALTER TABLE public.abrechnung_zertifikate
  ADD CONSTRAINT abrechnung_zertifikate_org_ik_typ_key
  UNIQUE (organization_id, ik_nummer, typ);

-- ── 6. Sicherheits-Ueberwachung ────────────────────────────────────────
-- Ein Konto kann Mitglied mehrerer Organisationen sein. Global eindeutig
-- hiesse: nur EINE davon darf es ueberwachen, und die zweite bekaeme als
-- Begruendung den Constraint-Namen.
ALTER TABLE public.security_watchlist
  DROP CONSTRAINT IF EXISTS security_watchlist_user_id_key;
ALTER TABLE public.security_watchlist
  ADD CONSTRAINT security_watchlist_org_user_key UNIQUE (organization_id, user_id);

-- ── 7./8. MIS: Bestell- und Prozesskennungen ───────────────────────────
-- Beide Tabellen sind live leer; die Kennungen vergibt jedes Haus fuer sich.
ALTER TABLE public.mis_purchase_orders
  DROP CONSTRAINT IF EXISTS mis_purchase_orders_po_number_key;
ALTER TABLE public.mis_purchase_orders
  ADD CONSTRAINT mis_purchase_orders_org_po_number_key
  UNIQUE (organization_id, po_number);

ALTER TABLE public.mis_quality_processes
  DROP CONSTRAINT IF EXISTS mis_quality_processes_process_id_key;
ALTER TABLE public.mis_quality_processes
  ADD CONSTRAINT mis_quality_processes_org_process_id_key
  UNIQUE (organization_id, process_id);
