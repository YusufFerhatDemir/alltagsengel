-- ═══════════════════════════════════════════════════════════════════════
-- Track 13: Der unauthentifizierte Perimeter — die offene Tuer ins CRM
--
-- NICHT ANGEWENDET. Eingecheckt, wartet auf die manuelle Ausfuehrung im
-- SQL-Editor. Rollback: 20261018000001.
--
-- ─────────────────────────────────────────────────────────────────────
-- BEFUND B1 (P1, LIVE_VERIFIZIERT am 28.08.2026)
-- ─────────────────────────────────────────────────────────────────────
-- `lead_inquiries` traegt live drei Policies:
--
--   Admin full access lead_inquiries | ALL    | PERMISSIVE  | authenticated
--                                    | using=is_admin()  check=is_admin()
--   Anyone can submit lead inquiry   | INSERT | PERMISSIVE  | public
--                                    | check=true
--   lead_inquiries_org_fence         | ALL    | RESTRICTIVE | public
--                                    | organization_id = current_org_id()
--
-- Die mittlere stammt aus 20260606_lead_inquiries.sql und traegt dort den
-- Kommentar „Oeffentliches Insert (Website-Formular, kein Auth noetig)".
-- Sie wurde fuer einen Entwurf geschrieben, in dem der BROWSER die Zeile
-- mit dem oeffentlichen Schluessel selbst anlegt.
--
-- So laeuft es heute nicht. `POST /api/lead-inquiry` schreibt mit dem
-- DIENSTSCHLUESSEL und umgeht RLS vollstaendig. Die Policy gewaehrt der
-- Anwendung also NICHTS, was sie braucht.
--
-- Und sie gewaehrt sie auch nicht mehr denen, fuer die sie gedacht war:
-- `anon` hat auf `lead_inquiries` live KEIN INSERT-Grant. Fuer die
-- oeffentliche Website ist die Policy tot.
--
-- Wirksam ist sie ausschliesslich fuer `authenticated` — eine Rolle, die
-- in ihrem Kommentar nicht vorkommt. Live nachgestellt in einer immer
-- zurueckrollenden Transaktion (SET LOCAL ROLE + INSERT + RAISE):
--
--   Rolle authenticated → ERFOLGREICH
--   Rolle anon          → abgewiesen: 42501 permission denied
--   Bestand danach      → 32 Zeilen, 0 Probenzeilen
--
-- WAS DAS HEISST. Jedes angemeldete Konto — Kunde, Engel, Fahrer, ein
-- frisch selbst registriertes Konto — kann per PostgREST beliebige Zeilen
-- in die Lead-Pipeline des Betreibers schreiben. Es umgeht damit JEDE
-- Schranke, die `/api/lead-inquiry` aufgebaut hat:
--
--   * rateLimitPersistent(`lead:${ip}`, 5, 10 min)
--   * das Honeypot-Feld `website`
--   * die Laengenkappen (name 120, phone 40, message 2000, …)
--   * die Plausibilitaetspruefung „mindestens 6 Ziffern" auf phone
--   * die PLZ-Formpruefung
--
-- `organization_id` traegt den Spalten-Default `current_org_id()`. Die
-- Funktion ist fail-open: ein Konto ohne Zeile in `organization_members`
-- landet in der Stamm-Organisation — also genau dort, wo die echten Leads
-- liegen (live 32 Zeilen). Die RESTRICTIVE org_fence ist damit von selbst
-- erfuellt und keine Schranke.
--
-- Schreibbar sind auch die INTERNEN Felder der Bearbeitung: `status`,
-- `notes`, `assigned_to`, `follow_up_date`, `converted_client_id`.
--
-- ─────────────────────────────────────────────────────────────────────
-- WAS DIESE MIGRATION TUT
-- ─────────────────────────────────────────────────────────────────────
-- 1) Die Policy entfernen. Die Anwendung verliert dadurch nichts: der
--    einzige Schreibweg laeuft ueber den Dienstschluessel, und der
--    kennt keine Policies. Danach traegt die Tabelle keine permissive
--    Policy mehr, die einem Nicht-Admin etwas gewaehrt — Lesen wie
--    Schreiben bleibt is_admin() vorbehalten.
--
-- 2) Einen CHECK auf `status` setzen. Der zweite Teil desselben Befundes:
--    die Spalte hatte live GAR KEINE Bedingung, obwohl die CRM-Oberflaeche
--    (app/mis/crm/page.tsx, LEAD_STATUS) mit genau fuenf Werten arbeitet
--    und die Spalten-Tafel danach gruppiert. Ein freier Wert erzeugt eine
--    Spalte, die niemand sieht — der Lead verschwindet aus der Pipeline,
--    ohne geloescht zu sein. Der Wert `new` steht bereits als Default.
--    Bestandspruefung vor dem Schreiben dieser Datei: 0 von 32 Zeilen
--    verletzen die Bedingung (live, 28.08.2026).
--
-- NICHT GETAN und ausdruecklich benannt: `lead_inquiries` bekommt KEINE
-- Ersatz-Policy fuer anon. Eine solche Policy waere nur dann richtig,
-- wenn das Formular wieder direkt aus dem Browser schriebe — und dann
-- fielen alle oben aufgezaehlten Schranken der Route ebenfalls weg. Der
-- Weg ueber die Route ist der bessere; die Policy hat ihn nie gebraucht.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) Die offene Tuer schliessen ────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can submit lead inquiry" ON public.lead_inquiries;

-- ── 2) Statuswortschatz an der Datenbank festhalten ──────────────────
-- NOT VALID waere hier falsch: der Bestand ist geprueft sauber, und eine
-- nicht validierte Bedingung liesse genau die Altlast stehen, deren
-- Abwesenheit gerade festgestellt wurde.
ALTER TABLE public.lead_inquiries
  DROP CONSTRAINT IF EXISTS lead_inquiries_status_check;

ALTER TABLE public.lead_inquiries
  ADD CONSTRAINT lead_inquiries_status_check
  CHECK (status IS NULL OR status IN ('new', 'contacted', 'qualified', 'converted', 'lost'));

COMMENT ON CONSTRAINT lead_inquiries_status_check ON public.lead_inquiries IS
  'Track 13 B1: Wortschatz der CRM-Pipeline (app/mis/crm/page.tsx LEAD_STATUS). '
  'Ohne die Bedingung erzeugt ein freier Wert eine Spalte, die die Oberflaeche nicht kennt — '
  'der Lead ist dann unsichtbar, ohne geloescht zu sein.';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════
-- NACH DEM APPLY ERWARTET (npm run verify:perimeter, Pruefung B1/B2):
--
--   Policies auf lead_inquiries:
--     Admin full access lead_inquiries | ALL | PERMISSIVE  | authenticated
--     lead_inquiries_org_fence         | ALL | RESTRICTIVE | public
--   (die dritte ist weg)
--
--   Probe „INSERT als authenticated"  → abgewiesen (42501 oder RLS)
--   Probe „INSERT als anon"           → abgewiesen: 42501
--   Probe „status='beliebig'"         → abgewiesen: 23514
-- ═══════════════════════════════════════════════════════════════════════
