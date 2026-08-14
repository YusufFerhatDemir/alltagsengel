# Kassenabrechnung — Readiness-Matrix (14 Bereiche)

**Stand:** 14.08.2026, nachmittags · **Anlass:** Neubewertung nach den Fixes P0-1, H-1, H-2 und M-1 bis M-6.

**Grundlage dieser Fassung:**
- Code-Audit mit Datei:Zeile-Belegen
- Live-Introspektion der Produktions-Datenbank (`service_role`, **ausschließlich lesend**, per
  `pg_catalog`/`information_schema` und `SELECT count(*)`) — kein DDL, kein Schreibzugriff
- `npx tsx scripts/readiness-live.ts` gegen Produktion
- `npm run typecheck` → **0 Fehler** · `npx vitest run` → **2875 bestanden, 0 Fehler**, 38 übersprungen

Für die technische Tiefe zu §105 SGB XI / §302 SGB V / KIM siehe
**[`KASSENABRECHNUNG_FREISCHALTUNG.md`](./KASSENABRECHNUNG_FREISCHALTUNG.md)**,
für den Tarif-Verifizierungsstand **[`TARIF_VERIFIZIERUNG_ZUSTAND.md`](./TARIF_VERIFIZIERUNG_ZUSTAND.md)**.

---

## ⚠ Zentrale Vorbemerkung: Code ≠ Live

Die neun Migrationen der Fixes P0-1, H-1, H-2 und M-1 bis M-6 sind **geschrieben, getestet und
committet — aber NICHT auf Production angewendet**. Das wurde heute live nachgeprüft, nicht
angenommen:

| Fix | Migration | Live-Prüfung | Ergebnis |
|---|---|---|---|
| P0-1 | `20260911000000_fix_check_billing_gate` | `prosrc` von `check_billing_gate` | enthält weiter `kasse_status` → **nicht live** |
| H-1 | `20260911010000_rechnung_unterschriftspflicht` | `prosrc` von `create_invoice_draft_atomic` | ohne `MISSING_SIGNATURE` → **nicht live** (v7 aktiv) |
| H-2 | `20260911020000_vp_kzp_budget_nachberechnung` | `client_budgets.combined_annual_amount` | 2 von 4 Zeilen weiter `0.00` → **nicht live** |
| M-1 | `20260910000000_nachziehen_atomare_billing_rpcs` | `pg_proc` | `validate_correction_atomic`, `create_credit_note_atomic` **fehlen beide** → nicht live |
| M-2 | `20260910010000_audit_logs_unveraenderlich` | `pg_trigger` auf beiden Audit-Tabellen | `KEINE` → nicht live |
| M-3 | `20260910020000_clients_pflegegrad_sync_trigger` | `pg_trigger` auf `clients` | `KEINE` → nicht live |
| M-4 | `20260910030000_service_record_service_type_schutz` | `prosrc` von `prevent_finalized_service_record_mutation` | ohne `service_type` → nicht live |
| M-6 | `20260910040000_zahlungsziel_bestandsrechnungen` | `invoices.payment_terms_days` | **alle 5 Zeilen weiter 30** (Spalten-Default steht bereits auf 14) → nicht live |

M-5 ist kein Code-Fix, sondern ein Konsistenznachweis (72 Tests) und daher nicht Live-abhängig.

**Konsequenz für die Lesart unten:** „INTERN READY" heißt in dieser Matrix *im Repository fertig,
typgeprüft und testgedeckt*. Wo die Wirksamkeit zusätzlich einen Live-Apply braucht, steht das
ausdrücklich dabei — und dieser Apply ist ein manueller Schritt im Supabase-SQL-Editor
(kein MCP / kein `DATABASE_URL` in dieser Umgebung; die Lese-Introspektion oben lief über die
`service_role`-REST-Schnittstelle).

---

## Matrix (14 Bereiche)

| # | Bereich | Status |
|---|---|---|
| 1 | §45b Entlastungsleistungen (131 €/Monat, 1.572 €/Jahr) | ✅ **INTERN READY** |
| 2 | §39 Verhinderungspflege | ✅ **INTERN READY** |
| 3 | VP/KZP kombiniert (3.539 €) | 🟡 **NOCH OFFEN** — Code fertig, Live-Daten fehlerhaft |
| 4 | Budgetinitialisierung und -berechnung | 🟡 **NOCH OFFEN** — Prüfung greift nur an einer Stelle |
| 5 | Leistungsnachweise (Nicht-PRIVAT speicherbar?) | 🟡 **NOCH OFFEN** — live weiter 42703 |
| 6 | Unterschriftskette (proof_status → signed → is_locked) | ✅ **INTERN READY** (live aktiv) |
| 7 | Tarif-Auflösung (billing_tariffs + leistungspreise) | ✅ **INTERN READY** / 🔴 Kassentarife **EXTERN BLOCKIERT** |
| 8 | Rechnungserstellung (`create_invoice_draft_atomic` v8) | 🟡 **NOCH OFFEN** — v8 nicht live |
| 9 | Korrekturen/Storno (`validate_correction_atomic`, `create_credit_note_atomic`) | 🟡 **NOCH OFFEN** — beide RPCs live nicht vorhanden |
| 10 | PDF-Generierung mit DejaVuSans | ✅ **INTERN READY** |
| 11 | OPOS / Zahlung / Mahnwesen | ✅ **INTERN READY** (live unbewiesen: 0 Zahlungen) |
| 12 | Mandantentrennung (`org_fence`) | ✅ **INTERN READY** (191 RESTRICTIVE Policies live) |
| 13 | Audit-Trail (Unveränderlichkeit) | 🟡 **NOCH OFFEN** — 2 von 4 Audit-Tabellen ungeschützt |
| 14 | Rollen / RLS | ✅ **INTERN READY** (RLS auf allen 8 Abrechnungstabellen aktiv) |

**Bilanz:** 7 × INTERN READY · 6 × NOCH OFFEN · 1 × gemischt (7: intern fertig, Kassentarife extern
blockiert). **Fünf der sechs offenen Punkte werden allein durch den Live-Apply der bereits
geschriebenen Migrationen geschlossen** — nur Punkt 4 braucht darüber hinaus eine Entscheidung.

---

## Details je Bereich

### 1. §45b Entlastungsleistungen (131 €/Monat, 1.572 €/Jahr) — INTERN READY

Quelle der Wahrheit: `lib/config/budget-constants.ts` — versioniertes `BUDGET_VERSIONEN`-Array,
ab 01.01.2025 `entlastungMonatlich: 131`, `entlastungJaehrlich: 1572`. Der 2024er Wert (125 €)
bleibt für rückwirkende Berechnungen erhalten (`gueltigBis: '2024-12-31'`). Fail-closed über
`budgetVersionFuerJahr()`: ein Jahr ohne hinterlegten gesetzlichen Wert wirft, statt still den
falschen Satz zu nehmen.

**Live-Beleg:** alle vier `client_budgets`-Zeilen führen `annual_amount = 1572.00`. Der §45b-Zweig
ist damit nicht nur im Code, sondern auch in den Daten korrekt.

Rechtsgrundlage-Mapping in `create_invoice_draft_atomic`: `entlastung → §45b SGB XI`,
`carryover → §45b SGB XI`.

### 2. Verhinderungspflege (§39 SGB XI) — INTERN READY

`budget_type='verhinderung'` durchgängig in `lib/admin/service-records.ts`,
`lib/billing/core/price-resolver.ts`, `lib/billing/core/invoice-engine.ts`; Mapping
`verhinderung → §39 SGB XI`. Referenzwert `vpJaehrlich: 1685` in `budget-constants.ts` — seit
01.07.2025 nur noch informativ, das operative Limit ist das kombinierte Budget (Punkt 3).

Der Code-Pfad ist vollständig; was ihn heute praktisch blockiert, ist Punkt 3 (Anspruch steht bei
zwei Klienten auf 0 €) und Punkt 5 (Kassennachweis nicht speicherbar) — nicht der VP-Code selbst.

### 3. VP/KZP kombiniert (3.539 €) — NOCH OFFEN

Code: `budget-constants.ts` führt `vpKzpKombiniert: 3539` (Vorjahr 3.386 €), §42a-Logik als ein
flexibles Gemeinschaftsbudget seit 01.07.2025. `erstelleInitialBudgets()`
(`lib/budget/auto-budget.ts`) berechnet den Anspruch korrekt ab Pflegegrad 2.

**Live-Befund (heute erneut gemessen, unverändert):**

| Budgetzeile | §45b (`annual_amount`) | §42a (`combined_annual_amount`) |
|---|---|---|
| 1 | 1.572,00 € | **0,00 €** ← fehlt |
| 2 | 1.572,00 € | **0,00 €** ← fehlt |
| 3 | 1.572,00 € | 3.539,00 € |
| 4 | 1.572,00 € | 3.539,00 € |

Zwei von vier Klienten (beide Pflegegrad 2) haben keinen §42a-Anspruch hinterlegt. Die
Korrektur-Migration `20260911020000` ist geschrieben, kommentiert und in
`__tests__/abrechnung/vp-kzp-budget-nachberechnung.test.ts` gegen echtes Postgres (PGlite)
getestet — **aber nicht angewendet**. Bis zum Apply lehnt die Budgetprüfung eine berechtigte
Verhinderungspflege dieser beiden Klienten ab.

Die Migration überschreibt bewusst keinen bereits gepflegten Wert und legt keine Budgetzeile an.

### 4. Budgetinitialisierung und -berechnung — NOCH OFFEN

Zwei getrennte Lücken, beide unabhängig vom Live-Apply:

**a) Kein Nachbewertungs-Pfad außerhalb des Anwendungscodes.** `erstelleInitialBudgets()` wird nur
aus `app/api/admin/clients/route.ts` (Anlage) und `app/api/admin/clients/[id]/pflegegrad/route.ts`
(PG-Änderung) gerufen. Schreibwege daneben — SQL-Editor, Import, Backfill — erzeugen oder ändern
Pflegegrade, ohne dass die Budgetzeile neu bewertet wird. Genau daraus ist der Befund unter Punkt 3
entstanden. M-3 (`20260910020000`) spiegelt `care_level ↔ pflegegrad`, schließt aber die
Budget-Nachbewertung ausdrücklich **nicht** mit ein (siehe Kommentarblock in
`20260911020000`, Abschnitt „ANALYSE FÜR M-3").

**b) Budgetüberschreitung wird bei der Rechnungserstellung nicht geprüft.** Der einzige
Prüfpunkt im Code ist `lib/personal/einsatzfreigabe.ts:141-233` (Einsatzplanung). Weder
`create_invoice_draft_atomic` noch `lib/billing/core/invoice-engine.ts` lesen `client_budgets`.
Das ist als Lücke dokumentiert und mit einem *bewusst positiv formulierten* Test festgehalten:
`__tests__/e2e/go-live-pilot-negativ.test.ts:335-339` („Negativ 8: Budgetüberschreitung wird beim
Rechnungsentwurf NICHT geprüft (dokumentierte Lücke)"). Der DB-Trigger
`trg_update_budget_on_service_record` schreibt `used_amount` fort, verweigert aber nichts.

Für den Privatkunden-Betrieb ist das folgenlos. Für die Kassenabrechnung ist es eine
Entscheidung, die getroffen werden muss (harte Sperre vs. Warnung im Arbeitsvorrat) — kein Fix,
den man ohne fachliche Festlegung nachziehen sollte.

### 5. Leistungsnachweise — kann ein Nicht-PRIVAT-Nachweis gespeichert werden? — NOCH OFFEN

**Nein, live noch nicht.** Der BEFORE-Trigger `trg_check_billing_gate` auf `service_records` ist
live weiterhin an die alte Funktion gebunden, die `state_settings.kasse_status` liest — eine Spalte,
die es in `state_settings` nicht gibt. Jeder INSERT/UPDATE mit `billing_type <> 'PRIVAT'` bricht
mit SQLSTATE 42703 ab.

Live-Beleg heute: `prosrc` von `check_billing_gate` enthält `kasse_status`, nicht `state_flag`.
Bestand in `service_records`: **30 Zeilen, ausnahmslos `PRIVAT` / `ENTWURF`** — genau deshalb ist
der Fehler im Betrieb nie aufgeschlagen.

Der Fix `20260911000000` ist fertig: die Freischaltungsfrage wird an den vorhandenen fail-safen
Helper `public.state_flag(org, land, 'kassenrechnung')` delegiert, mandantenscharf über
`clients.organization_id` + `clients.zip_code`, als `SECURITY DEFINER` mit fixem `search_path` und
entzogenem EXECUTE für `anon`/`authenticated`. Testdeckung:
`__tests__/abrechnung/check-billing-gate.test.ts` (PGlite).

Nach dem Apply ist ein Kassennachweis speicherbar; er wird bis zur Freischaltung als
`billing_status = 'KASSENABRECHNUNG_NOCH_NICHT_FREIGESCHALTET'` geparkt und geht nicht verloren.

### 6. Unterschriftskette (proof_status → signed → is_locked) — INTERN READY, live aktiv

Live nachgewiesen auf `service_records`: `trg_compute_signature_hash`, `trg_prevent_locked_record`,
`trg_sync_record_status`, `trg_service_records_no_finalized_edit`, `trg_audit_service_record`.
Die Kette `ENTWURF → ABGESCHLOSSEN → UNTERSCHRIEBEN` ist in `lib/leistungsnachweis/status-sync.ts`
abgebildet (Mapping `UNTERSCHRIEBEN → signed`), der Signaturweg liegt in
`app/api/leistungsnachweis/crud/route.ts:220-232`, die Oberfläche unter
`/admin/leistungsnachweis-digital`.

**Live-Realität:** 30 Nachweise stehen auf `ENTWURF`, **0 haben einen `signature_hash`**. Die
Mechanik ist scharf, sie ist nur noch nie benutzt worden. Nach dem Apply von H-1 (Punkt 8) sind
diese 30 Nachweise erst nach Signatur fakturierbar — das ist die beabsichtigte Wirkung, keine
Regression.

Offen bleibt hier nur M-4 (`20260910030000`): `service_type` — die Tarifgrundlage — ist nach der
Unterschrift live weiterhin änderbar, weil `prevent_finalized_service_record_mutation` die Spalte
noch nicht schützt.

### 7. Tarif-Auflösung — INTERN READY (Mechanik) / EXTERN BLOCKIERT (Kassentarife)

Live-Zählung heute:

| Tabelle | Zeilen | Status |
|---|---|---|
| `billing_tariffs` | 23 | **11 verified · 8 blocked · 4 unverified** |
| `leistungspreise` | 24 | **24 unverified** |
| `service_pricing` | 10 | dritte Legacy-Tabelle, **kein `tarif_status`** |

Die Fail-Closed-Regel (nur `verified` zählt für Kassentarife) ist an fünf Stellen einheitlich
durchgesetzt — `lib/billing/core/tarif-verifizierung.ts`, `resolvePrice()`,
`create_invoice_draft_atomic`, `correctInvoice()` und DB-Trigger — mit 72 Konsistenztests in
`__tests__/billing/m5-tarif-fail-closed-konsistenz.test.ts`. `zaehle_kassentarife` trägt live den
`verified`-Filter (heute geprüft).

**In dieser Prüfung wurde kein Tarif verifiziert und kein Preis ergänzt.** Alle 12 nicht-verifizierten
Sätze in `billing_tariffs` stehen live auf `3500 ct/Std` — also den bekannten, ungeprüften **35 €/h**:
8 × `blocked` (`wochenendbetreuung`, `demenzbetreuung`, `einkaufsservice`, `hauswirtschaft`,
`nachtbetreuung`, `alltagsbegleitung`, `begleitservice`, `betreuung_45a`) und 4 × `unverified`
(`betreuung_45a`, `hauswirtschaft`, `demenzbetreuung`, `alltagsbegleitung`). Sie bleiben genau so
stehen. Freigabe setzt einen belegten Kassen-/Vergütungsvertrag voraus — ein externer Vorgang.

**Dauerrisiko (kein aktueller Fehler):** `zaehle_kassentarife` existiert dreifach im
Migrationsverlauf (`20260808120000`, `20260808130000` — beide ohne Filter — und `20260831050000`
mit Filter). Die zeitlich letzte gewinnt. Eine künftige Migration, die die RPC erneut ohne Filter
definiert, öffnet die Fail-Closed-Sperre still wieder.

### 8. Rechnungserstellung (`create_invoice_draft_atomic` v8) — NOCH OFFEN

Live läuft **v7** (`20260908000000_leistungsart_tarif_mapping.sql`): Leistungsart-Mapping und
Tarif-Fail-Closed sind aktiv, die Unterschriftspflicht ist es nicht. Live-Beleg: `prosrc` enthält
kein `MISSING_SIGNATURE`.

v8 (`20260911010000`, 638 Zeilen) ergänzt eine Vorabprüfung über alle zu fakturierenden Nachweise:
Rechnung nur, wenn jeder Nachweis `proof_status = 'UNTERSCHRIEBEN'` **oder**
`signature_hash IS NOT NULL` trägt — sonst `RAISE EXCEPTION 'MISSING_SIGNATURE: …'` mit Nennung der
betroffenen Nachweise. Die Regel gilt ausdrücklich auch für Privatrechnungen. Beibehalten:
`MISSING_VALID_TARIFF` und `AMBIGUOUS_TARIFF` als Fail-Closed-Ausgänge, `RAISE` bei unbekanntem
`budget_type` statt stillem NULL.

Testdeckung: `__tests__/abrechnung/rechnung-unterschriftspflicht.test.ts` (PGlite, echtes Postgres).

### 9. Korrekturen / Storno — NOCH OFFEN

**Beide RPCs existieren live nicht** (heute per `pg_proc` geprüft): weder
`validate_correction_atomic` noch `create_credit_note_atomic`. Die gesamte Migration
`20260831010000` war nie angewendet worden; das ist der Befund, der M-1 ausgelöst hat.

Der Anwendungscode ruft beide auf — `lib/billing/core/invoice-engine.ts:766` (Korrektur-
Serialisierung) und `:1103` (Gutschrift) — und fällt bei fehlender Funktion weich zurück. Genau
dieser Zustand ist im Testlauf sichtbar und als solcher festgehalten:
„faellt nur bei fehlender Funktion weich zurueck (Migration noch nicht live)".

Beim Nachziehen wurde ein echter Fehler in der Vorlage gefunden und behoben:
`create_credit_note_atomic` kombinierte `SUM()` mit `FOR UPDATE` (SQLSTATE 0A000) — die Funktion
wäre bei **jedem** Aufruf abgestürzt. Korrigiert in `20260910000000` zu erst
`PERFORM … FOR UPDATE`, dann aggregieren. Beide Funktionen sind `SECURITY DEFINER` mit fixem
`search_path` und `REVOKE ALL` gegen `PUBLIC`/`anon`/`authenticated`.

Live vorhanden sind die Tabellen `billing_audit_trail` und `invoice_corrections`; die
Statusmaschine (`trg_validate_invoice_status`, `trg_audit_invoice_status`,
`trg_invoices_no_finalized_edit`) läuft.

### 10. PDF-Generierung mit DejaVuSans — INTERN READY

`lib/pdf/briefkopf.ts:80-89` lädt `public/fonts/DejaVuSans.ttf` und `DejaVuSans-Bold.ttf` und
**wirft**, wenn die Dateien fehlen — ein stiller Helvetica-Fallback ist ausdrücklich
ausgeschlossen (Helvetica deckt weder türkische Zeichen noch ausreichend Sonderzeichen ab; ğ, ş,
ç, İ würden zu ■). Beide Dateien liegen im Repository.

`next.config.ts:106-111` trägt die beiden TTFs im Bundle-Tracing nach, sonst fehlen sie im
Serverless-Build. Verbraucher: `app/api/admin/invoices/[id]/generate-pdf/route.ts:187-191`,
`app/api/leistungsnachweis/route.ts:221-226`, `lib/abrechnung/leistungsnachweis-pdf.ts:450`.

Testdeckung: `__tests__/abrechnung/rechnung-briefkopf.test.ts:235-242` (Assets existieren, Namen
enthalten „DejaVu", deutsche + türkische Zeichen gedeckt) und
`__tests__/e2e/go-live-pilot-negativ.test.ts:746-779` (kein Helvetica-Fallback).

### 11. OPOS / Zahlung / Mahnwesen — INTERN READY, live unbewiesen

**OPOS:** `createPayment`, `autoMatchPayment` (Scoring), `allocatePayment` mit Überzahlungsschutz,
Org-Fence und optimistischer Sperre (`lib/billing/core/payments.ts`). `autoMatch` ist per Default
`true`; wer selbst zuordnet, muss `autoMatch:false` setzen. `due_date` ist live bei **0 von 5**
Rechnungen NULL — der Trigger `trg_set_invoice_due_date` läuft.

**Offen aus M-6:** alle **5 Bestandsrechnungen** tragen live weiter `payment_terms_days = 30`,
obwohl der fachliche Standard 14 ist (`ZAHLUNGSZIEL_STANDARD_TAGE` in
`lib/billing/core/zahlungsziel.ts`) und der Spalten-Default live bereits auf **14** steht. Neue
Rechnungen bekommen also 14 Tage; die 30 sind Altbestand aus dem früheren Spalten-Default. Die
Bereinigungsmigration `20260910040000` fasst bewusst nur die 3 offenen, unbezahlten Rechnungen an
und lässt die bezahlte und die strittige unverändert (letztere ist nach `dunning.ts` ohnehin
`NICHT_MAHNFAEHIG`). Kein aktiver Fehler, aber die OPOS-Fälligkeiten des Altbestands stehen bis
zum Apply 16 Tage zu spät.

**Mahnwesen:** `lib/billing/core/dunning.ts`, 7 Stufen
(`offen → erinnerung → mahnung_1 → mahnung_2 → letzte_mahnung → inkasso_vorbereitung → bezahlt`),
Fristen 14/28/42/56/70 Tage, Gebühren 2,50 / 5 / 7,50 / 10 €, Blocker für Storno, strittige Posten
und offene Beanstandungen, Batch-Lauf mit Dry-Run. 21 Testfälle in
`__tests__/billing/mahnlauf.test.ts`.

**Live-Realität:** 5 Rechnungen (1 `paid`, 3 `sent`, 1 `disputed`), **0 Zahlungen**. Der
Zahlungsweg ist im Betrieb also noch nie gelaufen. Der frühere P0 in `wf_trigger_zahlung`
(nicht existierendes `NEW.invoice_id`) ist live nicht mehr vorhanden — die aktive Fassung liest
`amount_cents`, `payment_date`, `payment_method`; `trg_wf_zahlung` hängt korrekt auf `payments`.

Offene Konsolidierungsfrage (nicht go-live-relevant): eine zweite Matching-Engine für den
CAMT-Kontoauszug-Import (`lib/billing/matching/matching-engine.ts`) existiert neben dem manuellen
Zahlungsweg.

### 12. Mandantentrennung (`org_fence`) — INTERN READY

Live gezählt: **191 RESTRICTIVE `org_fence`-Policies**. Auf `invoices` liegen
`invoices_org_fence [RESTRICTIVE]` und `invoices_anon_deny [RESTRICTIVE]` über den permissiven
Rollen-Policies; auf `service_records` `service_records_org_fence [RESTRICTIVE]`. RESTRICTIVE
bedeutet: die Fence wird zusätzlich zu jeder permissiven Policy ausgewertet und lässt sich durch
eine großzügige Rollen-Policy nicht aushebeln.

Zu beachten (unverändert, kein Fehler): `current_org_id()` fällt bei fehlender
`organization_members`-Mitgliedschaft auf die Stamm-Organisation zurück — das ist ein
Verfügbarkeits-, kein Trennungsproblem. Die Fence trennt **Mandanten**, niemals Rollen; die
Rollentrennung leisten die permissiven Policies (Punkt 14).

P0-1 (Punkt 5) verbessert die Mandantenschärfe zusätzlich: die alte `check_billing_gate`-Fassung
filterte `state_settings` nur nach Bundesland, obwohl dort `UNIQUE (organization_id, bundesland)`
gilt und live **96 Zeilen** über mehrere Organisationen stehen — die Freischaltung eines fremden
Mandanten hätte den eigenen Nachweis freigeben oder blockieren können.

### 13. Audit-Trail (Unveränderlichkeit) — NOCH OFFEN

Live geschützt:

| Tabelle | UPDATE/DELETE-Sperre live |
|---|---|
| `billing_audit_trail` | ✅ `trg_audit_trail_no_update`, `trg_audit_trail_no_delete` |
| `billing_tariff_audit` | ✅ `trg_immutable_billing_tariff_audit_update/_delete` |
| `assignment_audit_log` | ❌ **keine Trigger** |
| `service_record_audit_log` | ❌ **keine Trigger** |

Die beiden ungeschützten Tabellen sind genau der Gegenstand von M-2 (`20260910010000`) — Migration
geschrieben, nicht angewendet. Die Fassung berücksichtigt, dass beide Fremdschlüssel
`ON DELETE CASCADE` tragen: der DELETE-Trigger lässt den Kaskadenfall durch, sonst würde die
Härtung die DSGVO-Kontolöschung blockieren.

Weitere Audit-Tabellen sind live bereits unveränderlich (`wf_audit_log`, `personal_audit_log`,
`ops_aktivitaetslog`, `ops_eskalationshistorie`, `akten_zugriff_log`, `akten_dokument_versionen`,
`dta_validierungen`, `dta_ruecklaeufer_positionen`, `personal_zeitkorrekturen`).

### 14. Rollen / RLS — INTERN READY

RLS ist live auf **allen acht** abrechnungsrelevanten Tabellen aktiviert: `invoices`,
`invoice_items`, `payments`, `service_records`, `client_budgets`, `billing_tariffs`,
`leistungspreise`, `billing_audit_trail`.

Rollenschichtung am Beispiel `service_records`: `..._admin_all`, `..._caregiver_insert`,
`..._caregiver_read`, `..._caregiver_update`, `..._client_read`, `..._service_all`, `sr_engel_own`,
`sr_client_read` — permissiv, darüber die RESTRICTIVE `org_fence`. Auf `invoices` zusätzlich
`invoices_anon_deny` als RESTRICTIVE Sperre gegen den anonymen Schlüssel.

Views: nur `state_settings_public` läuft ohne `security_invoker` — das ist die bewusst öffentliche
Freischaltungsansicht, kein Leck. Alle übrigen Views tragen `security_invoker`.

---

## Externe Bereiche (unverändert, hier nur zur Vollständigkeit)

Diese vier Bereiche waren nicht Gegenstand der 14 Punkte, gehören aber zur Gesamtabrechnung:

| Bereich | Status |
|---|---|
| §105 SGB XI / DTA-Datenaustausch | Code vollständig · **EXTERN BLOCKIERT** (Zertifikat + SFTP-Zugang), Env-Gate `ITSG_ZERTIFIZIERT` |
| §302 SGB V | Gerüst bewusst gesperrt (`erzeugeSgbVDatei()` wirft immer) · **EXTERN BLOCKIERT** (Technische Anlage 1) |
| ITSG-Zertifizierung | Upload/Validierung vorbereitet · **EXTERN BLOCKIERT** (kostenpflichtiger Vorgang beim Trust Center) |
| Rückläufer-Verarbeitung | Mechanik vollständig · Fehlercode-Katalog live leer (**Absicht** — geratene Codes würden echte Ablehnungen falsch einsortieren) |
| KIM / Telematikinfrastruktur | fail-closed bis TA5 vorliegt · **EXTERN BLOCKIERT**, für den aktuellen Scope nicht blockierend |

### Live-Readiness aus `scripts/readiness-live.ts` (Alltagsengel UG, IK 460629986)

Gesamt **ROT** · Modus `test` · versandbereit `false` · 3 grün / 1 gelb / 11 rot.

**Interne Blocker (4):** Kostenträger-Stammdaten (0 aktiv) · Datenannahmestellen (0) ·
Kostenträger-Routing (0 von 0) · Empfänger-Zertifikate (0 gültig).
Das sind Pflegeaufgaben, keine Code-Lücken — sie brauchen echte Kassendaten bzw. den
Download aus dem öffentlichen ITSG-Verzeichnis.

**Externe Blocker (8):** Kassenabrechnung in **0 von 16** Bundesländern freigeschaltet ·
Anerkennungsbescheid nach §45a fehlt · SECON-Absenderzertifikat · Zertifikatsgültigkeit ·
`SECON_ZERT_PASSWORT` · Übertragungszugang (SFTP/KIM) · Erstversand nie erfolgt ·
DAKOTA-Übermittlung nicht freigeschaltet.

Grün sind: eigene IK-Nummer, Absenderdaten, 11 verifizierte Tarife.
Live sind **96 `state_settings`-Zeilen** hinterlegt, davon **0 mit `insurance_enabled`**.

---

## Was als Nächstes zu tun ist

1. **Live-Apply der neun Migrationen** im Supabase-SQL-Editor, in Dateireihenfolge:
   `20260910000000` → `20260910010000` → `20260910020000` → `20260910030000` →
   `20260910040000` → `20260911000000` → `20260911010000` → `20260911020000`.
   Zu jeder liegt eine `*_rollback_*.sql` daneben. Das schließt die Punkte 3, 5, 8, 9, 13 und den
   M-4-Rest aus Punkt 6.
2. **Nach dem Apply erneut verifizieren** — dieselben Introspektionsabfragen wie oben:
   `check_billing_gate` muss `state_flag` enthalten, `create_invoice_draft_atomic` muss
   `MISSING_SIGNATURE` enthalten, beide Korrektur-RPCs müssen in `pg_proc` stehen,
   `assignment_audit_log`/`service_record_audit_log` müssen Trigger tragen, und die beiden
   §42a-Budgetzeilen müssen auf 3.539,00 € stehen.
3. **Fachliche Entscheidung zu Punkt 4b** (Budgetüberschreitung bei Rechnungserstellung: harte
   Sperre oder Warnung). Ohne diese Entscheidung sollte nichts nachgezogen werden.
4. **Extern beschaffen** — nichts davon ist durch Code herstellbar: §45a-Anerkennungsbescheid,
   ITSG-Zertifikat + Passwort, SFTP-Zugang, Technische Anlage 1 (§302), TA5 (KIM), reale
   Kassen-Fehlercodes, belegte Vergütungsverträge für die `blocked`/`unverified`-Tarife.

---

## Methodische Zusage

Keine Zahl, kein Preis, kein Fehlercode und kein Tarifstatus in diesem Dokument ist geschätzt oder
ergänzt worden. Jede Live-Angabe stammt aus einer lesenden Abfrage gegen die Produktions-Datenbank
vom 14.08.2026; jede Code-Angabe aus der genannten Datei. Wo eine Angabe fehlt, ist sie zu
beschaffen — nicht zu erfinden. Insbesondere wurde in dieser Prüfung **kein Tarif verifiziert**;
die 8 `blocked`-Sätze (35 €/h) bleiben blockiert, die 28 `unverified`-Sätze bleiben unverifiziert.
