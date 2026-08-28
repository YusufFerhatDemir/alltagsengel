# PFLEGE-SOFTWARE — COMPLETION MATRIX

> **Produkt:** Alltagsengel Pflege-Software (Pflegedienst-Verwaltung, Dokumentation,
> Abrechnung). Liegt technisch im Alltagsengel-Repo, wird hier aber als **eigenes
> Produkt** gemessen — nicht als Teilmenge der Alltagsengel-Plattform.
>
> **Erstellt:** 2026-08-28 · **Grundlage:** Code-Scan (34 Module) **plus** eigene,
> nur lesende Sonden gegen die Produktionsdatenbank
> (`nnwyktkqibdjxgimjyuq.supabase.co`, Lese-Orakel `public._run_sql` mit
> `RAISE`, Transaktion rollt immer zurück) **plus** HTTP-Sonden gegen
> `alltagsengel.care` **plus** vollständige lokale Testläufe.
>
> **Nicht Teil dieses Produkts** und deshalb hier nicht bewertet: die
> Endkunden-Website, ChairMatch, Krankenfahrten, PflegeCoach/DiPA, das
> MIS-Betriebssystem (`/mis`), efy care.

---

## 1. Bewertungsmodell

Die Stufen sind **kumulativ**. Stufe *n* setzt alle darunterliegenden voraus.
Ein Modul, das live läuft, aber keine echten Tests hat, bekommt deshalb **nicht**
DEPLOYED, sondern bleibt bei IMPLEMENTED.

| Stufe | Punkte | Was als Nachweis zählt |
|---|---|---|
| `NOT_STARTED` | 0 | Kein Code. |
| `IMPLEMENTED` | 1 | Code existiert **und ist verdrahtet** — eine Datei ohne Aufrufer zählt nicht. |
| `TESTED` | 2 | Echte automatisierte Tests mit Fachlogik. Ein Quelltext-Grep (`toContain('rateLimit(')`) zählt **nicht**. |
| `DEPLOYED` | 3 | Auf Produktion erreichbar — HTTP-Antwort der Route belegt. |
| `MIGRATION_APPLIED` | 4 | Die DB-Objekte des Moduls sind **live** (Tabelle, Trigger, Constraint, Policy — aus `pg_*` gelesen, nicht aus der Migrationsdatei geschlossen). |
| `PRODUCTION_VERIFIED` | 5 | Ein **tragendes** Element wurde gegen Produktion nachgewiesen: ein Riegel greift, ein Recht fehlt, ein Constraint hält, echte Zeilen liegen vor. |
| `E2E_PROVEN` | 6 | Die **vollständige Kette** ist durchlaufen — in Produktion oder gegen **echtes Postgres** (PGlite). Ein Lauf gegen eine Attrappe zählt hier nicht. |
| `DONE` | 7 | Zusätzlich: **im produktiven Einsatz mit echten Daten**, keine offenen Befunde, kein externer Blocker. |

**Formel:** `Summe erreichter Punkte / (7 × 34 Module) × 100`

### Warum kein einziges Modul DONE ist

Das ist die zentrale ehrliche Aussage dieser Matrix und sie hat **eine** Ursache,
die für fast alle 34 Module gleichzeitig gilt:

> **Die Pflege-Software hat in Produktion noch nie gearbeitet.**

Gemessen, nicht behauptet — Zeilenzahlen aus der Produktionsdatenbank vom
28.08.2026:

| Tabelle | Zeilen | Tabelle | Zeilen | Tabelle | Zeilen |
|---|---:|---|---:|---|---:|
| `pflege_anamnesen` | **0** | `sis_assessments` | **0** | `vital_signs` | **0** |
| `pflege_aufnahmen` | **0** | `sis_themenfelder` | **0** | `vital_sign_thresholds` | **0** |
| `pflege_diagnosen` | **0** | `sis_risikomatrix` | **0** | `wounds` | **0** |
| `pflege_risiken` | **0** | `medikamente` | **0** | `wound_assessments` | **0** |
| `pflege_verlauf` | **0** | `medikament_eingaben` | **0** | `wound_treatments` | **0** |
| `pflege_massnahmen` | **0** | `tours` | **0** | `dienstplan_schichten` | **0** |
| `pflege_massnahmenplaene` | **0** | `tour_stops` | **0** | `dienstplan_eintraege` | **0** |
| `pflege_doku_perioden` | **0** | `personal_arbeitszeiten` | **0** | `absences` | **0** |
| `service_signatures` | **0** | `payments` | **0** | `dunning_entries` | **0** |
| `signaturen` | **0** | `payment_allocations` | **0** | `dunning_documents` | **0** |
| `signatur_dokumente` | **0** | `zahlungseingaenge` | **0** | `camt_imports` | **0** |
| `kim_messages` | **0** | `sgb_v_laeufe` | **0** | `dta_dakota_auftraege` | **0** |
| `monthly_closings` | **0** | `sgb_v_routing` | **0** | `datenannahmestellen` | **0** |
| `invoice_email_log` | **0** | `abrechnung_zertifikate` | **0** | `uebergabe_protokolle` | **0** |

Wo überhaupt Zeilen liegen, sind es die des Pilotbestands:
`clients` 4 · `care_recipients` 8 · `angels` 16 · `caregivers` 2 · `profiles` 64 ·
`assignments` 5 · `service_records` 30 · `invoices` 3 · `invoice_items` 15 ·
`verordnungen` 3 · `client_budgets` 4 · `billing_tariffs` 23 · `leistungspreise` 24 ·
`abrechnungslaeufe` 1 · `medikamentenplan` 1.

**Was das für die Bewertung heißt:** Die Sicherheits- und Strukturlage ist
durchweg live prüfbar und wurde von mir live geprüft — RLS ist überall an, die
Riegel-Trigger stehen, `anon` kommt nirgends hin. Deshalb erreichen viele Module
`PRODUCTION_VERIFIED`. Was fehlt, ist **Benutzung**. Ein Modul, dessen Tabelle
noch nie eine Zeile getragen hat, ist nicht fertig, egal wie grün seine Tests sind.

---

## 2. Was ich selbst gegen Produktion geprüft habe

Diese Sonden sind die Grundlage jeder Vergabe ab Stufe 4.

### 2.1 Strukturprüfung (Lese-Orakel, 310 Tabellen)

**Riegel, die live stehen** (aus `pg_trigger` / `pg_constraint` / `pg_indexes`):

| Riegel | Live-Befund |
|---|---|
| `service_records` — Trigger | 9 Stück, darunter `trg_a_unterschrift_beleg`, `trg_compute_signature_hash`, `trg_sync_record_status`, `trg_check_billing_gate`, `trg_prevent_locked_record` |
| `service_records` — CHECKs | 7, darunter **`service_records_zeitfenster_gueltig`** |
| `pflege_verlauf` | 2 Trigger (Backdating-Sperre) · `prevent_locked_verlauf_edit` in `pg_proc` |
| `sis_assessments` | 2 Trigger · `prevent_locked_sis_edit`, `prevent_locked_sis_child_edit` |
| `wound_*` Kindtabellen | 2 Trigger (Kindsperre) |
| `vital_signs` | 5 CHECK-Constraints (Plausibilität) |
| `medikament_eingaben` | **`uq_medikament_eingaben_gabe`** UNIQUE-Index (Doppelgabe-Sperre) |
| `pflege_massnahmenplaene` | UNIQUE-Index (ein aktiver Plan) |
| `assignments` | 2 Trigger · `check_assignment_overlap` in `pg_proc` |
| `dienstplan_eintraege` | 4 Trigger · `check_doppelbelegung` in `pg_proc` |
| `personal_arbeitszeiten` | 2 Trigger |
| `audit_logs` | 2 Trigger (Unveränderlichkeit) |
| Rechnungsweg | `create_invoice_draft_atomic`, `create_credit_note_atomic`, `prevent_finalized_invoice_mutation`, `validate_invoice_status_transition`, `set_invoice_due_date`, `enforce_tariff_obergrenze` |

**RLS** auf allen geprüften Pflege-/Abrechnungstabellen: `rowsecurity = true`,
mit 3–10 Policies je Tabelle (`service_records` 10, `invoices` 7, `pflege_verlauf` 7,
`tours` 6, `vital_signs` 6).

**Rechtelage:**

* `anon`: **0 INSERT-Rechte** auf allen geprüften Tabellen. Lesend scheitert
  `anon` bei 15 von 16 geprüften Tabellen schon am Recht (HTTP 401,
  meist `42501 permission denied for function current_org_id`).
  Einzige Ausnahme: `dienstplan_eintraege` → HTTP 200 mit **0 Zeilen** — dort
  hängt die Grenze allein an RLS, nicht am Recht.
* `authenticated`: hat auf **allen 12 geprüften** Pflege-/Abrechnungstabellen
  INSERT, UPDATE **und** DELETE. **RLS ist dort die einzige Grenze.**
* SECURITY-DEFINER-Funktionen ohne `search_path`: **0**.
* SECURITY-DEFINER-Funktionen, die `anon` ausführen darf: **0**.

### 2.2 Korrektur an einer bisherigen Ledger-Aussage

Der Track-12-Abschluss hielt zwei Migrationen als *eingecheckt und **nicht**
angewendet* fest. **Beide sind inzwischen live** — von mir aus `pg_*` gelesen,
nicht aus der Datei geschlossen:

| Migration | Erwartet laut Ledger | Live-Befund |
|---|---|---|
| `20261017000000` Abrechnungsintegrität | nicht angewendet | **angewendet** — `trg_a_unterschrift_beleg` da, CHECK `service_records_zeitfenster_gueltig` da, Policy `sr_engel_own` **entfernt** (0 Treffer) |
| `20261017000002` Obergrenze nach Angebotstyp | nicht angewendet | **angewendet** — Spalte `angebotstyp` in `billing_gesetzliche_obergrenzen` da; der Trigger trennt jetzt korrekt: `betreuung_45a`→3000, `demenzbetreuung`→3000, `hauswirtschaft`→**2500**, `einkaufsservice`→**2500** |

Ebenso überholt: die Notiz *„`used_amount` ist live immer 0"*. Live steht
`update_budget_used_amount` auf `rechne_budget_verbrauch_neu`, die
`status IN ('complete','signed','invoiced')` kennt und Stornos ausschließt;
`client_budgets.used_amount` trägt live **3.213,00 €**.

### 2.3 HTTP-Sonden gegen Produktion

| Pfad | Code | Pfad | Code |
|---|---|---|---|
| `/` | 200 | `/api/health` | 200 |
| `/admin` · `/admin/pflegedoku` · `/admin/sis` · `/admin/vitalwerte` · `/admin/medikamente` · `/admin/verordnungen` · `/admin/tourenplanung` · `/admin/dienstplan` · `/admin/kassenabrechnung` · `/admin/mahnwesen` · `/admin/kim` · `/admin/pdl-cockpit` · `/admin/quality` · `/admin/go-live` | **je 307** (Wächter greift) | | |
| `/api/pflege/uebersicht` · `/api/sis/assessments` · `/api/vitals` · `/api/medikamente` · `/api/tours` · `/api/personal/arbeitszeiten` · `/api/leistungsnachweis/crud` · `/api/billing/sgb-v/readiness` · `/api/billing/dta/readiness` · `/api/billing/kim/readiness` · `/api/billing/opos` · `/api/billing/dunning` · `/api/fhir/Patient` · `/api/wounds` · `/api/uebergaben` | **je 401** | | |

Alle 34 Modul-Oberflächen sind deployt und alle sind bewacht. Kein Modul
antwortet unauthentifiziert mit Daten.

### 2.4 Testläufe (alle lokal, vollständig durchgelaufen)

| Lauf | Ergebnis |
|---|---|
| `vitest run` | **7971 grün / 0 rot**, 38 übersprungen · 352 Dateien grün, 1 übersprungen · 780 s |
| `npm run test:unit` (node:test) | **2513 grün / 0 rot**, 286 Suites · 28 s |
| `npm run lint:forbidden` | **0 Treffer** (24.831 Dateien) |
| `npm run lint:route-auth` | **0 Treffer** (413 Route-Dateien, 1407 Dateien) |
| `npm run lint:org-id` | **0 Treffer** (1422 Dateien, 190 Tabellen mit `current_org_id()`-Default) |
| `npm run verify:abrechnung` (live) | **10 von 10 bestanden**, 2 reine Berichte |
| `npm run verify:perimeter` (live) | **8 von 8 bestanden**, 4 Berichte |
| `npm run verify:e2e-ketten` (live) | **PASS 38 / FAIL 0 / SKIP 0** |
| `npm run verify:personalverwaltung` (live) | **13 von 13 erfüllt** |
| `npm run verify:loeschkette` (live) | **8 von 10** — 2 offen, siehe § 5 |
| `npm run verify:profiles-rls` (live) | **2 von 3** — offen ist nur eine veraltete Sollzahl (64 statt 59 Profile), kein Sicherheitsbefund |

**Nicht gelaufen:** `npm run typecheck`. `tsc --noEmit` läuft auf dieser Maschine
mit mehreren Parallel-Sitzungen unbrauchbar langsam. Der Typecheck wird beim
Vercel-Build ausgeführt; hier wird er **nicht** als geprüft ausgegeben.

---

## 3. Modul-Matrix

Legende Nachweisspalte: **L** = live gegen Produktion belegt · **T** = durch
automatisierte Tests belegt · **S** = Stub/Attrappe (bewusst nicht implementiert).

| # | Modul | Stufe | Pkt | Code | Tests (Dateien/Fälle) | Live-Nachweis | Mock/Stub? |
|---:|---|---|---:|---|---|---|---|
| 1 | Klientenverwaltung | `E2E_PROVEN` | 6 | `lib/clients/*`, `app/admin/clients`, `app/admin/kundenakte`, `app/api/admin/clients` | 3 / 42 | L: 4 `clients` + 8 `care_recipients`, Status-CHECK + Pflegegrad-Sync-Trigger live | nein |
| 2 | Mitarbeiter/Engel-Verwaltung | `PRODUCTION_VERIFIED` | 5 | `lib/personal/*` (13 Module), `app/api/personal/*`, `app/admin/personal` | 14 / 184 | L: 16 `angels`, 2 `caregivers`; `verify:personalverwaltung` 13/13 | nein |
| 3 | PDL (Pflegedienstleitung) | `MIGRATION_APPLIED` | 4 | `lib/analytics/pdl-cockpit.ts`, `lib/automation/vitalwerte-pdl.ts` | 4 / 44 | L: Rolle `pdl` in `rollen_matrix()` und `is_internal_staff()` live | **kein eigenes Modul** — nur Kennzahlen-Cockpit über fremde Tabellen |
| 4 | Dienstplanung | `E2E_PROVEN` | 6 | `lib/personal/dienstplan.ts`, `lib/einsatzplanung/*` | 12 / 241 (3 PGlite) | L: `check_doppelbelegung` + 4 Trigger auf `dienstplan_eintraege` | nein |
| 5 | Touren | `PRODUCTION_VERIFIED` | 5 | `lib/touren/*` (6 Module), `app/api/tours/*` | 9 / 142 | L: `tours` RLS an, 6 Policies; Route 401 | nein |
| 6 | Zeiterfassung | `MIGRATION_APPLIED` | 4 | `lib/personal/arbeitszeiten.ts` | **2 / 14** | L: 2 Trigger + `arbeitszeit_verstoesse` live | nein — aber Trigger-Lücke bekannt (s. § 5) |
| 7 | Pflegedokumentation | `PRODUCTION_VERIFIED` | 5 | `lib/pflege/*` (12 Module), `lib/wunden/*`, `app/api/pflege/*` | 20 / 219 (2 PGlite) | L: Sperr-Trigger für Verlauf/Anamnese/Wund-Kindtabellen live | nein |
| 8 | SIS | `PRODUCTION_VERIFIED` | 5 | `lib/sis/*`, `app/api/sis/assessments/*` | 6 / 78 (2 PGlite) | L: `prevent_locked_sis_edit` + Kindsperre live | nein |
| 9 | Maßnahmenplanung | `MIGRATION_APPLIED` | 4 | `lib/pflege/massnahmenplaene.ts`, `massnahmen.ts` | **2 / 23** | L: UNIQUE-Index „ein aktiver Plan" live | nein |
| 10 | Vitalwerte | `PRODUCTION_VERIFIED` | 5 | `lib/vitals/*`, `app/api/vitals/*` | 4 / 73 (1 PGlite) | L: 5 Plausibilitäts-CHECKs live | Grenzwert-Alarme **fail-closed AUS** (MDR-Kill-Switch) |
| 11 | Medikamente | `PRODUCTION_VERIFIED` | 5 | `lib/medikamente/*`, `app/api/medikamente/*` | 4 / 96 (1 PGlite) | L: `uq_medikament_eingaben_gabe` (Doppelgabe-Sperre) live | nein |
| 12 | Verordnungen/HKP | `PRODUCTION_VERIFIED` | 5 | `lib/abrechnung/sgb-v/verordnung-service.ts`, `app/admin/verordnungen` | **1 / 32** | L: 3 `verordnungen` live, RLS an, 5 Policies | nein |
| 13 | Leistungsnachweis | `E2E_PROVEN` | 6 | `lib/leistungsnachweis/*`, `lib/signaturen/*`, `lib/billing/nachweis-beleg.ts` | 18 / 264 (1 PGlite-Kette) | L: 9 Trigger + Zeitfenster-CHECK; `verify:abrechnung` G1/G2 grün | nein — aber **0 Nachweise tragen live eine Unterschrift** |
| 14 | SGB V Abrechnung (§ 302) | `MIGRATION_APPLIED` | 4 | `lib/abrechnung/sgb-v/*` (15 Module) | 12 / 232 | L: `sgb_v_formatversionen` 3 Zeilen, **alle `spec_bestaetigt=false`**; Routing 0 | **JA** — Generator wirft bei jedem Aufruf, `Dakota-/KimAdapter` sind Platzhalter, die werfen. Bewusst: TA1 liegt nicht vor. |
| 15 | SGB XI Abrechnung (§ 105 DTA) | `PRODUCTION_VERIFIED` | 5 | `lib/abrechnung/kassenabrechnung-engine.ts`, `transport.ts` (echtes SFTP), `secon.ts` | 5 / 92 | L: 0 Annahmestellen, 0 Zertifikate, `abrechnung_betriebsmodus` 0 → **Testbetrieb per Default** | nein — Code vollständig, extern gesperrt |
| 16 | Privatleistungen | `E2E_PROVEN` | 6 | `lib/billing/core/*`, `lib/billing/leistungsarten.ts` | 13 / 336 (2 PGlite) | L: **11 verifizierte Privattarife**, 3 Rechnungen (1 paid, 1 sent, 1 disputed), 15 Positionen; Hessen `private_enabled=true` | nein — **einziger heute tragfähiger Umsatzkanal** |
| 17 | § 45b Entlastungsbetrag | `PRODUCTION_VERIFIED` | 5 | `lib/billing/core/budget-cap.ts`, `lib/config/budget-constants.ts` | 9 / 174 (1 PGlite) | L: **11 von 12 § 45b-Tarifen `blocked`**; `used_amount` live 3.213,00 € | nein — aber praktisch **nicht abrechenbar** |
| 18 | Verhinderungspflege (VP/KZP) | `E2E_PROVEN` | 6 | `lib/billing/vpkzp/*` (6 Module) | 9 / 188 (3 PGlite-Ketten) | L: alle 4 § 39-Tarife `blocked`; `client_vpkzp_usage` 0 | nein — abrechenbar erst nach Tarif-Verifizierung |
| 19 | Abrechnung / Monatsabschluss | `E2E_PROVEN` | 6 | `lib/abrechnung/monatsabschluss.ts`, `lib/automation/monatsabschluss-pruefung.ts` | 5 / 95 (4 PGlite) | L: `prevent_finalized_invoice_mutation` + `validate_invoice_status_transition` live | nein |
| 20 | Kassenabrechnung | `PRODUCTION_VERIFIED` | 5 | `lib/abrechnung/readiness.ts`, `stammdaten.ts`, `betriebsmodus.ts`, `app/admin/kassenabrechnung/*` | 4 / 87 | L: `verify:abrechnung` E1+E2 grün — Obergrenzen-Trigger trennt 30 €/25 € korrekt | nein |
| 21 | EDIFACT/DAKOTA-Readiness | `MIGRATION_APPLIED` | 4 | `lib/abrechnung/edifact-*.ts`, `secon.ts`, `slga-parser.ts`, `schluesselverzeichnis.ts` | 8 / 222 | L: `datenannahmestellen` 0, `abrechnung_zertifikate` 0, `dakota_export_enabled` **auf keinem der 96 state_settings-Einträge true** | § 105-Erzeugung + SECON echt; § 302-Adapter Stub |
| 22 | XRechnung | `PRODUCTION_VERIFIED` | 5 | `lib/billing/xrechnung/cii-generator.ts`, `invoice-to-xrechnung.ts`, Route `/api/ops/rechnungen/[id]/xrechnung` | 4 / 61 (1 PGlite) | L: Route deployt, Migration `20260918030000` live | nein — **keine externe EN-16931-Konformitätsprüfung** |
| 23 | ZUGFeRD | `MIGRATION_APPLIED` | 4 | `lib/billing/xrechnung/zugferd-pdf.ts` (pdf-lib, PDF/A-3 + XMP) | **1 / 3** | L: Route `/api/ops/rechnungen/[id]/zugferd` deployt | nein — aber **PDF/A-3-Konformität ist nirgends geprüft**, 3 Testfälle für einen PDF-Generator sind zu dünn |
| 24 | OPOS (Offene Posten) | `E2E_PROVEN` | 6 | `lib/billing/opos/opos-manager.ts`, `lib/billing/camt/*` | 11 / 357 (2 PGlite + CAMT-Kette) | L: `set_invoice_due_date` live; `payments`/`payment_allocations`/`camt_imports` je 0 | nein |
| 25 | Mahnwesen | `E2E_PROVEN` | 6 | `lib/billing/core/dunning.ts`, `lib/billing/dunning/*`, Cron `/api/cron/mahnlauf` | 9 / 223 (3 PGlite-Ketten) | L: alle Mahn-Tabellen 0 Zeilen; CAS-Schutz getestet | nein |
| 26 | Rückläufer | `PRODUCTION_VERIFIED` | 5 | `lib/abrechnung/ruecklaeufer*.ts`, `slga-parser.ts`, `fehlerprotokoll.ts` | 7 / 124 | L: `dta_ruecklaeufer` 0, Fehlercode-Katalog 0 | nein — hängt vollständig an Modul 15/21 |
| 27 | KIM-Readiness | `MIGRATION_APPLIED` | 4 | `lib/kim/*` (15 Module), `app/admin/kim/*` | 9 / 118 | L: `kim_provider_config` 0, `kim_karten` 0, `kim_formatversionen` 1 Zeile **`spec_bestaetigt=false`** | **JA** — nur `MockKimProvider`/`TestKimProvider`; `kim_plus`/`kim_basis` werfen bewusst. Simulierte Zustellungen werden zwangsweise als `kim_simulation` markiert. |
| 28 | ePA / eRezept Readiness | `IMPLEMENTED` | 1 | **kein ePA-, kein eRezept-Code.** Vorhanden ist ausschließlich ein FHIR-R4-Gerüst: `lib/fhir/*`, `app/api/fhir/{Patient,Observation,CarePlan,Encounter,import,export}` | 4 / 58 | L: `fhir_audit_log` 0 Zeilen; Routen 401 | **ePA/eRezept = NOT_STARTED.** Der Punkt steht für die FHIR-Vorarbeit, nicht für Readiness. Keine gematik-Fachdienst-Anbindung, kein VZD, kein Konnektor-Pfad außerhalb von KIM. |
| 29 | QM (Qualitätsmanagement) | `DEPLOYED` | 3 | `lib/analytics/quality.ts`, `lib/analytics/pruefmappe.ts`, `app/admin/quality`, `app/admin/pruefprotokoll` | 3 / 45 | L: Seiten 307, Quellen leer → Dashboards zeigen 0 | **kein QM-Modul im Fachsinn** — Kennzahlen-Dashboard + MDK-Prüfmappe. Kein QM-Handbuch, keine Pflegevisite, kein Beschwerde-Regelkreis. |
| 30 | Audit | `E2E_PROVEN` | 6 | `lib/audit-log.ts` + 9 modulspezifische Audit-Schichten | 9 / 135 | L: `verify:e2e-ketten` Kette 10 grün gegen Produktion — Trigger schreibt, Handschrift wird abgewiesen, Bestand unveränderlich | nein — aber `audit_logs` selbst 0 Zeilen (nur `mis_audit_log` 22, `billing_audit_trail` 12) |
| 31 | Rollen/Berechtigungen | `E2E_PROVEN` | 6 | `lib/auth/rollen.ts`, `rollen-quelle.ts`; DB: `rollen_matrix()`, `is_internal_staff()` | 8 / 159 (2 PGlite) | L: `rollen_matrix()` live inkl. `bonus.verwalten`; alle Admin-Routen 307, alle API-Routen 401; `lint:route-auth` 0 | nein — **MFA ist nicht implementiert** |
| 32 | DSGVO | `PRODUCTION_VERIFIED` | 5 | `lib/dsgvo/loeschkatalog.ts`, `loeschung.ts`, `auskunft.ts`, Cron `/api/cron/konto-loeschung` | 9 / 142 | L: `verify:loeschkette` **8/10** — `account_deletion_tokens` RLS an, 0 Grants | nein — **die Löschautomatik ist live funktionsunfähig** (s. § 5) |
| 33 | Mandantenfähigkeit | `E2E_PROVEN` | 6 | `lib/organizations/*`, `org_fence`-Policies (RESTRICTIVE) | 11 / 161 (2 PGlite) | L: `lint:org-id` 0 bei 190 Tabellen mit `current_org_id()`-Default; `verify:personalverwaltung` 13/13 cross-tenant | nein — `current_org_id()` bleibt fail-open (bewusst) |
| 34 | Production E2E | `PRODUCTION_VERIFIED` | 5 | `__tests__/e2e/*` (11 Ketten), `scripts/verify-*-live.mjs` (30 Skripte) | 40 / 1071 (9 PGlite) | L: `verify:e2e-ketten` 38/38, `verify:abrechnung` 10/10, `verify:perimeter` 8/8 | **Prüfstand echt, Produktionslauf nicht**: kein Kunde hat je unterschrieben, keine Rechnung wurde je versendet (`invoice_email_log` = 0), keine Zahlung ist je eingegangen |

---

## 4. Ergebnis

| | |
|---|---|
| Module | **34** |
| Maximalpunkte | 34 × 7 = **238** |
| Erreichte Punkte | **168** |
| **Fertigstellungsgrad** | **70,6 %** |

### Verteilung

| Stufe | Module | Anzahl |
|---|---|---:|
| `DONE` (7) | — | **0** |
| `E2E_PROVEN` (6) | 1, 4, 13, 16, 18, 19, 24, 25, 30, 31, 33 | **11** |
| `PRODUCTION_VERIFIED` (5) | 2, 5, 7, 8, 10, 11, 12, 15, 17, 20, 22, 26, 32, 34 | **14** |
| `MIGRATION_APPLIED` (4) | 3, 6, 9, 14, 21, 23, 27 | **7** |
| `DEPLOYED` (3) | 29 | **1** |
| `IMPLEMENTED` (1) | 28 | **1** |

### Wie das zu lesen ist

**70,6 % ist keine „fast fertig"-Aussage.** Die Zahl setzt sich aus zwei sehr
ungleichen Hälften zusammen:

* **Stufe 1–5 ist fast überall erreicht** (33 von 34 Modulen). Code, Tests,
  Deploy, Migrationen und die Sicherheitslage sind belastbar und live geprüft.
  10.484 automatisierte Testfälle grün, 0 rot. Das ist die getane Arbeit.
* **Stufe 6 erreichen 11 Module, Stufe 7 kein einziges.** Die letzten beiden
  Stufen sind genau die, die Benutzung verlangen — und Benutzung hat noch nicht
  stattgefunden.

Wer daraus eine Vertriebsaussage bauen will, kann sagen: *die Software ist gebaut
und geprüft*. Er kann **nicht** sagen: *sie ist im Einsatz erprobt*.

---

## 5. Offene Befunde und Blocker

### 5.1 Intern lösbar

| # | Modul | Befund | Nachweis |
|---|---|---|---|
| I-1 | 32 DSGVO | **Die Löschautomatik läuft nicht.** `app.settings.supabase_url` ist in Produktion nicht gesetzt; der eingeplante `pg_cron`-Aufruf baut damit eine NULL-URL und verpufft still. Betroffene Zeilen aktuell 0 — die Kette ist aber tot, nicht nur unbeschäftigt. | `verify:loeschkette` → `FEHL B_cron_url_gesetzt` |
| I-2 | 32 DSGVO | Löschkatalog-Drift: `bookings.angel_id` ist im Katalog als „blockiert" geführt, live ist die FK inzwischen anders gesetzt (Migration `20261016000000`). Der Katalog beschreibt einen Zustand, den es nicht mehr gibt. | `verify:loeschkette` → `FEHL F_blockiert_marken_stimmen` |
| I-3 | 34 Production | **5 Testmandanten in der Produktionsdatenbank**: `E2E_TEST_DEL_ORG_A`, `E2E_TEST_PILOT`, `E2E_TEST_PILOT_ALTLAST_{18e4d51a, aec1f03b, c810d574}`. Von 6 Organisationen sind 5 Testartefakte. | Orakel auf `organizations` |
| I-4 | 16 Privat / 34 | **SEPA-Gläubiger-ID ist der Platzhalter** `DE98ZZZ09999999999` aus der Migration. Ein Lastschrifteinzug damit würde von der Bank abgelehnt. | Orakel auf `organizations`; `lib/go-live/status.ts:89` |
| I-5 | 13 Leistungsnachweis | **Der Manipulationsschutz hat in dieser Datenbank noch nie gegriffen.** Von 30 `service_records` trägt **keiner** `signature_hash` oder `client_signed_at`, `is_locked` ist überall `false` — auch auf den **15 bereits abgerechneten**. Die 15 stammen aus der Zeit vor der Sperre. Ob nachzuunterschreiben, zu stornieren oder als Altbestand zu belassen ist, ist eine Entscheidung nach § 630f BGB und wurde bewusst **nicht** per Backfill vorweggenommen. | `verify:abrechnung` G3 |
| I-6 | 6 Zeiterfassung | Nur **14 Testfälle** für ein Modul, das Arbeitszeitrecht abbildet. Die bekannte Trigger-Lücke (die DB-Sperre greift nur bei `gesperrt→gesperrt`; `gesperrt:false` im selben UPDATE umgeht sie, echte Schranke ist der TypeScript-Guard) ist damit nur einfach abgesichert. | Testzählung; `lib/personal/arbeitszeiten.ts` |
| I-7 | 23 ZUGFeRD | **3 Testfälle** für einen PDF/A-3-Generator, und keine Konformitätsprüfung (weder veraPDF noch ein EN-16931-Validator). Eine Rechnung, die der Empfänger nicht einlesen kann, fällt erst beim Empfänger auf. | Testzählung |
| I-8 | 9 Maßnahmenplanung | 23 Testfälle für die Maßnahmenplanung — dünn für ein Modul, das die Pflegeleistung steuert. | Testzählung |
| I-9 | 12 Verordnungen | **1 Testdatei / 32 Fälle** für HKP-Verordnungen, obwohl live bereits 3 Verordnungen liegen und `verordnung_leistungen` 0 — die Positionsebene ist unbenutzt und ungetestet. | Testzählung + Orakel |
| I-10 | quer | **2 Views ohne `security_invoker`**: `ops_posteingang` und `state_settings_public`, beide für `anon` lesbar. `state_settings_public` ist so gewollt. `ops_posteingang` liefert aktuell 0 Zeilen — die Grenze hängt aber nicht an RLS des Aufrufers, sondern daran, dass die Sicht leer ist. | Orakel `pg_class.reloptions` + anon-Sonde |
| I-11 | 31 Rollen | **MFA ist nicht implementiert.** Für den Pflegebetrieb nicht zwingend, für eine DiPA-Listung Pflicht. | `lib/go-live/status.ts:575` |
| I-12 | 3 PDL, 29 QM | Beide Module sind **Lesesichten auf fremde Tabellen**, kein eigenes Fachmodul. Es gibt keine Pflegevisite, keine Dienstanweisung, kein QM-Handbuch, keinen Beschwerde-Regelkreis. Das ist eine Produktlücke, kein Bug. | Code-Scan |

### 5.2 Extern gesperrt — nicht im Code lösbar

| # | Modul | Blocker | Live-Beleg |
|---|---|---|---|
| E-1 | 17 § 45b | **11 von 12 § 45b-Tarifen stehen auf `blocked`.** Einzig `wegepauschale` (5 €) ist `verified` — und ausgerechnet zu dieser Position hält `lib/billing/obergrenzen.ts` fest, sie sei „ohne PfluV-Grundlage". Zwei Stellen im System sagen Gegenteiliges. Bis zum Anerkennungsbescheid nach § 45a SGB XI ist § 45b praktisch nicht abrechenbar. | Orakel `billing_tariffs` |
| E-2 | 18 VP/KZP | Alle 4 § 39-Tarife `blocked`. Kein VP/KZP-Fall ist heute abrechenbar. | Orakel `billing_tariffs` |
| E-3 | 15/20/21 § 105 DTA | ITSG-Zertifikat fehlt (`abrechnung_zertifikate` = 0), kein SFTP-Zugang (`datenannahmestellen` = 0), `dakota_export_enabled` auf **keinem** der 96 `state_settings`-Einträge `true`, `kassenrechnung_enabled` ebenfalls nirgends. | Orakel |
| E-4 | 14 § 302 SGB V | **Technische Anlage 1 liegt nicht vor** (`sgb_v_formatversionen`: 3 Versionen, alle `spec_bestaetigt=false`). Der Generator wirft deshalb bewusst bei jedem Aufruf — Segmentstrukturen werden **nicht** rekonstruiert. Das ist die richtige Entscheidung: eine erfundene EDIFACT-Struktur wäre eine falsche Forderung gegen eine Krankenkasse. | Orakel + `lib/abrechnung/sgb-v/versand.ts:403` |
| E-5 | 27 KIM | gematik-Zulassung, Provider-Vertrag, Konnektor, SMC-B und Technische Anlage 5 fehlen sämtlich. `kim_formatversionen`: 1 Zeile, `spec_bestaetigt=false`. Der echte Provider wirft bewusst. | Orakel + `lib/kim/provider-factory.ts` |
| E-6 | 28 ePA/eRezept | Nicht begonnen. Setzt E-5 voraus (TI-Zugang) und darüber hinaus ePA-Fachdienst-Anbindung und VZD. | Code-Scan |
| E-7 | 16 Privat | Hessen steht auf `ANTRAG_EINGEREICHT` mit `private_enabled=true` — das ist der **einzige** Eintrag von 96, bei dem irgendetwas freigeschaltet ist. Alle anderen 15 Bundesländer: `VORBEREITUNG`, alles `false`. | Orakel `state_settings` |
| E-8 | 22 XRechnung | Keine externe EN-16931-Konformitätsprüfung durchgeführt (KoSIT-Validator o. ä.). | keine Belegdatei im Repo |
| E-9 | 31 Rollen | Kein Penetrationstest durch Dritte. | `lib/go-live/status.ts:576` |

---

## 6. Was als Nächstes den größten Unterschied macht

Nach Wirkung sortiert, nicht nach Aufwand:

1. **Einen echten Kunden komplett durchlaufen lassen** (Modul 34 → Stufe 6, und
   im Schlepptau 1, 7, 13, 16, 24). Aufnahme → SIS → Maßnahmenplan → Einsatz →
   Leistungsnachweis **mit echter Unterschrift** → Rechnung → Versand → Zahlung.
   Das ist der einzige Schritt, der aus „gebaut" „erprobt" macht. Alles dafür
   Nötige ist live: 11 verifizierte Privattarife, Hessen freigeschaltet,
   Rechnungsweg fail-closed, Budgetdeckel verdrahtet.
2. **`app.settings.supabase_url` setzen bzw. den Löschtakt nach `vercel.json`
   ziehen** (I-1). Eine tote DSGVO-Löschkette ist ein Rechtsrisiko, kein Backlog-Eintrag.
3. **SEPA-Gläubiger-ID beantragen** (I-4) — kostenfrei bei der Bundesbank, und
   ohne sie ist Lastschrift ausgeschlossen.
4. **Die 5 Testmandanten aus der Produktions-DB räumen** (I-3).
5. **ZUGFeRD-Konformität prüfen und Testabdeckung nachziehen** (I-7) — vor dem
   ersten Rechnungsversand an einen Geschäftskunden, nicht danach.
6. **Anerkennungsbescheid § 45a Hessen** (E-1/E-2) — er entriegelt 15 blockierte
   Tarife auf einen Schlag und macht aus zwei Modulen von 5 Punkten je 6–7.

---

## 7. Methodenhinweise

* **Keine Bewertung stammt aus einem Statusdokument.** Wo eine frühere Notiz und
  der Live-Befund auseinandergingen, gilt der Live-Befund; zwei solche Fälle sind
  in § 2.2 ausdrücklich benannt und korrigiert.
* **Migrationsdateien beweisen nichts.** Jede Stufe-4-Vergabe steht auf einer
  Abfrage gegen `pg_trigger`, `pg_constraint`, `pg_indexes`, `pg_policies` oder
  `pg_proc` — nicht auf der Existenz einer `.sql`-Datei.
* **Ein Quelltext-Grep ist kein Test.** Testzahlen in § 3 zählen `it(`/`test(`-Aufrufe
  in echten Testdateien; Statik-Suiten, die nur Dateiinhalte prüfen, sind als
  solche kenntlich (Spalte „Mock/Stub?").
* **Das Lese-Orakel kann nichts schreiben.** `public._run_sql` wird mit einem
  `RAISE EXCEPTION` beendet; die Transaktion rollt immer zurück. Es wurde kein
  DDL ausgeführt und keine Zeile verändert.
* **Der Typecheck fehlt** und wird nicht als grün ausgegeben (§ 2.4).

---

*Erstellt 2026-08-28 · Nächste Fortschreibung sinnvollerweise nach dem ersten
echten Kundendurchlauf — er verschiebt allein rund ein halbes Dutzend Module.*
