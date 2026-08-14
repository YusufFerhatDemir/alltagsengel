# Phase 7 — Security Red Team (Stabilisierungsblock, 10 Phasen)

**Datum:** 2026-08-14
**Scope:** Production Supabase `nnwyktkqibdjxgimjyuq`, Stamm-Org `00000000-0000-4000-8000-000460629986`
**Methodik:** `scripts/security-redteam-phase7.mjs` — 34 automatisierte Tests gegen die LIVE-DB
(REST-Proben mit anon-Key + SQL-Rollenwechsel per `SET LOCAL ROLE` / `request.jwt.claims`
innerhalb einer Transaktion, die durch eine absichtliche `RAISE EXCEPTION` am Ende immer
zurueckgerollt wird — keine Testdaten bleiben in der DB). Ergaenzt durch Code-Review der
aufrufenden API-Routen (RLS allein reicht nicht, wenn Routen `service_role` benutzen).

**Kontext:** Fast der gesamte Live-Datenbestand steckt in einer einzigen Organisation
("Alltagsengel UG"); die 5 uebrigen Orgs sind leere E2E-Test-Mandanten. Cross-Tenant-Tests
liefen daher gegen Fixtures, die innerhalb derselben rollenden Transaktion angelegt und
sofort wieder verworfen wurden — echte Mandantentrennung, nicht nur "keine Daten da".

---

## Ergebnis: 34/34 Tests PASS

| # | Kategorie | Ergebnis | Bemerkung |
|---|---|---|---|
| 1 | RLS-Bypass (anon, 7 Kerntabellen) | **PASS** | SELECT + INSERT auf clients/service_records/invoices/caregivers/organizations/billing_audit_trail/client_budgets — 0 Zeilen bzw. 401/403 auf allen 7 |
| 2 | RLS-Bypass Cross-Org (authenticated, fremde Org) | **PASS** | Stamm-Owner sieht 0 Zeilen einer frisch angelegten Fixture in einer fremden Org |
| 3 | IDOR: UPDATE/DELETE auf fremde Zeilen | **PASS** | 0 betroffene Zeilen |
| 4 | IDOR: explizite fremde `organization_id` im INSERT-Payload | **PASS** | `clients_org_fence`-RESTRICTIVE-Policy blockt den WITH-CHECK |
| 5 | Privilege Escalation: engel-Rolle → invoices | **PASS** | Keine PERMISSIVE-INSERT-Policy fuer Nicht-Admins auf `invoices`; RLS blockt |
| 6 | Privilege Escalation: service_role-only RPCs von anon | **PASS** | `create_invoice_draft_atomic`/`create_credit_note_atomic`/`validate_correction_atomic` — anon/authenticated ohne EXECUTE |
| 7 | Cross-Tenant: `state_flag()` mit fremder/unbekannter Org | **PASS** | Liefert `false` (fail-safe) |
| 8 | Cross-Tenant: `create_invoice_draft_atomic` mit Org/Klient-Mismatch | **PASS** | `RAISE EXCEPTION 'Klient ... gehoert nicht zu Organisation ...'` |
| 9 | SECURITY DEFINER: `search_path` gesetzt | **PASS** | Alle 79 SECDEF-Funktionen in `public` haben `SET search_path` |
| 10 | Audit-Trail: `billing_audit_trail` UPDATE/DELETE | **PASS** | `trg_audit_trail_no_update`/`_no_delete` blocken beides |
| 11 | Audit-Trail: `assignment_audit_log` UPDATE/DELETE | **PASS** | `trg_immutable_as_audit_update`/`_delete` + `prevent_assignment_audit_edit()` — DELETE nur erlaubt, wenn die Elternzeile (assignment) bereits weg ist (FK-Kaskade-sicher, siehe Lektion aus Audit B) |
| 12 | SQL-Injection ueber `state_flag()`-Parameter | **PASS** | PostgREST bindet RPC-Argumente parametrisiert — `hessen'; DROP TABLE clients; --` landet als Literal-String, `clients` existiert danach unveraendert |
| 13 | XSS/HTML-Injection | **PASS (nach Fix)** | siehe Befund unten |

Vollstaendiger Testlauf inkl. Rohdaten: `scripts/security-redteam-phase7.mjs` (wiederholbar,
nebenwirkungsfrei, `node scripts/security-redteam-phase7.mjs`).

---

## Befunde

### F-1: Fehlendes HTML-Escaping in Transaktions-E-Mails (MITTEL → BEHOBEN)

**Datei:** `lib/notifications.ts`

`wrapEmailTemplate()` und die drei Buchungs-Mails (`notifyAngelNewBooking`,
`notifyCustomerBookingAccepted`, `notifyCustomerBookingDeclined`) interpolierten
`profile.first_name`, `data.customerName`, `data.angelName`, `data.service`, `data.time`
und den freien Ablehnungsgrund (`reason`) **ungefiltert** in HTML, das per Resend unter
`info@alltagsengel.care` an einen ANDEREN Nutzer verschickt wird. Ein Nutzer, der seinen
`first_name` bei der Registrierung auf HTML/Links setzt (z. B. `<a href="...">Klicken Sie
hier</a>`), oder ein Engel, der eine Ablehnung mit HTML-Freitext begruendet, konnte damit
HTML in eine E-Mail unter dem legitimen Alltagsengel-Absender injizieren — Phishing-Risiko
trotz echtem Absender, unabhaengig davon, dass moderne Mail-Clients `<script>` filtern.

`lib/emails/coach-bestellung.ts` hatte fuer genau dieses Muster bereits eine `esc()`-Funktion
(HTML-Entity-Escaping) — nur `lib/notifications.ts` (das aeltere, allgemeine Buchungsmodul)
war nicht nachgezogen worden.

**Fix:** dieselbe `esc()`-Funktion nach `lib/notifications.ts` uebernommen und auf alle
nutzerkontrollierten Interpolationen angewendet (`recipientName`, `customerName`, `angelName`,
`service`, `time`, `reason`). Rein berechnete Werte (`dateStr`, `duration`, `amount`) bleiben
unveraendert, da sie keine Freitext-Herkunft haben.

**Verifiziert:** `scripts/security-redteam-phase7.mjs` Abschnitt 9b (DB speichert Payload wie
erwartet roh — Escaping ist bewusst Ausgabe-seitig, nicht Eingabe-seitig, damit Namen mit `&`
oder `<` in der App selbst nicht verstuemmelt angezeigt werden).

### F-2: 16 neuere SECURITY-DEFINER-Trigger-Funktionen ohne REVOKE (NIEDRIG, Hygiene → Migration erstellt)

**Migration:** `supabase/migrations/20260913000000_secdef_trigger_revoke_nachtrag.sql`
(+ Rollback `20260913000001`)

`20260823010000_secdef_trigger_revoke.sql` haertete am 10.08. 17 SECDEF-Trigger-Funktionen
gegen PUBLIC/anon/authenticated-EXECUTE. Seither kamen 16 neue SECDEF-Trigger-Funktionen dazu
(Audit-Unveraenderlichkeit fuer `assignment_audit_log`/`billing_tariff_audit`, Zahlungsziel,
5× `wf_trigger_*`, Tarif-Belegpflicht) — ohne dasselbe REVOKE. Live bestaetigt per
`has_function_privilege('anon'/'authenticated', oid, 'EXECUTE')`.

**Einstufung: kein aktiv ausnutzbares Leck.** Funktionen mit `RETURNS trigger` lassen sich in
Postgres nicht direkt per `SELECT`/RPC aufrufen ("trigger functions can only be called as
triggers") — unabhaengig von EXECUTE-Rechten. Der Trigger-Mechanismus selbst prueft keine
EXECUTE-Rechte der ausloesenden Rolle. Das REVOKE ist reine Konsistenz-Haertung nach demselben
Muster, nicht die Behebung eines funktionalen Lecks.

**Status:** Migration erstellt und committet, **wartet auf manuelles Apply** (wie alle
DDL-Aenderungen in diesem Projekt — `service_role` ist nicht Owner, siehe
`supabase-mcp-nicht-verfuegbar`-Notiz. Anwenden: kombinierten Block im Supabase-SQL-Editor
ausfuehren).

---

## Architektur-Bestaetigung (kein Befund, zur Dokumentation)

- `current_org_id()` faellt bei fehlender `organization_members`-Zeile auf die Stamm-Org
  zurueck (dokumentiertes, akzeptiertes Verhalten). Das ist **keine** Cross-Tenant-Luecke:
  `org_fence` ist RESTRICTIVE und grenzt nur ein, gewaehrt aber selbst nichts — ein
  Nutzer ohne passende PERMISSIVE-Policy (Admin-Rolle, `caregivers.user_id`-Link oder
  `clients.user_id`-Link) sieht trotz Stamm-Org-Fallback 0 Zeilen. Empirisch bestaetigt in
  Test 4 (engel ohne caregivers-Zeile sieht 0 Klienten, 0 Rechnungen).
- `is_admin()` ist plattformweit (nicht org-gebunden), wird aber durch die RESTRICTIVE
  `*_org_fence`-Policies zusaetzlich auf `current_org_id()` eingeschraenkt — ein Admin kann
  nicht per Rolle allein auf eine fremde Org zugreifen.
- `create_invoice_draft_atomic()` validiert `p_client_id`/`p_org_id`-Zugehoerigkeit selbst
  (nicht nur ueber RLS) — korrekt, weil die Funktion nur von `service_role` aufrufbar ist und
  RLS fuer sie nicht greift. Die aufrufende Route (`app/api/billing/invoices/create/route.ts`)
  leitet `org_id` zusaetzlich serverseitig aus der Session her (`getActiveOrgId()`), nie aus
  dem Request-Body — kein IDOR-Pfad ueber die API-Schicht.
- PDF-Erzeugung nutzt `pdf-lib` (programmatisches Zeichnen, kein HTML-Rendering) — keine
  HTML/Script-Injection ueber Klientennamen in Leistungsnachweisen/Rechnungen moeglich.
- Alle `dangerouslySetInnerHTML`-Stellen im Frontend sind `JSON.stringify(...)` fuer
  JSON-LD-Strukturdaten — kein Pfad fuer nutzerkontrollierte HTML-Injection im Frontend.

## Bekannte Limitierung dieses Durchlaufs

- Reale Multi-Tenant-Daten existieren live nicht (5 von 6 Orgs sind leere E2E-Test-Mandanten).
  Cross-Tenant-Tests liefen deshalb gegen kontrolliert angelegte, sofort zurueckgerollte
  Fixtures statt gegen echte Fremd-Org-Daten. Das SQL-Rollenwechsel-Verfahren ist funktional
  aequivalent zu einem echten JWT (`auth.uid()` liest denselben `request.jwt.claims`-GUC), 
  deckt aber keine Bugs in der JWT-Ausstellung selbst ab (z. B. `app_metadata.org_id`
  fehlerhaft befuellt) — das ist Auth-Provider-Verhalten, nicht RLS.
- API-Layer-Review war stichprobenartig (Rechnungserstellung, PDF-Route) und keine
  Vollabdeckung aller ~40 API-Domains — siehe bereits dokumentierte offene Punkte in
  `docs/SECURITY_AUDIT_ERGEBNIS.md` (H-1 bis M-8) fuer den breiteren Stand.

## Naechste Schritte

1. `20260913000000_secdef_trigger_revoke_nachtrag.sql` manuell im Supabase-SQL-Editor
   anwenden (niedrige Prioritaet, Hygiene).
2. Die in `docs/SECURITY_AUDIT_ERGEBNIS.md` bereits dokumentierten offenen H-/M-Befunde
   bleiben unabhaengig von diesem Red-Team-Durchlauf offen (nicht Teil des heutigen Scopes).
