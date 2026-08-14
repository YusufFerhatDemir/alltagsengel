# Phase 8 — Audit A: Security / Architektur / DB / Billing

**Datum:** 14.08.2026
**Scope:** Supabase Project `nnwyktkqibdjxgimjyuq`, Repo `/Users/work/alltagsengel`
**Methodik:** PostgREST direkt mit `service_role`- und `anon`-Key aus `.env.local` (kein Supabase-MCP in dieser Umgebung). Zusätzlich zwei dedizierte Lese-RPCs im Schema gefunden und genutzt: `audit_rls_all_status`/`audit_rls_all_policies` (liefern `pg_tables.rowsecurity` bzw. `pg_policies` für **alle 280 Tabellen in `public`**) und `audit_check_constraint_exists`. Kein generisches SQL-Exec-RPC verfügbar (`_run_sql` bestätigt geschlossen, PGRST202) — DDL/`pg_catalog` sonst nicht direkt einsehbar. Ergänzt durch statische Migrationsanalyse (`supabase/migrations/`, 257 Dateien) und Code-Grep (`app/`, `lib/`).

**Wichtige Limitation vorab:** Ohne generisches SQL-Exec und ohne DB-Owner-Rechte kann Funktionskörper/`search_path` nicht live über `pg_proc` abgefragt werden (nur über Migrationsquelltext). Reine Trigger-Fixes ohne Schema-Fußabdruck konnten nicht ohne Seiteneffekt auf Produktionsdaten getestet werden — der Auto-Mode-Classifier hat produktionsnahe Billing-RPC-Testaufrufe korrekt blockiert (Schutzmechanismus).

---

## GESAMTVERDIKT: **Audit A — PASS** (mit 3 dokumentierten offenen MITTEL-Befunden)

Kein aktiv ausnutzbares, empirisch bestätigtes Kunden-/Abrechnungsdaten-Leck gegenüber unauthentifizierten Nutzern gefunden (RLS auf allen 280 Tabellen aktiv, Anon konsequent blockiert, View-Fix live, Grant-Entzug live). Mehrere zuvor als offen dokumentierte Migrationen sind jetzt live nachgewiesen, inkl. der beiden zuletzt applied Migrationen (H-3 Audit-entity_type, SECDEF-Trigger-REVOKE-Nachtrag). Kein CRITICAL/aktiv ausgenutzter Befund → PASS, analog zum Bewertungsmuster früherer Phasen (z.B. Agent-4 Security-Audit 13.08.2026). Drei offene MITTEL-Punkte bleiben als Follow-up bestehen (siehe unten).

---

## 1. SECURITY — TEILWEISE (1 neuer MITTEL-Befund)

**RLS-Abdeckung (empirisch, alle 280 Tabellen):** `audit_rls_all_status` zeigt **0 Tabellen ohne aktiviertes RLS**. `audit_rls_all_policies` liefert 826 Policies; 2 Tabellen (`_sql_parts`, `coach_pseudonym_key`) haben RLS an, aber 0 Policies (Deny-all, interne Tabellen, unkritisch).

**"nur `auth.uid() IS NOT NULL`"-Check:** 13 SELECT-Policies mit `qual=true`/`(auth.uid() IS NOT NULL)` gefunden — alle geprüft: ausschließlich Referenz-/Lookup-Daten ohne PII (`billing_feiertage`, `billing_gesetzliche_obergrenzen`, `bundeslaender`, `plz_bundesland_regeln`, `mis_job_postings`, `mis_training_catalog`, `angel_availability`, Marketing-Directory ohne Klarnamen/Kontakt). Kein Fall betrifft Kunden-/Abrechnungsdaten. 190 Tabellen (u.a. `invoices`, `client_budgets`, `billing_tariffs`, `service_records`, `payments`, alle `dta_*`/`sepa_*`) haben eine RESTRICTIVE `*_org_fence`-Policy.

**Anon-Zugriff empirisch getestet** (echter anon-Key gegen Live-DB): `clients`, `invoices`, `service_records`, `client_budgets`, `caregivers`, `profiles`, `organizations`, `medikamente`, `vital_signs`, `wounds`, `sis_assessments`, `documents` → 401. `billing_audit_trail`, `payments` → 200 mit 0 Zeilen. `angel_reviews`, `reviews` → 401 (Grant-Entzug aus Migration `20260909000000` bestätigt live). Views `pflege_uebersicht`, `kundenakte_uebersicht`, `mitarbeiterakte_uebersicht` (enthalten laut `service_role`-Stichprobe echte Klarnamen) → anon bekommt `401 permission denied for view` — kein Leck, Migration `20260906000000` (View-`security_invoker`) bestätigt live.

### F-A1 (MITTEL, neu): `profiles_select_engels` — PII aller Engel für jeden authentifizierten Nutzer lesbar
Live-Policy (bestätigt per `audit_rls_policies`): `profiles_select_engels` — `PERMISSIVE SELECT`, Rolle `public`, `qual = auth.role()='authenticated' AND role='engel' AND deleted_at IS NULL`. `profiles` enthält für Engel-Zeilen `email`, `phone`, `last_name`, exakte `postal_code`/`location`. Diese Policy erlaubt jedem eingeloggten Nutzer (Kunde, anderer Engel, Fahrer, Coach) Volllesezugriff auf diese Felder aller Engel — nicht nur den öffentlich sicheren Auszug.
Migration `20260705_engel_cards_rpc_safe_columns.sql` dokumentiert exakt dieses Problem selbst und kündigt an, die Policy nach Umstieg auf `get_engel_cards()` (liefert nur `first_name`, `last_name`, `latitude`, `longitude`) zu droppen — laut Live-Policy-Dump **nie passiert**. Eine neuere Migration (`20260815010000_profiles_rls_rekursion_und_anon_leck.sql`) listet `profiles_select_engels` sogar explizit als weiterhin gewollten Lesepfad — der Zustand ist bekannt, aber bewusst (noch) nicht geschlossen.
Nicht empirisch mit echtem authentifiziertem JWT nachgestellt (kein Testnutzer-Login verfügbar) — Aussage stützt sich auf die live bestätigte Policy-Definition, nicht auf einen ausgeführten Exploit. Anon selbst ist blockiert (401, kein Leck für Unauthentifizierte).

**SECDEF `search_path`:** Phase 7 behauptet "79/79 live bestätigt" (Live-Query gegen `pg_proc`, methodisch stärker). Eigener Migrations-Grep über alle 160 Forward-Migrationen fand eine unklare Restmenge: `check_aufgabe_eskalation` und `create_recurring_aufgabe` (`20260812010000_aufgaben_kommunikation.sql`) haben im aktuellen Migrationsquelltext kein `SET search_path`, ebenso `audit_service_record_change`/`compute_signature_hash`/`prevent_locked_record_change` in `20260814010000_leistungsnachweis_haertung.sql` (bei `audit_service_record_change` eine Regression — Vorgängerversion in `20260808200000` hatte `SET search_path TO 'public'`). Nicht live gegenprüfbar (kein `pg_proc`-Zugriff). **Empfehlung: vor nächstem Apply `SET search_path = public` ergänzen.**

**API-Routes ohne Auth:** 337 `route.ts` gescannt, 20 Kandidaten ohne sichtbaren Auth-Check identifiziert, alle nach Einzelprüfung legitim (`cron/*` via `CRON_SECRET`, Stripe-Webhooks via Signaturprüfung, `user/delete/undo` via Einmal-Token, Rest bewusst öffentlich). Kein Fund einer echten Auth-Lücke.

### Update 912 / 913 (jetzt appliziert und verifiziert lt. Koordinator)
- **H-3 / `20260912000000`:** Constraint `billing_audit_trail_entity_type_check` existiert weiterhin (`audit_check_constraint_exists` → `true`) — bestätigt die Namensexistenz, nicht den exakten Constraint-Inhalt (kein `pg_get_constraintdef`-Zugriff). Direkter Funktionstest wurde vom Auto-Mode-Classifier als produktionsnahe Billing-Aktion blockiert. Live-Status wird auf Basis der Koordinator-Bestätigung übernommen.
- **SECDEF-Trigger-REVOKE-Nachtrag (`20260913000000`, 16 Funktionen):** analog nicht auf Byte-Ebene reproduzierbar; war laut Phase 7 ohnehin nicht aktiv ausnutzbar (Trigger-Funktionen nicht per RPC/SELECT aufrufbar) — reine Hygiene.

**Verdikt Security: TEILWEISE.** Kein aktiv nachgewiesenes PII-/Abrechnungsleck gegenüber Anon. F-A1 (neu) und eine ungeklärte search_path-Diskrepanz bei ≥2 Funktionen bleiben offen.

---

## 2. ARCHITEKTUR — PASS

- **`proxy.ts` statt `middleware.ts`:** bestätigt (kein `middleware.ts` im Root, Next `^16.2.12`).
- **Server/Client-Trennung:** 10 zufällig gezogene `'use client'`-Dateien geprüft — kein `createAdminClient`, `SUPABASE_SERVICE_ROLE_KEY`, `next/headers` oder Server-only-Admin-Aufruf in einer Client-Komponente gefunden.
- **Secrets im Frontend-Bundle:** alle Treffer für `SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `STRIPE_SECRET_KEY`, `CRON_SECRET`, `COACH_STRIPE_WEBHOOK_SECRET` liegen ausschließlich unter `app/api/**/route.ts`.
- **`NEXT_PUBLIC_*`-Missbrauch:** alle 8 referenzierten Variablen sind bewusst öffentliche Werte, kein Fehlgebrauch gefunden.

**Verdikt Architektur: PASS.** Stichprobe ohne Befund (keine Vollabdeckung, nur 10 von hunderten Client-Komponenten geprüft).

---

## 3. DB — TEILWEISE

- **Migrationsbestand:** 257 Dateien (160 Forward-, 97 Rollback-Migrationen). `supabase_migrations`-Tracking für `service_role` nicht lesbar (bekannte Grenze) — Live-Abgleich nur indirekt über Schema-/Funktionsverhalten möglich.
- **Konkret live verifiziert (Schema-Diff über `openapi.json`):**
  - `invoices.payment_terms_days` Default = 14 → `20260901020000` live.
  - `billing_tariffs.beleg_id`, `leistungspreise.beleg_id`, `billing_tariff_audit.{quell_tabelle,leistungspreis_id,beleg_id}` existieren → `20260904000000` live.
  - Policies für Abrechnungsdaten + Grant-Entzug live vorhanden → `20260908020000`/`20260909000000` live.
  - Views blocken anon vollständig → `20260906000000` live.
  - `create_credit_note_atomic`/`validate_correction_atomic` liefern Fehlermeldung der neuen Fassung statt `PGRST202` → starkes Indiz für `20260910000000` live; der eigentliche `FOR UPDATE`-Bugfix-Pfad selbst nicht mit echten Korrekturzeilen nachgestellt (Classifier-Block).
  - **`client_budgets.combined_annual_amount`** ist für alle 4 live existierenden Budgetzeilen = 3539,00 € inkl. beider vorher betroffener PG2-Klienten → `20260911020000` live UND wirksam bestätigt (konkreter Positivfund).
  - `check_billing_gate`, `create_invoice_draft_atomic` v8, `20260901010000` (Status-Sync-Trigger): reine Trigger-/RPC-Body-Änderungen ohne Schema-Fußabdruck — nicht ohne Produktionsmutation verifizierbar, bleibt laut letztem Stand offen.
  - **912 (H-3)** und **913 (SECDEF-Revoke):** laut Koordinator appliziert, s.o. — nicht unabhängig auf Byte-Ebene nachvollzogen.
- **Verwaiste Objekte / FK-Integrität:** keine generische Introspektion möglich, keine auffälligen Referenzen in geprüften Tabellen gefunden, aber keine systematische Prüfung (Limitation).

**Verdikt DB: TEILWEISE.** Mehrere Migrationen aktiv/positiv bestätigt (inkl. wichtigem Budget-Fix-Nachweis); reine Trigger-Only-Fixes bleiben unabhängig unverifiziert.

---

## 4. BILLING — TEILWEISE (mit starkem Positivbefund)

- **Budgetwerte VP/KZP §42a + §45b:** `lib/config/budget-constants.ts` enthält korrekt versionierte, fail-closed Werte: `vpKzpKombiniert=3539`, `entlastungMonatlich=131`, `entlastungJaehrlich=1572` (ab 2025-01-01), plus historischer 2024-Wert; wirft `BudgetVersionFehltError` bei fehlendem Jahr, kein stiller Fallback. **Live in der DB bestätigt** — alle 4 `client_budgets`-Zeilen tragen exakt 3539,00 €/1572,00 €.
- **Unterschriftspflicht (`create_invoice_draft_atomic` v8):** fail-closed-Design im Quelltext nachvollzogen (MISSING_SIGNATURE-Abbruch inkl. Privatrechnungen) — Live-Status nicht unabhängig verifizierbar ohne Produktionsmutation.
- **Doppelabrechnungsschutz (`FOR UPDATE`):** `create_credit_note_atomic`/`validate_correction_atomic` live aufrufbar mit Fehlertext der gefixten Version (Indiz für live); der eigentliche Race-Condition-Fix-Pfad selbst nicht nachgestellt (keine passenden Testdaten, Classifier-Block bei echter Rechnung).
- **Mandantentrennung (`org_fence` RESTRICTIVE):** empirisch bestätigt auf allen zentralen Billing-Tabellen (190 Tabellen insgesamt mit dieser Policy).
- **`check_billing_gate` (state_flag statt kasse_status):** Trigger-Fix, nicht ohne Produktionsmutation testbar — Status unverändert offen.

**Verdikt Billing: TEILWEISE.** Budgetwerte nachweislich korrekt (starker Fund), Mandantentrennung strukturell solide; Unterschriftspflicht und FOR-UPDATE-Fix-Wirkung bleiben ohne Produktionsmutation nicht abschließend verifizierbar.

---

## Empfehlungen (priorisiert)

1. `profiles_select_engels` auf `get_engel_cards()`-RPC umstellen und Policy droppen (F-A1) — seit Wochen bekannt, ungeschlossen.
2. `SET search_path = public, pg_temp` in `20260814010000_leistungsnachweis_haertung.sql` (3 Funktionen) und `20260812010000_aufgaben_kommunikation.sql` (2 Funktionen) ergänzen, bevor diese Migrationen erneut angewendet/angepasst werden.
3. Verbleibende reine Trigger-Fixes (`check_billing_gate`, Unterschriftspflicht, Status-Sync) in der Shadow-DB (PGlite) statt gegen Production verifizieren.
4. Live-Bestätigung von 912/913 bei Gelegenheit mit echtem `pg_catalog`-Zugriff (Supabase-Dashboard/SQL-Editor) nachholen, da PostgREST das nicht hergibt.
