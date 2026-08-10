# Migrations-Inventar + Staging-Readiness — 2026-08-10

**Branch:** `staging/expansion-abnahme` · **Production-Projekt:** `nnwyktkqibdjxgimjyuq` (NICHT verändert) · **Stamm-Org:** `00000000-0000-4000-8000-000460629986`

---

## 0. Kurzfassung — 5 Befunde, die vor jedem weiteren Apply gelesen werden müssen

1. **Kein Supabase-MCP in dieser Session** (siehe §1). Der Live-Status je Migration (`supabase_migrations.schema_migrations`) konnte NICHT per Query verifiziert werden. Alle "LIVE"-Einstufungen unten sind aus Session-Memory, Audit-Reports und Code-Referenzen abgeleitet — nicht aus der DB gelesen. Das ist der wichtigste offene Punkt aus Auftrag 1.
2. **Konkreter Repo/Live-Drift-Verdacht, hohe Konfidenz:** `20260808210000_zahlungen_forderungen_monatsabschluss.sql` und `20260808220000_kassenabrechnung_dta_dakota.sql` können in der heutigen Fassung auf keiner sauberen DB durchlaufen — reproduziert im Shadow-DB-Test (§5). Mehrere unabhängige Indizien (live gezählte `dta_ruecklaeufer`-Zeilen, ein Audit-Event `entity_type='dta_ruecklaeufer'` vom 2026-08-08T21:02:59Z in `SECURITY_P0_APPLY.sql`) sprechen dafür, dass auf Production trotzdem **etwas** unter diesen Tabellennamen existiert — vermutlich eine von Hand korrigierte Fassung, die nie in den Migrationsordner zurückgeflossen ist. Details in §2. **Das muss vor jedem weiteren Apply per Live-Query geklärt werden**, sonst läuft ein "Nachziehen" der Repo-Datei gegen bereits vorhandene Objekte und kann sie überschreiben oder erneut brechen.
3. **4 Migrationen scheitern beim Replay von Grund auf** (frische Shadow-DB, §5.1): die zwei oben genannten, plus `20260813010000_workflow_engine.sql` (kaskadierend, hängt an #2) und `20260814010000_leistungsnachweis_haertung.sql` (Rückgabetyp-Konflikt — mit hoher Wahrscheinlichkeit harmlos, siehe §5.3).
4. **2 weitere Migrationen sind nicht idempotent** (Zweitlauf-Test, §5.2): `20260812010000_aufgaben_kommunikation.sql` und `20260813010000_workflow_engine.sql` legen Policies ohne vorheriges `DROP POLICY IF EXISTS` an — ein Wiederholungslauf nach Teil-Fehler bleibt hängen.
5. **9 Migrationen ab 2026-08-06 haben keine Rollback-Datei**, darunter 5 große neue Modul-Migrationen (Dokumentenmanagement/Akten, Pflegedokumentation, Personalmanagement, Aufgaben/Kommunikation, Workflow-Engine) — siehe §3.2, Spalte „Rollback".

---

## 1. Methodik & Grenzen dieser Session

Der Auftrag verlangt für Aufgabe 1 einen Live-Abgleich via Supabase-MCP (`SELECT * FROM supabase_migrations.schema_migrations`) und für Aufgabe 3 einen Apply gegen eine Staging-DB. Beides war in dieser Session nicht möglich:

- **Kein Supabase-MCP-Tool verbunden** (per `ToolSearch` geprüft — keine `execute_sql`/`apply_migration`/`list_migrations`-Tools verfügbar).
- **Keine Staging-Supabase-Instanz mit Schreibzugriff**: `.env.staging.local` enthält nur `STAGING_SUPABASE_URL`/`ANON_KEY`/`PROJECT_REF`, keinen Service-Role-Key und keine DB-Connection-String — DDL ist damit nicht möglich (nur PostgREST-Lesezugriff über `anon`).
- **`supabase`-CLI nicht installiert**, kein `DATABASE_URL` für `psql` gegen ein Remote-Projekt.
- `scripts/apply-migration.mjs` würde gegen `NEXT_PUBLIC_SUPABASE_URL` (= **Production**) laufen — bewusst NICHT benutzt, da der Auftrag Production explizit ausschließt.

**Ersatz für Aufgabe 3:** `./scripts/shadow-db.sh` — baut eine echte PostgreSQL-16-Instanz ausschließlich aus dem Repo (Bootstrap + `initial-setup.sql` + alle `supabase/migrations/*.sql` ohne Rollbacks) auf einem lokalen Cluster (`.shadow-db/`, Port 55432). Berührt nie Supabase. Das ist der im Projekt etablierte Ersatz für eine Staging-DB (siehe `docs/EXPANSION_DEUTSCHLAND.md`-Workflow, `audit/SHADOW_DB_MIGRATION_REPORT.md`). Ergebnis in §5.

**Status-Herleitung ohne DB-Zugriff:** je Migration aus (a) `audit/MIGRATION_STATUS_2026-08-10.md` (heute früher erstellt), (b) Session-Memory (`~/.claude/projects/.../memory/*.md`, viele mit „live gemessen am …"-Zeitstempeln), (c) Querverweisen in späteren Migrations-Kopfkommentaren, (d) `SECURITY_P0_APPLY.sql` und Commit-Messages. Jede Zeile in §3.2 trägt eine Konfidenzangabe. **LIVE/AUSSTEHEND ohne „(unsicher)"-Vermerk heißt „aus mind. 2 unabhängigen Quellen konsistent belegt", nicht „per Query verifiziert".**

---

## 2. Kritischer Befund im Detail: Zahlungen/Kassenabrechnung — Repo-Datei ≠ vermuteter Live-Stand

**`20260808210000_zahlungen_forderungen_monatsabschluss.sql`** legt `CREATE TABLE IF NOT EXISTS public.payments (... organization_id uuid NOT NULL ...)` an und danach `CREATE INDEX idx_payments_org ON public.payments(organization_id)`.

Problem: **`public.payments` existiert bereits** — angelegt in `supabase/initial-setup.sql:220` als altes Stripe-artiges Buchungs-Zahlungssystem (`booking_id`, `user_id`, `amount`, `platform_fee`, `stripe_payment_id`, Policies auf Türkisch: „Kullanıcı kendi ödemelerini okuyabilir"). `initial-setup.sql` bildet laut Projekt-Konvention exakt die live-only Baseline-Tabellen ab, die nur in Supabase existieren (nicht per Migration angelegt — siehe Memory `betriebssystem-schema`). Die `CREATE TABLE IF NOT EXISTS` No-opt also gegen die alte Tabelle, die kein `organization_id` hat → die anschließende `CREATE INDEX` bricht mit `column "organization_id" does not exist` ab. Reproduziert im Shadow-DB-Test (§5.1).

**`20260808220000_kassenabrechnung_dta_dakota.sql`** enthält **10 RESTRICTIVE-Policies**, die alle `SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()` verwenden (Zeilen 454, 477, 500, 524, 547, 570, 593, 616, 639, 662). **`profiles` hat auf Production keine Spalte `organization_id`** — per Live-PostgREST-Introspektion am 08.08.2026 verifiziert (Memory `profiles-hat-keine-organization-id`, vollständige Spaltenliste vorhanden). Die Policy muss stattdessen `public.current_org_id()` verwenden (den projekteigenen Helper aus der Phase-3-Migration, den alle anderen Policies im selben und in Nachbardateien korrekt benutzen). Bricht mit `column p.organization_id does not exist` ab.

**Warum trotzdem ein Live-Drift-Verdacht, nicht nur ein Datei-Bug:**
- Memory `kassenabrechnung-stammdaten-leer` (live gezählt 09.08.2026) listet u.a. `dta_ruecklaeufer` und `abrechnungslaeufe` mit konkreten Zeilenzahlen (1 bzw. 0) — die Tabellen müssen also existieren, damit die Zählung nicht mit einem Schema-Fehler abbricht.
- `SECURITY_P0_APPLY.sql:338` referenziert ein echtes Audit-Event `entity_type 'dta_ruecklaeufer', created_at 2026-08-08T21:02:59Z` — ein INSERT in `dta_ruecklaeufer` hat auf Production tatsächlich stattgefunden.
- Memory `abrechnung-schema-fallen` (08.08.2026) beschreibt Live-Bugs in genau den Tabellen, die diese Migration anlegt (`abrechnungslaeufe.erstellt_am` statt `created_at`) — der Code lief an diesem Tag bereits gegen echte Objekte.

Diese drei Indizien zusammen sprechen dafür, dass am 08.08.2026 etwas unter diesen Tabellennamen auf Production angelegt wurde — aber **nicht** die heutige Fassung der Repo-Datei, sonst wäre der `profiles.organization_id`-Fehler an genau diesem Tag aufgetreten (und hätte, dem Muster aller anderen P0-Funde in diesem Repo folgend, eine eigene Memory-Notiz bekommen — die es nicht gibt). Wahrscheinlichste Erklärung: **die Datei wurde beim Live-Apply von Hand korrigiert (SQL-Editor) und der Fix nie in den Migrationsordner zurückportiert** — das gleiche Muster wie bei `fix_app_settings_hide_demo_password` (siehe Memory `rls-lockdown-pending-apply`: „Repo/DB-Drift … nur via MCP appliziert").

**Konsequenz:** Bevor irgendjemand `20260808210000`/`20260808220000` erneut anwendet (auch auf einer echten Staging-DB, die von Production geklont wurde) — per Live-Query klären, ob `public.payments`/`dta_*`-Tabellen bereits existieren und mit welchem Schema. Die Repo-Dateien selbst müssen so oder so gefixt werden (Tabellenname `payments` kollidiert strukturell; die 10 Policies müssen auf `current_org_id()` umgestellt werden), sonst kann aus diesem Repo nie wieder eine korrekte DB from-scratch aufgebaut werden (Desaster-Recovery-Fall).

---

## 3. Vollständiges Migrations-Inventar

102 Vorwärts-Migrationen, 41 Rollback-Dateien (Stand `supabase/migrations/`, 145 Dateien).

### 3.1 Baseline & früher Verlauf (LIVE, konsolidiert)

Aus `audit/MIGRATION_STATUS_2026-08-10.md` übernommen und gegen Memory geprüft — keine Widersprüche gefunden, hohe Konfidenz:

| Zeitraum | Umfang | Status |
|---|---|---|
| `20250101000000` – `20260101000100` | Core-Baseline (Tabellen, Funktionen) | LIVE |
| `20260301` – `20260419` | Content/SEO/Pricing/Tracking/Notifications/Care-Recipients/Soft-Delete/RLS-Matrix | LIVE |
| `20260502_revoke_anon_security_definer_funcs.sql` | Security-Härtung | LIVE |
| `20260525` – `20260706` | Analytics/Leads/Service-Records/CRM/MIS/Monatsabschluss/RLS-Lockdown (Memory `rls-lockdown-pending-apply`: 2026-07-05 live verifiziert) | LIVE |
| `20260705_rls_lockdown_new_mis_modules.sql` | 15 Tabellen Nachzügler-RLS-Fix | **AUSSTEHEND (unsicher)** — Memory sagt explizit „noch NICHT live" (Stand 2026-07-06), keine neuere Bestätigung gefunden. **Vor Freigabe gezielt live prüfen.** |
| `20260719` (3 Dateien) | Bookings-Workflow, Angel-Availability, Eylem-Audit | **TEILWEISE AUSSTEHEND** — Memory `booking-workflow-migration-pending` (19.07.) sagt explizit nicht live. Keine neuere Gegen-Evidenz gefunden trotz Datum vor 3 Wochen. **Hohes Risiko, dass das übersehen wurde — separat verifizieren.** |
| `20260730` – `20260731` (4 Dateien) | Verordnungen-Workflow + Erweiterungen | LIVE (nachfolgende Module referenzieren `verordnungen` als bestehend) |
| `20260801_phase3_multi_mandant_saas.sql` | Multi-Mandant-Kern (`organizations`, `current_org_id()`, 65 Tabellen org-fence) | **LIVE, verifiziert 02.08.2026** (Memory `phase3-multi-mandant`, Impersonation-Test) |
| `20260802000100`/`000200` | Baseline-Constraints/Columns/Bucket | LIVE |
| `20260803000000`/`100000` | RLS-Rekursion-Fix Bookings, Policy-Konsolidierung | LIVE |
| `20260804*` (7 Dateien) | Trigger-Reapply, Phantom-Policies, Documents-Tabelle, FK-Fixes | LIVE |

### 3.2 Detailtabelle ab 2026-08-06 (aktives Entwicklungsfenster)

Legende Status: **LIVE** (belegt) · **AUSSTEHEND** (belegt, nicht live) · **UNGEWISS** (keine ausreichende Evidenz) · Risiko: DDL-Typ + Auswirkung bei Fehlschlag, nicht Wahrscheinlichkeit.

| Datei | Zweck | Objekte (Auszug) | Abhängigkeiten | Risiko | Rollback | Status |
|---|---|---|---|---|---|---|
| `20260806100000_org_fence_mis_ai_conversations.sql` | org_fence für `mis_ai_conversations` nachrüsten | Spalte + Index + RESTRICTIVE-Policy | Phase 3 | NIEDRIG | JA (`...100001`) | LIVE |
| `20260806120000_harden_b2c_rls_policies.sql` | RLS auf `chat_messages`/`messages`/`notifications` härten (PR#34) | Policies | keine | NIEDRIG | JA (`...120001`) | LIVE |
| `20260806140000_harden_notifications_insert.sql` | Client-INSERT auf `notifications` blockieren | Policy | 120000 | NIEDRIG | JA (`...140001`) | LIVE |
| `20260806200000_billing_core_corrections.sql` | Rechnungsfestschreibung + Korrekturprozess (PR#35) | `billing_tariffs`, `invoice_corrections`, `invoice_snapshots`, `invoice_disputes` | keine | MITTEL (neue Kern-Billing-Tabellen) | JA (`...200001`) | LIVE (billing_tariffs live gezählt) |
| `20260806300000_pr35_reconciliation_status_constraint.sql` | Status-CHECK auf `invoices` (Drift-Fix) | Constraint | 200000 | NIEDRIG | **NEIN** | LIVE |
| `20260806400000_add_strittig_status.sql` | Status `strittig` ergänzen | Constraint-Erweiterung | 300000 | NIEDRIG | JA | LIVE |
| `20260806500000_legacy_status_backfill.sql` | EN→DE Status-Backfill | UPDATE auf `invoices` | 400000 | **HOCH (Daten-UPDATE)** — Kopfkommentar warnt explizit „nur nach ausdrücklicher Freigabe" | JA | LIVE |
| `20260806600000_audit_security.sql` | `billing_audit_trail` absichern (actor_id nullable, FK entfernt) | Tabelle + Trigger | 200000 | NIEDRIG | JA | LIVE (Probe-Zeile live gelesen, s. 817020000) |
| `20260806600001_fix_finalized_edit.sql` | Schutz festgeschriebener Rechnungen korrigieren | Trigger-Fix | 600000 | NIEDRIG | JA | LIVE |
| `20260806700000_overhauled_backfill.sql` | Zweiter EN→DE-Backfill | UPDATE | 600000 | **HOCH (Daten-UPDATE, exakt 5 Prod-Rechnungen als Guard)** — von `shadow-db.sh` bewusst übersprungen | JA | LIVE |
| `20260807100000_create_invoice_draft_atomic.sql` | Atomare Rechnungserstellungs-RPC (SECURITY DEFINER) | Funktion | 200000 | MITTEL (neue Berechtigungsfläche) | JA | LIVE |
| `20260807110000_tariff_based_invoice_creation.sql` | Tarif-basierte Rechnungserstellung, `billing_tariffs` als führende Preisquelle | RPC-Erweiterung, Spalten auf `invoice_items` | 100000, `billing_tariffs` | MITTEL | JA | LIVE (Staging-Abnahme 10/10 PASS, `STAGING_ABNAHME_BERICHT.md`) |
| `20260807120000_tariff_model_hardening.sql` | Katalog `billing_leistungsarten`/`billing_rechtsgrundlagen`, IK-Validierung (Luhn), Overlap-Exclusion | Tabellen + Constraints | 110000 | MITTEL | JA | LIVE |
| `20260807180000_tariff_stammdaten_v2.sql` | Tarifquelle-Katalog, `service_pricing` INTERNAL/PRIVATE-Kennzeichnung | Tabellen + Constraints | 120000 | NIEDRIG | JA | LIVE |
| `20260808100000_expansion_deutschland.sql` | `state_settings`, Bundesland-Freischaltung, Länder-Seed | Tabellen + RPCs | Phase 3 | NIEDRIG (additiv) | JA | **LIVE** — `state_settings`=48 Zeilen live gezählt (09.08.), widerspricht der älteren Einschätzung „NICHT auf Production" in Memory `expansion-deutschland` (07.08., veraltet) |
| `20260808110000_tarifschichten_bundesland.sql` | 5-Schichten-Preismodell bundeslandfähig | Tabellen | 100000 | NIEDRIG | JA | LIVE (Folgemigrationen setzen es voraus und sind selbst live) |
| `20260808120000_expansion_review_fixes.sql` | Pre-Production-Review-Korrekturen | diverse | 100000, 110000 | NIEDRIG | JA | LIVE |
| `20260808120001_plz_bundesland_seed.sql` | PLZ→Bundesland-Zuordnung (generiert aus TS) | Daten-Seed, `plz_bundesland_regeln` | 120000 | NIEDRIG (reine Daten, generiert — bei Drift `npm run generate:plz-sql` neu erzeugen) | **NEIN** (Daten-Seed, kein Rollback nötig) | LIVE |
| `20260808120002_invoice_bundesland_klient.sql` | Tarifauflösung nach Klienten-Bundesland (v5) | RPC-Änderung | 120000, 120001 | MITTEL (Rechnungslogik) | JA (`...120003`) | LIVE |
| `20260808130000_expansion_phase2.sql` | Ein-Klick-Freischaltung zieht Tarife/Landesregeln mit | Tabellen + RPCs | 100000–120002 | MITTEL | JA | LIVE |
| `20260808140000_katalog_rls.sql` | RLS auf 4 Billing-Katalogtabellen (Staging-Abnahme-Fund) | Policies | 120000, 180000 | NIEDRIG | JA | LIVE |
| `20260808150000_view_invoker_und_haertung.sql` | Views auf Invoker-Rechte, SECURITY-DEFINER-Härtung, Kreuz-Mandanten-Leck-Fix (P1) | Views + Funktionen | 110000, 130000 | MITTEL (Security-Fix) | JA | LIVE |
| `20260808160000_profiles_agb_spalten.sql` | `profiles.agb_accepted_at`/`agb_version` nachziehen | Spalten | keine | NIEDRIG | JA | LIVE |
| `20260808170000_role_guard_insert_fix.sql` | Eigener INSERT-Wächter auf `profiles` | Trigger-Fix | 20260804140000 | NIEDRIG | JA | LIVE |
| `20260808180000_fk_indizes_operativer_kern.sql` | 123 fehlende FK-Indizes nachziehen | Indizes | keine | NIEDRIG (nur Indizes) | JA | LIVE |
| `20260808190000_fehlende_policies.sql` | Policies für 9 Tabellen mit RLS ohne jede Regel | Policies | keine | **HOCH bis Apply** (Tabellen vorher für alle außer service_role komplett zu) | JA | LIVE |
| `20260808200000_einsatzplanung_leistungsnachweise.sql` | Einsatzplanung, Kalender, digitale Leistungsnachweise, Budget-Reservierung | Tabellen + Funktionen (u.a. `get_monthly_closing_overview`) | Phase 3 | MITTEL | JA (`...200001` — **wurde live ausgeführt und danach per `20260814010000` teilweise neu aufgebaut, siehe §5.3**) | LIVE (mit Historie: apply → rollback → re-apply über 814010000) |
| `20260808210000_zahlungen_forderungen_monatsabschluss.sql` | Zahlungseingänge, Mahnwesen, Kassendifferenzen | `payments`, `payment_allocations`, `dunning_entries`, `payment_differences` | 200000 | **HOCH — Datei bricht beim Replay, Namenskollision mit Legacy-`payments`** (§2) | JA (`...210001`) | **UNGEWISS — Live-Drift-Verdacht, siehe §2. Datei muss vor jedem Re-Apply gefixt werden.** |
| `20260808220000_kassenabrechnung_dta_dakota.sql` | Kassenabrechnung + DTA + DAKOTA + Rückläufer + Fehlerprotokolle + Korrekturläufe | `dta_lauf_rechnungen`, `dta_kostentraeger`, `dta_dakota_auftraege`, `dta_ruecklaeufer`, `dta_ruecklaeufer_positionen`, `dta_fehlerprotokoll`, `dta_korrekturlaeufe` + 10 Policies | 210000 (referenziert `abrechnungslaeufe`) | **HOCH — Datei bricht beim Replay, 10 Policies referenzieren nicht-existente `profiles.organization_id`** (§2) | JA (`...220001`) | **UNGEWISS — Live-Drift-Verdacht, siehe §2. Policies müssen vor jedem Re-Apply auf `current_org_id()` umgestellt werden.** |
| `20260809010000_dokumentenmanagement_akten.sql` | Dokumentenmanagement, Kunden-/Mitarbeiterakte, Verträge | `akten_dokumente`, `akten_dokument_versionen`, `akten_vertraege`, weitere | Phase 3 | MITTEL (großes neues Modul) | **NEIN** | AUSSTEHEND |
| `20260809120000_tourenplanung.sql` | Touren/Stopps als Schicht über `assignments` | `tours`, `tour_stops`, `tour_templates` | 200000 (`assignments`) | NIEDRIG (additiv, isoliert) | JA | **AUSSTEHEND** (Memory `tourenplanung-modul`: „wartet auf Live-Apply") |
| `20260810010000_pflegedokumentation.sql` | Pflegedokumentation, Kundenaufnahme, Anamnese, Maßnahmenplan | mehrere neue Tabellen | Phase 3 | MITTEL | **NEIN** | AUSSTEHEND |
| `20260811010000_personalmanagement.sql` | Qualifikationsverwaltung, Dienstplanung, Arbeitszeit, Urlaub | mehrere neue Tabellen | Phase 3 | MITTEL | **NEIN** | AUSSTEHEND |
| `20260812010000_aufgaben_kommunikation.sql` | Aufgabenmanagement, Kommunikation, Eskalationen | `ops_aufgaben`, `ops_ereignis_regeln`, weitere | Phase 3 | MITTEL — **zusätzlich: nicht idempotent** (§5.2, `ops_aufgaben_org_fence` ohne `DROP POLICY IF EXISTS`) | **NEIN** | UNGEWISS (Evidenz für live-Existenz von `ops_aufgaben` vorhanden, s. §2, aber Datei selbst ungetestet reproduzierbar — vor Re-Apply Policy-Fix nötig) |
| `20260813010000_workflow_engine.sql` | Zentrale Event-/Workflow-Engine (WHEN→IF→THEN, Retry/Dead-Letter) | `wf_events`, `wf_audit_log`, `wf_emit_event()`, `wf_process_event()`, `wf_execute_queue_item()`, `wf_process_pending()`, `wf_check_fristen()`, `next_billing_number()` | 220000 (`dta_ruecklaeufer`-Trigger), 010000 (`ops_aufgaben`) | **HOCH — kein GRANT/REVOKE, alle 6 SECURITY-DEFINER-Funktionen waren live für `anon` ausführbar** (Memory `secdef-rpcs-default-privileges`, Fix in 817030000) — **zusätzlich: nicht idempotent** (§5.2) | **NEIN** | **LIVE** — `has_function_privilege('anon', …)` für alle 6 Funktionen live gemessen 09.08.2026; Audit-Event `dta_ruecklaeufer` vom 08.08. beweist aktiven Trigger |
| `20260814010000_leistungsnachweis_haertung.sql` | Stellt durch `20260808200001`-Rollback gelöschte Objekte wieder her (Audit-Tabelle, Integritäts-Trigger, Closing-RPC) | Funktionen, Trigger | 200000 + dessen Rollback `200001` | MITTEL | **NEIN** | UNGEWISS — Datei bricht im Shadow-Replay nur, weil `shadow-db.sh` Rollback-Dateien nie mitspielt (§5.3); ob Production den Rollback 200001 durchlaufen hat, ist unbekannt |
| `20260815010000_profiles_rls_rekursion_und_anon_leck.sql` | 42P17-Rekursion auf `profiles` beseitigen + anon-Leseleck schließen | Policies | keine | **HOCH (Security, betrifft Login-Pfad)** | JA | LIVE (Memory `profiles-rls-42p17-und-anon-leck`: „ist eingespielt") |
| `20260816010000_ereignis_typ_konsistenz.sql` | `ops_ereignis_typ_check` an TS-Union angleichen | Constraint | 812010000 | NIEDRIG | JA | LIVE (Kopfkommentar setzt 812010000 als bereits existent voraus) |
| `20260817010000_sql_exec_rpc_absichern.sql` | P0: `public._run_sql` für `anon` sperren | REVOKE | keine (Alt-Objekt, nicht aus diesem Repo) | **HOCH (P0-Security)** | JA | LIVE (Teil `SECURITY_P0_APPLY.sql`) |
| `20260817020000_audit_probe_zeile_dokumentieren.sql` | Probe-Zeile in `billing_audit_trail` als Systemereignis kennzeichnen | COMMENT/Update Metadaten | 600000 | NIEDRIG | JA | LIVE |
| `20260817030000_secdef_rpc_haertung.sql` | P0: `wf_*`/`next_billing_number` vor `anon` sperren | REVOKE/GRANT | 813010000 | **HOCH (P0-Security)** | JA | LIVE (live per `pg_proc` gemessen) |
| `20260817030002_zusaetzliche_secdef_haertung.sql` | `kassenabrechnung_erlaubt`, `bundesland_fuer_plz`: EXECUTE für anon entziehen | REVOKE | keine | MITTEL | **NEIN** | LIVE (Teil `SECURITY_P0_APPLY.sql`) |
| `20260817040000_bookings_policy_rekursion.sql` | Transitive 42P17-Rekursion über `bookings` beseitigen | Policy-Ersatz | 815010000 | **HOCH (Security, Login-Pfad weiterhin betroffen bis Apply)** | JA | **AUSSTEHEND** (Memory explizit: „wartet auf Apply") |
| `20260818010000_sis_strukturierte_informationssammlung.sql` | SIS — Assessments, 6 Themenfelder, Risikomatrix | mehrere Tabellen | Phase 3 | NIEDRIG (isoliert) | JA | AUSSTEHEND |
| `20260818010000_vitalwerte.sql` | Vitalwerte-Modul (10 Parameter, Grenzwert-Alarme) | `vital_signs`, `vital_sign_thresholds` | Phase 3 | NIEDRIG (isoliert) — **Namenskollision:** identischer Zeitstempel wie SIS-Migration, nur alphabetische Sortierung entscheidet die Reihenfolge | JA | AUSSTEHEND |
| `20260818030000_wunddokumentation.sql` | Wunddokumentation (Expertenstandard) + privater Storage-Bucket | `wounds`, `wound_assessments`, `wound_treatments`, `wound_photos` | Phase 3 | NIEDRIG (isoliert) | JA | AUSSTEHEND |
| `20260819010000_pflegecoach_dipa_modul.sql` | Digitaler PflegeCoach (DiPA nach §40a SGB XI) | `coach_*`-Tabellen | Phase 3 | NIEDRIG (isoliert, eigene Produktgrenze) | JA | AUSSTEHEND |
| `20260819020000_billing_org_fence_haertung.sql` | Explizite org_fence RESTRICTIVE auf `invoices`/`invoice_items`/`invoice_disputes` (Audit-Fund F1) | Policies | Phase 3, 200000 (Billing-Tabellen) | NIEDRIG (idempotent, DROP IF EXISTS) | JA | AUSSTEHEND — im bestehenden Status-Dokument bewusst zurückgehalten „erst nach Gesamt-Review" |
| `20260820010000_medikamentenmanagement.sql` | Medikamentenmanagement (ersetzt `medikamentenplan`) | `medikamente`, `medikament_eingaben` | Phase 3 | NIEDRIG-MITTEL (ersetzt Alt-Tabelle — prüfen ob `medikamentenplan` Live-Daten hat) | JA | AUSSTEHEND |

---

## 4. Sichere Apply-Reihenfolge (AUSSTEHEND + UNGEWISS)

**Vor Phase A: Live-Check.** Erste Aktion, sobald Supabase-MCP verfügbar ist — `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version` UND `SELECT to_regclass('public.dta_ruecklaeufer'), to_regclass('public.ops_aufgaben'), to_regclass('public.payments')` sowie `\d public.payments` / `\d public.profiles`. Das klärt §2 endgültig und macht alles Folgende gegenstandslos oder bestätigt es.

**Phase B — Datei-Fixes (kein Live-Bezug, unabhängig vom Live-Check nötig):**
1. `20260808210000`: `payments`-Tabelle umbenennen (z. B. `zahlungseingaenge`) oder Kollision mit `initial-setup.sql` explizit behandeln (Spalten-Diff prüfen, ggf. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statt `CREATE TABLE IF NOT EXISTS`).
2. `20260808220000`: alle 10 Policies von `SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()` auf `public.current_org_id()` umstellen.
3. `20260812010000` + `20260813010000`: `DROP POLICY IF EXISTS ops_aufgaben_org_fence ON public.ops_aufgaben;` bzw. `DROP POLICY IF EXISTS wf_events_org_fence ON public.wf_events;` (+ die jeweils zweite Policy) vor die `CREATE POLICY`-Statements setzen.
4. `20260813010000`: explizites `REVOKE ALL ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role` für alle 6 Funktionen direkt in dieser Datei ergänzen, statt sich auf die spätere Härtungs-Migration zu verlassen (Verteidigung in der Tiefe — falls `817030000` je isoliert re-appliziert wird).
5. Nach Fix 1–4: `./scripts/shadow-db.sh reset && ./scripts/shadow-db.sh idempotency` — muss 0 Fehler liefern, bevor irgendetwas auf eine echte DB geht.

**Phase C — Apply-Reihenfolge, sobald Datei-Fixes + Live-Check erledigt sind:**

1. `20260705_rls_lockdown_new_mis_modules.sql` (falls Live-Check bestätigt: noch aussteht — 15 offene Tabellen, P0-Charakter)
2. `20260719_booking_request_workflow.sql`, `20260719_angel_availability.sql` (falls Live-Check bestätigt: noch aussteht)
3. `20260817040000_bookings_policy_rekursion.sql` — **höchste Priorität unter den sicher-ausstehenden**, da Login-Pfad betroffen (42P17 transitiv über bookings)
4. `20260819020000_billing_org_fence_haertung.sql` (idempotent, niedriges Risiko, schließt F1)
5. Unabhängige Modul-Gruppe (beliebige Reihenfolge untereinander, je einzeln testbar): `20260818010000_sis_strukturierte_informationssammlung.sql`, `20260818010000_vitalwerte.sql`, `20260818030000_wunddokumentation.sql`, `20260819010000_pflegecoach_dipa_modul.sql`, `20260820010000_medikamentenmanagement.sql` (vorher prüfen: hat `medikamentenplan` Live-Daten, die migriert werden müssen?)
6. Nur falls Live-Check zeigt, dass sie wirklich fehlen: `20260809010000_dokumentenmanagement_akten.sql`, `20260810010000_pflegedokumentation.sql`, `20260811010000_personalmanagement.sql` — unabhängig voneinander
7. `20260808210000`/`20260808220000` (gefixt) NUR anwenden, wenn der Live-Check zeigt, dass die Zieltabellen (`dta_ruecklaeufer` etc.) dort NICHT bereits existieren. Existieren sie bereits: Migration als „bereits erledigt, Repo nachziehen" markieren, NICHT erneut ausführen.
8. `20260812010000_aufgaben_kommunikation.sql`, `20260813010000_workflow_engine.sql`, `20260814010000_leistungsnachweis_haertung.sql` — dieselbe Prüfung wie Schritt 7 (starke Evidenz, dass bereits live).

---

## 5. Staging-Apply-Ergebnis (lokale Shadow-DB, PostgreSQL 16)

`./scripts/shadow-db.sh up` — leere DB, Bootstrap + `initial-setup.sql` + alle 102 Vorwärts-Migrationen in Dateiname-Reihenfolge (Rollbacks und `20260806700000_overhauled_backfill.sql` bewusst übersprungen, siehe Skript-Kommentar).

### 5.1 Erstdurchlauf: 99 OK, 4 FEHLER

| Datei | Fehler | Root Cause |
|---|---|---|
| `20260808210000_zahlungen_forderungen_monatsabschluss.sql` | `column "organization_id" does not exist` (Zeile 58) | Namenskollision mit Legacy-`payments` aus `initial-setup.sql` — siehe §2 |
| `20260808220000_kassenabrechnung_dta_dakota.sql` | `column p.organization_id does not exist` (Zeile 457) | 10 Policies lesen `profiles.organization_id`, das es nicht gibt — siehe §2 |
| `20260813010000_workflow_engine.sql` | `relation "public.dta_ruecklaeufer" does not exist` (Zeile 999) | Kaskadierend: Trigger auf `dta_ruecklaeufer`, dessen `CREATE TABLE` durch den Abbruch von `20260808220000` nie ausgeführt wurde |
| `20260814010000_leistungsnachweis_haertung.sql` | `cannot change return type of existing function` (Zeile 317) | `get_monthly_closing_overview(date)` wechselt von 12 auf 10 Rückgabespalten; Postgres verlangt vor einem Signaturwechsel ein explizites `DROP FUNCTION`. Auf einer frischen DB fehlt dieses DROP, weil es nur in `20260808200001_rollback_einsatzplanung_leistungsnachweise.sql:18` steht — und Rollback-Dateien werden beim Vorwärts-Replay nie mitgespielt (Skript-Konvention, siehe §5.3) |

### 5.2 Idempotenz-Durchlauf (Zweitlauf auf derselben DB): 5 FEHLER

Die 4 oben genannten (erwartungsgemäß, da die Objekte aus Lauf 1 fehlen) **plus 2 neue**:

| Datei | Fehler | Root Cause |
|---|---|---|
| `20260812010000_aufgaben_kommunikation.sql` | `policy "ops_aufgaben_org_fence" for table "ops_aufgaben" already exists` | `CREATE POLICY` ohne vorheriges `DROP POLICY IF EXISTS` — Bruch mit der sonst durchgängigen Projekt-Konvention |
| `20260813010000_workflow_engine.sql` | `policy "wf_events_org_fence" for table "wf_events" already exists` | Gleiches Muster — betrifft Lauf 1 nicht (dort schon vorher an `dta_ruecklaeufer` gescheitert, aber `wf_events` + seine Policy wurden im selben Lauf VOR dem Fehler bereits erfolgreich angelegt) |

**Bedeutung:** Ein Wiederholungslauf nach einem Teil-Fehler (Netzwerkabbruch, Retry) bleibt bei diesen beiden Dateien hängen, selbst wenn ihr inhaltlicher Teil bereits vollständig durchgelaufen war.

### 5.3 Einordnung: welche der 4 Erstdurchlauf-Fehler sind „echt"?

- **`20260808210000`, `20260808220000`**: echte Bugs in der Datei, unabhängig vom Shadow-Tool — würden auf JEDER sauberen Postgres-Instanz mit `initial-setup.sql`-Baseline gleich fehlschlagen. Muss gefixt werden (§4, Phase B).
- **`20260813010000`**: Folgefehler von `20260808220000` — verschwindet automatisch, sobald der Namensfehler in `220000` behoben ist.
- **`20260814010000`**: Grenzfall. Der Fehler ist ein Artefakt der Skript-Konvention „Rollbacks werden nie mitgespielt" — nicht zwingend ein Bug, wenn man annimmt, dass `20260808200001` auf Production tatsächlich gelaufen ist, bevor `20260814010000` erstellt wurde (das erklärt auch den Dateinamen: „Härtung", die genau das wiederherstellt, was der Rollback entfernt hat). Trotzdem ein reales Problem für Desaster-Recovery: **aus dem Repo allein lässt sich aktuell keine korrekte Datenbank mehr from-scratch aufbauen**, ohne diese eine Lücke manuell zu schließen (z. B. ein explizites `DROP FUNCTION IF EXISTS public.get_monthly_closing_overview(date);` direkt vor der `CREATE OR REPLACE FUNCTION` in `20260814010000` ergänzen — macht die Datei robust unabhängig davon, ob der Rollback vorher lief).

---

## 6. Empfehlungen / nächste Schritte

1. **Sobald Supabase-MCP verfügbar ist:** die Live-Check-Query aus §4 fahren. Das ist der mit Abstand höchste Hebel — löst §2 endgültig auf und macht große Teile von §3.2/§4 von „belegt" zu „verifiziert".
2. Die 4 Datei-Fixes aus §4 Phase B umsetzen und lokal mit `shadow-db.sh idempotency` gegenprüfen, unabhängig vom Live-Check-Ergebnis — sie sind so oder so nötig, damit das Repo wieder eine reproduzierbare Quelle der Wahrheit ist.
3. Für die 9 Migrationen ohne Rollback-Datei (§0 Punkt 5) — mindestens für die 5 großen Modul-Migrationen (`20260809010000`, `20260810010000`, `20260811010000`, `20260812010000`, `20260813010000`) — Rollback-Dateien nachziehen, bevor sie live gehen. Ist eine bereits live (wie vermutlich `812010000`/`813010000`), gilt das für die Zukunft trotzdem: ein Rollback-Weg fehlt aktuell komplett.
4. `20260817040000_bookings_policy_rekursion.sql` hat unter den sicher-ausstehenden Migrationen die höchste Priorität (Login-Pfad, P0-Charakter) — unabhängig vom Rest von Phase C vorziehen, sobald der Live-Check sie bestätigt.
5. Zwei ältere Migrationen (`20260705_rls_lockdown_new_mis_modules.sql`, `20260719_booking_request_workflow.sql` + `20260719_angel_availability.sql`) sind laut Memory seit Wochen als „noch nicht live" dokumentiert, ohne dass seither eine Gegen-Bestätigung auftaucht — das könnte echt offen sein oder schlicht nie aktualisiert worden sein. Gezielt im Live-Check mitprüfen, nicht annehmen.

---

*Erstellt 2026-08-10. Shadow-DB-Testergebnis reproduzierbar via `./scripts/shadow-db.sh reset && ./scripts/shadow-db.sh idempotency`.*
