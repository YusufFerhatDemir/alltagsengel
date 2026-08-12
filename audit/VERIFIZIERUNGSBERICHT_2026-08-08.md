# Verifizierungsbericht — Vercel-Build-Fix + E2E-Gap-Analyse

**Datum:** 2026-08-08
**Branch:** `staging/expansion-abnahme`
**Basis-Commit bei Beginn:** `cfaaf15`
**HEAD nach Abschluss:** `dd15ca9`
**Supabase Production:** `nnwyktkqibdjxgimjyuq` · Stamm-Org `00000000-0000-4000-8000-000460629986`

---

## 1. Ursache der Vercel-Fehler

**Root Cause: JavaScript-Heap-OOM im webpack-Compile — kein Regress aus Block 11, 12 oder 13.**

Lokal exakt reproduziert:

```
[53326] 427200 ms: Mark-Compact (reduce) 2044.1 (2071.1) -> 2042.0 (2057.6) MB
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
BUILD_EXIT=134
```

Der Abbruch erfolgt bei ~2.044 MB — dem V8-Default-Heap-Limit, das Node aus dem verfügbaren RAM ableitet (8-GB-Builder → ~2 GB). Das ist der Vercel-Standard-Builder.

**Kipppunkt exakt bestimmt** (chronologische Auswertung aller Preview-Deployments):

| Zeit | Commit | Status |
|---|---|---|
| 07.08. 19:51 | `c53d9c7` | success (letzter grüner Preview) |
| 07.08. 20:26 | `cb0af0c` | **failure** |
| … ab hier | alle | failure |

`cb0af0c` ist der DTA/Kassenabrechnung-Block: +10 Admin-Seiten, +10 API-Routen, ~5.200 Zeilen. Damit kompiliert webpack **453 Routen** (262 Pages + 191 API-Routes) und überschreitet die 2-GB-Grenze. Blocks 11–13 liegen auf diesem Commit, haben den Fehler aber nicht verursacht.

**Warum es unentdeckt blieb — zwei irreführende Signale:**

1. **GitHub-Actions-CI war grün.** Der Workflow setzt für den Build-Step explizit `NODE_OPTIONS: '--max-old-space-size=4096'`. Vercel erbt das nicht.
2. **Production-Deployments waren grün.** Der letzte Production-Deploy ist `402563a` vom **07.08. 05:42** — also *vor* dem Kipppunkt. Production hat den neuen Code nie gebaut. Grünes Production war kein Gesundheitsnachweis.

Die Vercel-Build-Logs selbst waren nicht direkt abrufbar (`vercel login` ist interaktiv, kein Token in der Umgebung). Die Ursache wurde stattdessen durch lokale Reproduktion des identischen Fehlerbilds plus Kipppunkt-Analyse bestimmt.

---

## 2. Durchgeführter Fix

Heap-Limit ins `build`-Script selbst, damit es lokal, in CI **und** auf Vercel identisch greift — Vercel-Dashboard-Env war nicht erreichbar:

```json
"build": "NODE_OPTIONS='--max-old-space-size=4096' next build --webpack",
"analyze": "ANALYZE=true NODE_OPTIONS='--max-old-space-size=4096' next build --webpack",
```

Keine Prüfung deaktiviert, kein Fehler unterdrückt, kein `ignoreBuildErrors`. TypeScript, Lint-Gates, Secret-Scan, IK-Check und Forbidden-Strings laufen unverändert.

---

## 3. Vercel-Deployment-Nachweis

**Status: NICHT REAL VERIFIZIERBAR zum Berichtszeitpunkt — Build hängt in der Vercel-Queue.**

- Vercel hat alle vier Commits registriert; Commit-Status für `dd15ca9`: `pending` für *Vercel – alltagsengel* und *Vercel – alltagsengel-deploy*.
- Vercel arbeitet einen Backlog seriell mit ~45 min je Deployment ab. Zwischen 18:45 und 20:49 wurde kein neues Deployment gestartet.
- Der letzte abgeschlossene Preview-Build ist `25c2009` (Block 13, **vor** dem Fix) → erwartungsgemäß `failure`.
- Ein Hintergrund-Monitor pollt den Commit-Status weiter.

**Was stattdessen belegt ist:** der vollständige Production-Build läuft auf dem finalen HEAD `dd15ca9` lokal grün durch — mit demselben Kommando, das Vercel ausführt:

```
✓ Compiled successfully in 11.7min
  Finished TypeScript in 49s
✓ Generating static pages using 7 workers (402/402) in 7.9s
BUILD_EXIT=0
```

Vor dem Fix: Exit 134 (OOM). Nach dem Fix: Exit 0, 402/402 Seiten. Der grüne Vercel-Build ist damit erwartbar, aber **noch nicht bewiesen**.

---

## 4. Production-Smoke-Test

Alle Seiten HTTP 200:

| Code | Pfad |
|---|---|
| 200 | `/`, `/engel-werden`, `/impressum`, `/datenschutz` |
| 200 | `/kunde/home`, `/admin/dashboard` |
| 200 | `/api/client-ip` |

**Aber — zentraler Befund:** alle Billing-/DTA-Routen liefern auf Production **404**:

```
404  /api/billing/monthly-closing
404  /api/billing/dta/config-status
404  /api/billing/dta/dashboard
```

`/admin/dta` rendert die Marketing-Seite + Login, nicht die DTA-Oberfläche. Production fährt `402563a` vom 07.08. — **Blocks 10 bis 13 sind vollständig unveröffentlicht.** Der Smoke-Test bestätigt: Production ist erreichbar und stabil, enthält aber nichts von der geprüften Funktionalität.

---

## 5. Tests / Ergebnisse

| Prüfung | Ergebnis |
|---|---|
| `tsc --noEmit` | **0 Fehler** |
| `vitest run` | **934 passed**, 29 skipped, 0 failed (46 Dateien) |
| `npm run test:unit` (node:test) | **178 passed**, 0 failed (+7 neue Regressionstests) |
| `next build --webpack` | **BUILD_EXIT=0**, 402/402 Seiten |
| `scripts/ci-secret-scan.sh` | clean |
| `scripts/ci-ik-check.sh` | clean — keine hartcodierte IK |
| `npm run lint:forbidden` | 23.020 Dateien, 0 verbotene Strings |
| `scripts/audit-rls.ts` | **3 Verstöße** — bewusst, siehe §8 (P0-1) |

Ein Testfehler wurde beim Start gefunden und war ein **echter Produktionsbug**, keine Testschwäche — siehe §8 (P1-1).

---

## 6. Datenintegrität vorher / nachher

| Tabelle | Vorher | Nachher |
|---|---|---|
| profiles | 59 | 59 |
| clients | 4 | 4 |
| invoices | 5 | 5 |
| service_records | 31 | 31 |
| caregivers | 2 | 2 |
| abrechnungslaeufe | 1 | 1 |
| verordnungen | 3 | 3 |
| client_budgets | 4 | 4 |
| assignments | 5 | 5 |
| leistungspreise | 24 | 24 |
| monthly_closings | 0 | 0 |
| dta_lauf_rechnungen | 0 | 0 |

**Unverändert.** Alle Verifikationsläufe (EDIFACT-Generator, Monatsabschluss) liefen als Dry-Run bzw. rein in-memory ohne Schreibzugriff. Es wurde kein DDL und kein DML auf Production ausgeführt.

---

## 7. E2E-Matrix

Bewertung nach: existiert der Code, ist er über UI/API erreichbar, läuft er gegen echte Daten.

| # | Prozessschritt | Status | Nachweis |
|---|---|---|---|
| 1 | Kundenaufnahme | **FUNKTIONIERT** | `/admin/clients` + `/api/admin/clients`; 4 Kunden live |
| 2 | Vertrag | **FUNKTIONIERT** | `/admin/vertraege` → `/api/akten/vertraege` inkl. `/unterschreiben`; `akten_vertraege` 0 Zeilen (ungenutzt) |
| 3 | Mitarbeiter / Qualifikation | **FUNKTIONIERT** | `/api/personal/qualifikationen[/ablauf]`, `/admin/personal/[id]`; `caregiver_qualifications` 0 Zeilen |
| 4 | Einsatzplanung | **FUNKTIONIERT** | `/api/einsatzplanung` GET/POST mit `pruefeEinsatzfreigabe` + `pruefeBudget`; 5 assignments live |
| 5 | Leistungserfassung | **FUNKTIONIERT** | `/admin/records`, `/admin/records/new`; 31 service_records live |
| 6 | Leistungsnachweis | **FUNKTIONIERT** | `/api/leistungsnachweis` (+`/crud`), PDF-Generator an `/admin/leistungsnachweis/[verordnung_id]` |
| 7 | Signatur / Freigabe | **TEILWEISE** | Code vollständig (SignaturePad, `/api/leistungsnachweis/crud` setzt `proof_status='UNTERSCHRIEBEN'`, Native-Pfad schreibt `service_signatures`). **Real: alle 31 Records `proof_status=ENTWURF`, `service_signatures` 0 Zeilen — nie durchlaufen** |
| 8 | Budgetprüfung | **FUNKTIONIERT** | `pruefeBudget()` in `/api/einsatzplanung` verdrahtet; `client_budgets` 4 Zeilen |
| 9 | Monatsabschluss | **FUNKTIONIERT (nach Fix)** | War **FEHLT**: `erstelleMonatsabschluss()` hatte 0 Aufrufer. `POST /api/billing/monthly-closing` ergänzt; gegen Echtdaten verifiziert (3 Verordnungen, 2 Kostenträger-Gruppen, korrekte Blockierung) |
| 10 | Rechnung | **FUNKTIONIERT** | `invoice-engine`, `/api/billing/invoices/create`, `/auto-invoice`, Storno/Korrektur/Gutschrift/Freeze; 5 invoices live |
| 11 | DTA / EDIFACT | **FUNKTIONIERT (nach Fix)** | War durch 42703 komplett tot. Realer Generatorlauf: 1 Datei, PLGA+PLAA, 23 Segmente, **0 Validierungsfehler**, Betrag korrekt 20525 Cent = 205,25 € |
| 12 | Kostenträger-Routing | **TEILWEISE** | Erkennung für AOK/TK/BARMER/DAK/HEK/KKH/hkk/BKK/IKK/Knappschaft korrekt und getestet. Unbekannte Kassen liefern jetzt `null` statt Fehlrouting. **`dta_kostentraeger` 0 Zeilen** — die Kassenstammdaten sind hardcodiert, nicht datengetrieben |
| 13 | SECON | **FUNKTIONIERT (Krypto)** | Round-Trip-Tests grün (verschlüsseln→entschlüsseln, Signaturprüfung erkennt Manipulation). **`abrechnung_zertifikate` 0 Zeilen — ohne Zertifikat kein Echtbetrieb** |
| 14 | DAKOTA | **TEILWEISE** | Tabelle `dta_dakota_auftraege` existiert, Auftragsdatei wird korrekt erzeugt (`460629986.AUF`), Status bleibt bewusst bei `bereit_zur_uebermittlung` ohne Zugangsdaten. 0 Aufträge |
| 15 | Datenannahmestelle | **TEILWEISE** | Async-DB-Lookup existiert und ist nach dem Fix für **alle** Kassenarten aktiv. **`datenannahmestellen` 0 Zeilen → DB-Pfad greift nie, es zieht immer der Hardcode-Fallback** |
| 16 | Rückläufer | **TEILWEISE** | `lib/abrechnung/ruecklaeufer.ts` (Import/Zuordnung/Erledigt) + `/api/billing/dta/ruecklaeufer` + `/admin/ruecklaeufer` vorhanden; `dta_ruecklaeufer` 0 Zeilen |
| 17 | Automatische Aufgabe | **FEHLT** | `emitEreignis()` wird **nur** von `/api/ops/ereignisse/emittieren` aufgerufen — nicht aus `ruecklaeufer.ts`, `fehlerprotokoll.ts` oder `korrekturlaeufe.ts`. Kein DB-Trigger. Zusätzlich `ops_ereignis_regeln` **0 Zeilen** — es gäbe keine Regel zum Feuern |
| 18 | Korrekturlauf | **TEILWEISE** | `erstelleKorrekturlauf`/`fuehreKorrekturAus`/`ladeKorrekturHistorie` + API + `/admin/korrekturlaeufe`; nie ausgeführt (0 Zeilen) |
| 19 | Erneute Übermittlung | **NICHT REAL VERIFIZIERBAR** | Status `erneut_eingereicht` ist in Engine und Filtern verdrahtet, aber ohne echten Erstversand nicht auslösbar |
| 20 | Zahlungsstatus / OPOS | **FUNKTIONIERT** | `lib/billing/core/payments.ts` + `dunning.ts`, `/api/billing/payments[/allocate]`, `/dunning`, `/differences`; `/admin/forderungen`, `/admin/zahlungseingaenge`. 0 Zahlungen erfasst |
| — | Externer Kassenversand | **NICHT REAL VERIFIZIERBAR** | Kein SFTP-Versand, keine DAKOTA-Übermittlung, keine SECON-Echtlieferung durchgeführt. Keine Kassenquittung erhalten |

### Antworten auf die explizit gestellten Fragen

- **DTA-Export mit realistischen Testdaten ausführbar?** Ja, nach den Fixes. Realer Lauf des echten Generators + Validators erzeugte eine Datei mit 0 Fehlern.
- **Technisch valide Datei?** Ja. UNA/UNB/UNH/FKT/REC/SRD/UST/GES/NAM/UNT, PLGA- und PLAA-Nachricht, 23 Segmente, Validator meldet 0 Fehler. Die 3 Warnungen betreffen meine synthetischen Testdaten (Testdatei-Indikator, IK-Präfix, KVNR-Format).
- **Kostenträger und Datenannahmestelle korrekt?** Kostenträger ja (AOK Hessen `105313145` aus `verordnungen`). Datenannahmestelle strukturell korrekt (ITSCare `105810615`), stammt aber aus dem Hardcode-Fallback.
- **Routing wirklich datengetrieben?** **Nein, faktisch nicht.** Der DB-Pfad ist implementiert, aber `datenannahmestellen` und `dta_kostentraeger` sind leer. Es zieht immer die hardcodierte Tabelle. Vor dem Fix war der DB-Pfad zusätzlich nur für AOK erreichbar.
- **Rückläufer → Aufgabe → Korrektur → erneute Übermittlung?** Rückläufer, Korrektur und Wiedereinreichung sind implementiert; die **automatische Aufgabe fehlt vollständig** (kein Aufruf, keine Regeln).
- **Monatsabschluss vollständig?** Jetzt ja — vorher war die Engine unerreichbar.
- **Mock/Placeholder/TODO in produktionskritischen Pfaden?** Nein. Einziger Treffer: KIM-Transport wirft explizit „noch nicht implementiert" (ehrlich, ab Dez 2026 relevant). Alle übrigen `placeholder`-Treffer sind HTML-Attribute.
- **UI-Seiten ohne Backend?** `/admin/zahlungskontrolle` ist verwaist (P2).
- **Backend ohne Workflow?** `erstelleMonatsabschluss()` — behoben.

---

## 8. Behobene und verbleibende Lücken

### Behoben in dieser Session

**P0-1 — DTA-Kernpfad komplett tot (42703).**
`invoices.period_month` existiert nicht; die Spalten heißen `period_start`/`period_end`. Der Filter `.like('period_month', …)` stand in Pre-Flight, Lauf-Erstellung *und* Export sowie im Dry-Run. Jeder DTA-Aufruf brach ab. → `monatsGrenzen()`.

**P0-2 — Alle Beträge Faktor 100 zu niedrig.**
`invoices.total_amount` und `service_records.amount` stehen in **Euro** (43.50), jede `*_cent`-Spalte und der EDIFACT-Generator erwarten **Cent** (4350). Die Engine übernahm Euro-Werte ungerechnet in `gesamtbetrag_cent`, `dta_lauf_rechnungen.betrag_cent`, den Audit-Trail und die Kassendatei. → `euroZuCent()` mit `Math.round`.

**P1-1 — Rollenbasierte Benachrichtigungen still tot.**
`resolveEmpfaenger()` nutzte `organization_members` mit `profiles!inner(...)`-Embed. Zwischen den Tabellen existiert **kein Foreign Key** → PostgREST liefert PGRST200, der Fehler wurde durch `const { data }` verschluckt, Ergebnis: dauerhaft 0 Empfänger. → Zwei-Schritt-Query + Fehlerprotokollierung.

**P1-2 — Fehlrouting an die falsche Datenannahmestelle.**
`findeDatenannahmestelle()` endete mit einem bedingungslosen `return DATENANNAHMESTELLEN.aok_hessen` und konnte nie `null` liefern. Jede unbekannte Kasse ging still an ITSCare; die Null-Prüfungen im Generator waren toter Code. Zusätzlich erreichte der „DB-first"-Lookup wegen einer verschachtelten Negation nur AOK. → `erkenneKassenSchluessel()`, DB-Lookup für alle Kassenarten.

**P1-3 — Monatsabschluss nicht ausführbar.**
`erstelleMonatsabschluss()` hatte **null Aufrufer**, und `monthly_closings` wird ausschließlich dort geschrieben. → `POST /api/billing/monthly-closing` mit Admin-Guard, `getActiveOrgId()` und `dryRun`.

**P1-4 — DTA-Konfigurationsseite zeigte dauerhaft „keine Läufe".**
`abrechnungslaeufe.created_at` existiert nicht (heißt `erstellt_am`); `laufRes.data ?? []` schluckte den 42703. → korrigiert.

### Offen

**P0-1 (offen) — `profiles`-RLS: Rekursion + verdecktes anon-Leseleck.**
Live gemessen: jeder Nicht-`service_role`-Zugriff auf `profiles` scheitert mit `42P17`. Ursache ist die Alt-Policy `Admin profilleri yönetebilir` mit einer profiles-Subquery in einer profiles-Policy. **Darunter liegen zwei offene SELECT-Policies für die Rolle `public`** (`USING(true)` und `USING(deleted_at IS NULL)`) — sobald die Rekursion fällt, liest jeder unangemeldete Aufrufer alle 59 Profile inkl. E-Mail und Telefon.

Migration `20260815010000_profiles_rls_rekursion_und_anon_leck.sql` schließt beides in **einer** Transaktion (Rollback als `…010001`). **Nicht angewendet:** in dieser Umgebung existiert kein Supabase-Access-Token und kein DB-Passwort — DDL ist von hier aus nicht ausführbar. `scripts/audit-rls.ts` erkennt jetzt beide Muster (Rolle `public` gilt als verboten, plus Rekursions-Check) und meldet die 3 Verstöße; er ist bewusst noch **nicht** in `ci.yml` verdrahtet, weil er bis zum Apply rot bliebe.

**P1-5 (offen) — Rückläufer erzeugt keine automatische Aufgabe.**
Zwei Ebenen: kein `emitEreignis`-Aufruf aus der DTA-Kette, und `ops_ereignis_regeln` ist leer. Bewusst nicht gebaut — es wäre neue Funktionalität, die ohne Rückläuferdaten nicht verifizierbar wäre.

**P1-6 (offen) — Stammdaten für den Echtbetrieb fehlen.**
`datenannahmestellen` 0, `dta_kostentraeger` 0, `abrechnung_zertifikate` 0, und `state_settings.kassenrechnung_enabled = false` für **alle 16 Bundesländer** (Status `VORBEREITUNG`). Ohne diese Daten ist keine Kassenabrechnung möglich, unabhängig vom Code.

**P2-1** — 96 Queries ohne expliziten `organization_id`-Filter im Abrechnungspfad. Stichproben (`/api/billing/dta/[id]`, `auto-invoice`, `dry-run`) zeigen durchgehend das sichere Muster „Parent org-geprüft, Kinder über FK". **Kein bestätigter Cross-Tenant-Leak.** Defense-in-Depth-Nacharbeit sinnvoll; Prüfskript vorhanden.

**P2-2** — `/admin/zahlungskontrolle` ist von keiner Stelle verlinkt.

**P2-3** — Keine generierten Supabase-DB-Typen. Alle vier Spalten-Bugs dieser Session (`period_month`, `created_at`, Euro/Cent, fehlender FK) wären mit `supabase gen types` zur Compile-Zeit aufgefallen.

---

## 9. Commits

| Commit | Inhalt |
|---|---|
| `ccf1307` | Vercel-Build-OOM (Heap-Limit im build-Script) + P1 rollenbasierte Benachrichtigungen |
| `fcd1667` | P0-Migration `profiles`-RLS (Rekursion + anon-Leck) + `audit-rls.ts` erkennt beide Muster |
| `21695db` | 3× P0/P1 im DTA-Kernpfad (`period_month`, Euro/Cent, Routing) + `created_at` + 7 Regressionstests |
| `dd15ca9` | `POST /api/billing/monthly-closing` — Monatsabschluss erreichbar gemacht |

12 Dateien, +551 / −76.

---

## 10. Production-GO / NO-GO

### NO-GO für Kassenabrechnung im Echtbetrieb

Drei voneinander unabhängige Sperren:

1. **P0-1 `profiles`-RLS ist offen.** Production ist in einem Zustand, in dem `profiles` für jeden authentifizierten Client-Zugriff blockiert ist — und die Behebung ohne die begleitenden Policy-Drops ein DSGVO-relevantes Leseleck öffnet. Die Migration liegt bereit und muss von jemandem mit DB-Zugang angewendet werden.
2. **Stammdaten fehlen** (P1-6): keine Datenannahmestelle, kein SECON-Zertifikat, `kassenrechnung_enabled=false` in allen Bundesländern.
3. **Kein externer Versand nachgewiesen.** Es gab keine SFTP-Übertragung, keine DAKOTA-Übermittlung, keine Kassenquittung. Das ist ausdrücklich **NICHT REAL VERIFIZIERBAR** und wird hier nicht behauptet.

### Bedingtes GO für das Deployment des Branches

Der Build ist repariert und lokal vollständig grün (Exit 0, 402/402 Seiten, 1.112 Tests, 0 Typfehler). Vier reale P0/P1-Defekte im Kernpfad sind behoben und durch Regressionstests abgesichert. Der DTA-Export erzeugt nachweislich eine valide Datei mit korrekten Beträgen.

**Vor dem Merge nach `main` zwingend:**
- Grünen Vercel-Preview-Build abwarten (läuft noch in der Queue — aktuell `pending`).
- Migration `20260815010000` auf Production anwenden und mit den drei Prüfschritten am Ende der Datei verifizieren.
- Danach `audit:rls` in `ci.yml` aufnehmen.
